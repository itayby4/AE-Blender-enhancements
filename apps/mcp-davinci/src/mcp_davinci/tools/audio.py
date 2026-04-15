"""
PipeFX — Timeline audio rendering tool for DaVinci Resolve.

Renders the current timeline's audio to WAV files in chunks,
suitable for passing to speech-to-text APIs (Whisper, etc.).
"""

import json
import os
import re
import sys
import tempfile
import time

from typing import Optional
from ..resolve_connector import NoTimelineError, NoProjectError


_log = lambda msg: print(f"[render_audio] {msg}", file=sys.stderr, flush=True)

# Extensions DaVinci might actually produce when asked for WAV
_EXPECTED_EXTENSIONS = {".wav", ".mov", ".mp4", ".aac", ".flac"}


def _find_rendered_file(directory: str, base_name: str) -> str | None:
    """Find a rendered file by base name, checking only expected audio/video extensions."""
    for ext in _EXPECTED_EXTENSIONS:
        candidate = os.path.join(directory, base_name + ext)
        if os.path.exists(candidate):
            return candidate
    return None


def register(mcp, connector):
    @mcp.tool()
    def render_timeline_audio(
        start_seconds: Optional[float] = None,
        end_seconds: Optional[float] = None,
    ) -> str:
        """
        Renders the current timeline's audio to temporary WAV files.

        Optional 'start_seconds' and 'end_seconds' limit the render
        to a specific time range (in seconds relative to video start).

        Audio is split into 10-minute chunks to keep file sizes manageable.
        Returns the absolute paths to the audio files in a JSON result.
        """
        try:
            project = connector.get_project()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        timeline_name = timeline.GetName()
        _log(f"Rendering audio for timeline '{timeline_name}'")

        temp_dir = tempfile.gettempdir()
        safe_name = re.sub(r"[^A-Za-z0-9_\-\.]", "_", timeline_name)
        file_name = f"{safe_name}_audio"

        # Clear any previous render jobs
        project.DeleteAllRenderJobs()

        # Set render format to WAV/LPCM
        try:
            project.SetCurrentRenderFormatAndCodec("wav", "lpcm")
        except Exception:
            _log("SetCurrentRenderFormatAndCodec not available, falling back to SetRenderSettings")

        # Calculate frame range
        orig_start_f = int(timeline.GetStartFrame())
        orig_end_f = int(timeline.GetEndFrame())

        fps_str = timeline.GetSetting("timelineFrameRate")
        try:
            fps = float(fps_str)
        except (TypeError, ValueError):
            fps = 24.0

        start_f = orig_start_f
        end_f = orig_end_f

        if start_seconds is not None:
            start_f = max(orig_start_f, orig_start_f + int(start_seconds * fps))

        if end_seconds is not None:
            end_f = min(orig_end_f, orig_start_f + int(end_seconds * fps))

        if start_f > end_f:
            return json.dumps({
                "error": f"Invalid time range: start frame {start_f} is after end frame {end_f}."
            })

        total_duration = (end_f - start_f) / fps
        _log(f"Range: {total_duration:.1f}s ({end_f - start_f} frames at {fps}fps)")

        # Split into 10-minute chunks
        frames_per_chunk = int(fps * 60 * 10)
        chunk_jobs = []

        for i, chunk_in in enumerate(range(start_f, end_f + 1, frames_per_chunk)):
            chunk_out = min(chunk_in + frames_per_chunk - 1, end_f)
            chunk_file_name = f"{file_name}_part{i + 1}"
            chunk_path = os.path.join(temp_dir, chunk_file_name + ".wav")

            # Clean up leftover files from previous renders
            old_file = _find_rendered_file(temp_dir, chunk_file_name)
            if old_file:
                try:
                    os.remove(old_file)
                except OSError:
                    pass

            offset_seconds = (chunk_in - start_f) / fps

            settings = {
                "SelectAllFrames": False,
                "MarkIn": chunk_in,
                "MarkOut": chunk_out,
                "CustomName": chunk_file_name,
                "TargetDir": temp_dir,
                "Format": "wav",
                "AudioCodec": "lpcm",
                "ExportVideo": False,
                "ExportAudio": True,
            }
            project.SetRenderSettings(settings)
            time.sleep(0.1)
            project.AddRenderJob()

            job_list = project.GetRenderJobList()
            if not job_list:
                return json.dumps({"error": f"Failed to add render job for chunk {i + 1}."})

            job_id = job_list[-1]["JobId"]
            chunk_jobs.append({
                "job_id": job_id,
                "path": chunk_path,
                "file_name": chunk_file_name,
                "offset_seconds": offset_seconds,
            })

        _log(f"Created {len(chunk_jobs)} render jobs, starting render...")

        # Start all jobs
        if not project.StartRendering():
            return json.dumps({"error": "Failed to start rendering."})

        # Wait for completion
        while True:
            time.sleep(1)
            all_done = True
            for cj in chunk_jobs:
                status = project.GetRenderJobStatus(cj["job_id"])
                if not status:
                    continue
                job_status = status.get("JobStatus", "")
                if job_status == "Failed":
                    return json.dumps({"error": f"Render failed for chunk '{cj['file_name']}'."})
                if job_status == "Rendering":
                    all_done = False
            if all_done:
                break

        _log("Render complete, verifying output files...")

        # Verify output files exist (DaVinci may use a different extension)
        for cj in chunk_jobs:
            if os.path.exists(cj["path"]):
                continue

            actual_file = _find_rendered_file(temp_dir, cj["file_name"])
            if not actual_file:
                return json.dumps({"error": f"Rendered file not found for chunk: {cj['file_name']}"})

            _log(f"DaVinci rendered as {os.path.splitext(actual_file)[1]} instead of .wav")
            cj["path"] = actual_file

        _log(f"Done! {len(chunk_jobs)} audio chunks ready.")
        return json.dumps({
            "success": True,
            "audio_chunks": [
                {"path": c["path"], "offset_seconds": c["offset_seconds"]}
                for c in chunk_jobs
            ],
            "message": f"Rendered {len(chunk_jobs)} audio chunks ({total_duration:.0f}s total).",
        })
