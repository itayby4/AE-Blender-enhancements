"""
PipeFX ΓÇö Timeline audio export tool for Adobe Premiere Pro.

Extracts audio from the current sequence by reading source media paths
from the timeline and using ffmpeg to extract and mix audio.

This approach bypasses Premiere's exportAsMediaDirect() which is
broken in Premiere Pro 2026 (returns "Unknown Error" for all presets).
Instead, we:
  1. Query all clips on the timeline (audio + video tracks)
  2. Extract audio from each source media file using ffmpeg
  3. Mix all clips into a single mono MP3 suitable for Whisper
"""

import ast
import json
import os
import re
import subprocess
import sys
import tempfile

from typing import Optional
from ..premiere_connector import PremiereNotRunningError, NoProjectError

_log = lambda msg: print(f"[render_audio] {msg}", file=sys.stderr, flush=True)

# Premiere ticks constant
TICKS_PER_SECOND = 254016000000


def _find_ffmpeg() -> str | None:
    """Find the bundled ffmpeg.exe in stools/."""
    # Walk up from this file to find the workspace root
    current = os.path.dirname(os.path.abspath(__file__))
    for _ in range(10):
        candidate = os.path.join(current, "stools", "ffmpeg.exe")
        if os.path.exists(candidate):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None


def _parse_clips_result(raw) -> list[dict]:
    """Parse the ExtendScript result into a Python list of dicts.

    pymiere returns JS objects as Python-repr strings (single quotes),
    so we need ast.literal_eval rather than json.loads.
    """
    if isinstance(raw, list):
        return raw
    s = str(raw).strip()
    if not s or s in ("undefined", "null", ""):
        return []
    try:
        return ast.literal_eval(s)
    except (ValueError, SyntaxError):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return []


def _get_timeline_clips(connector) -> list[dict]:
    """Get all clips with source media paths from the active sequence."""
    gather_script = """
    var seq = app.project.activeSequence;
    var clips = [];

    for (var t = 0; t < seq.audioTracks.numTracks; t++) {
        var track = seq.audioTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var mp = "";
            try { mp = clip.projectItem.getMediaPath() || ""; } catch(e) {}
            if (mp) {
                clips.push({
                    type: "audio",
                    track: t,
                    name: clip.name || "",
                    start: clip.start.ticks,
                    end: clip.end.ticks,
                    inPoint: clip.inPoint.ticks,
                    mediaPath: mp
                });
            }
        }
    }

    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var mp = "";
            try { mp = clip.projectItem.getMediaPath() || ""; } catch(e) {}
            if (mp) {
                clips.push({
                    type: "video",
                    track: t,
                    name: clip.name || "",
                    start: clip.start.ticks,
                    end: clip.end.ticks,
                    inPoint: clip.inPoint.ticks,
                    mediaPath: mp
                });
            }
        }
    }
    JSON.stringify(clips);
    """
    import pymiere
    raw = pymiere.core.eval_script(gather_script)
    return _parse_clips_result(raw)


def register(mcp, connector):
    @mcp.tool()
    def render_timeline_audio(
        start_seconds: Optional[float] = None,
        end_seconds: Optional[float] = None,
    ) -> str:
        """
        Exports the current Premiere Pro sequence's audio to a temporary MP3 file.

        Reads source media paths from timeline clips and uses ffmpeg to extract
        and mix audio into a single mono MP3 optimized for speech transcription.

        Optional 'start_seconds' and 'end_seconds' limit the export
        to a specific time range (in seconds relative to the sequence start).

        Returns the absolute paths to the audio files in a JSON result.
        """
        try:
            return _do_render(connector, start_seconds, end_seconds)
        except Exception as e:
            _log(f"Unhandled error: {e}")
            return json.dumps({"error": f"render_timeline_audio failed: {str(e)}"})


def _do_render(connector, start_seconds, end_seconds) -> str:
    """Core render logic, separated for clean error handling."""
    try:
        app = connector.get_app()
        project = connector.get_project()
        sequence = connector.get_active_sequence()
    except (PremiereNotRunningError, NoProjectError) as exc:
        return json.dumps({"error": str(exc)})

    seq_name = str(sequence.name)
    _log(f"Rendering audio for sequence '{seq_name}'")

    # Find ffmpeg
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        return json.dumps({
            "error": "ffmpeg.exe not found in stools/ directory. "
                     "Please ensure stools/ffmpeg.exe exists in the workspace root."
        })
    _log(f"Using ffmpeg: {ffmpeg}")

    # Calculate time range
    try:
        end_ticks = int(sequence.end)
        total_duration = end_ticks / TICKS_PER_SECOND
    except (TypeError, ValueError):
        total_duration = 0.0

    if total_duration <= 0:
        return json.dumps({"error": "Sequence appears to be empty (duration is 0)."})

    range_start = start_seconds if start_seconds is not None else 0.0
    range_end = end_seconds if end_seconds is not None else total_duration

    if range_start >= range_end:
        return json.dumps({
            "error": f"Invalid time range: start ({range_start}s) >= end ({range_end}s)."
        })

    render_duration = range_end - range_start
    _log(f"Range: {render_duration:.1f}s (from {range_start:.1f}s to {range_end:.1f}s)")

    # Get clips from the timeline
    clips = _get_timeline_clips(connector)
    if not clips:
        return json.dumps({
            "error": "No clips with source media found on the timeline.",
            "suggestion": "Ensure the sequence has audio or video clips with linked media files."
        })

    _log(f"Found {len(clips)} clips on the timeline")

    # Filter clips to those within the requested time range and with existing media
    relevant_clips = []
    seen_paths = set()  # Deduplicate ΓÇö same media file on audio + video track
    for clip in clips:
        clip_start = int(clip['start']) / TICKS_PER_SECOND
        clip_end = int(clip['end']) / TICKS_PER_SECOND
        media_path = clip['mediaPath']

        # Skip if clip doesn't overlap with requested range
        if clip_end <= range_start or clip_start >= range_end:
            continue

        # Skip if media file doesn't exist
        if not os.path.exists(media_path):
            _log(f"  Skipping missing media: {media_path}")
            continue

        # Deduplicate: prefer audio-track version if same file is on both
        dedup_key = (media_path, clip['start'], clip['end'])
        if dedup_key in seen_paths:
            continue
        seen_paths.add(dedup_key)

        relevant_clips.append({
            'media_path': media_path,
            'clip_start': clip_start,
            'clip_end': clip_end,
            'in_point': int(clip['inPoint']) / TICKS_PER_SECOND,
            'name': str(clip['name']),
        })

    if not relevant_clips:
        return json.dumps({
            "error": "No clips with accessible source media found in the requested time range.",
            "suggestion": "Check that media files are online and not missing."
        })

    _log(f"{len(relevant_clips)} relevant clips for the requested range")

    # Prepare output
    temp_dir = tempfile.gettempdir()
    safe_name = re.sub(r"[^A-Za-z0-9_\-\.]", "_", seq_name)
    output_path = os.path.join(temp_dir, f"{safe_name}_audio.mp3")

    # Clean up leftover files
    if os.path.exists(output_path):
        try:
            os.remove(output_path)
        except OSError:
            pass

    # Simple case: single clip ΓÇö extract directly
    if len(relevant_clips) == 1:
        clip = relevant_clips[0]
        # Calculate the ffmpeg seek position within the source file
        source_start = clip['in_point'] + max(0, range_start - clip['clip_start'])
        extract_duration = min(clip['clip_end'], range_end) - max(clip['clip_start'], range_start)

        cmd = [
            ffmpeg,
            "-i", clip['media_path'],
            "-vn",                    # no video
            "-ss", f"{source_start:.3f}",
            "-t", f"{extract_duration:.3f}",
            "-acodec", "libmp3lame",
            "-q:a", "2",              # good quality VBR
            "-ac", "1",               # mono (for speech)
            "-ar", "16000",           # 16kHz (Whisper optimal)
            "-y",                     # overwrite
            output_path
        ]
        _log(f"Extracting audio from single clip: {clip['name']}")
        _log(f"  Source: {clip['media_path']}")
        _log(f"  Seek: {source_start:.1f}s, Duration: {extract_duration:.1f}s")

    else:
        # Multiple clips: extract each to temp, then mix with ffmpeg
        temp_files = []

        for i, clip in enumerate(relevant_clips):
            source_start = clip['in_point'] + max(0, range_start - clip['clip_start'])
            extract_duration = min(clip['clip_end'], range_end) - max(clip['clip_start'], range_start)

            temp_file = os.path.join(temp_dir, f"{safe_name}_clip{i}.wav")
            temp_files.append(temp_file)

            # Extract each clip to individual WAV
            extract_cmd = [
                ffmpeg,
                "-i", clip['media_path'],
                "-vn",
                "-ss", f"{source_start:.3f}",
                "-t", f"{extract_duration:.3f}",
                "-acodec", "pcm_s16le",
                "-ac", "1",
                "-ar", "16000",
                "-y",
                temp_file
            ]
            _log(f"  Extracting clip {i}: {clip['name']} ({extract_duration:.1f}s)")
            result = subprocess.run(extract_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                _log(f"    ffmpeg error: {result.stderr[-200:]}")
                continue

        # Mix all extracted clips
        existing_temps = [f for f in temp_files if os.path.exists(f)]
        if not existing_temps:
            return json.dumps({"error": "Failed to extract audio from any source clip."})

        if len(existing_temps) == 1:
            # Single successful extraction, just convert to MP3
            cmd = [
                ffmpeg,
                "-i", existing_temps[0],
                "-acodec", "libmp3lame",
                "-q:a", "2",
                "-y",
                output_path
            ]
        else:
            # Build amix filter
            inputs = []
            for f in existing_temps:
                inputs.extend(["-i", f])

            n = len(existing_temps)
            mix_inputs = "".join(f"[{i}:a]" for i in range(n))
            filter_str = f"{mix_inputs}amix=inputs={n}:duration=longest"

            cmd = [
                ffmpeg,
                *inputs,
                "-filter_complex", filter_str,
                "-acodec", "libmp3lame",
                "-q:a", "2",
                "-ac", "1",
                "-ar", "16000",
                "-y",
                output_path
            ]

        _log(f"Mixing {len(existing_temps)} clips...")

    # Run ffmpeg
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            _log(f"ffmpeg stderr: {result.stderr[-500:]}")
            return json.dumps({
                "error": f"ffmpeg failed (exit code {result.returncode})",
                "details": result.stderr[-300:] if result.stderr else "No error output"
            })
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "ffmpeg timed out after 300 seconds."})
    except FileNotFoundError:
        return json.dumps({"error": f"ffmpeg not found at: {ffmpeg}"})

    # Verify output
    if not os.path.exists(output_path):
        return json.dumps({
            "error": f"Audio file was not created: {output_path}",
            "suggestion": "Check ffmpeg installation and source media files."
        })

    file_size = os.path.getsize(output_path)
    if file_size == 0:
        try:
            os.remove(output_path)
        except OSError:
            pass
        return json.dumps({
            "error": "Audio file was created but is empty (0 bytes).",
            "suggestion": "The source media may not contain audio."
        })

    _log(f"Done! Exported {file_size} bytes to {output_path}")

    # Clean up temp clip files (if multi-clip path)
    for f in [os.path.join(temp_dir, x) for x in os.listdir(temp_dir)
              if x.startswith(f"{safe_name}_clip") and x.endswith(".wav")]:
        try:
            os.remove(f)
        except OSError:
            pass

    return json.dumps({
        "success": True,
        "audio_chunks": [
            {"path": output_path, "offset_seconds": range_start if start_seconds else 0.0}
        ],
        "message": f"Exported audio ({render_duration:.0f}s) to {output_path}.",
    })
