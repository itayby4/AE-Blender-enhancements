"""
PipeFX — Project Understanding tools for DaVinci Resolve.

Provides two tools:
  - scan_timeline:   structural blueprint of the current timeline
  - sample_visuals:  extract representative frames via FFmpeg
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

from ..resolve_connector import (
    NoProjectError,
    NoTimelineError,
    ResolveNotRunningError,
)


def _find_ffmpeg() -> str | None:
    """Find ffmpeg executable on the system."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import static_ffmpeg

        static_ffmpeg.add_paths()
        found = shutil.which("ffmpeg")
        if found:
            return found
    except ImportError:
        pass
    return None


def _safe_int(value, default=0):
    """Safely convert a value to int."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default=0.0):
    """Safely convert a value to float."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _frames_to_seconds(frames, fps):
    """Convert frame count to seconds."""
    if fps <= 0:
        return 0.0
    return round(frames / fps, 3)


def register(mcp, connector):

    @mcp.tool()
    def scan_timeline() -> str:
        """
        Scan the current DaVinci Resolve timeline and return its complete
        structural blueprint: every clip on every track, markers, source media
        info, and edit statistics.

        Use this tool to understand what content is on the timeline before
        making edits. The result is a JSON document describing the full
        timeline structure.

        This is a read-only operation — it does NOT modify anything.
        """
        _log = lambda msg: print(f"[scan_timeline] {msg}", file=sys.stderr, flush=True)

        _log("Starting...")
        try:
            project = connector.get_project()
            timeline = connector.get_timeline()
        except (NoProjectError, NoTimelineError, ResolveNotRunningError) as exc:
            _log(f"ERROR: {exc}")
            return json.dumps({"error": str(exc)})

        _log(f"Connected to project '{project.GetName()}', timeline '{timeline.GetName()}'")

        # ── Timeline-level metadata ──
        fps_str = timeline.GetSetting("timelineFrameRate")
        fps = _safe_float(fps_str, 24.0)
        start_frame = _safe_int(timeline.GetStartFrame())
        end_frame = _safe_int(timeline.GetEndFrame())
        duration_frames = end_frame - start_frame
        duration_seconds = _frames_to_seconds(duration_frames, fps)

        width = timeline.GetSetting("timelineResolutionWidth")
        height = timeline.GetSetting("timelineResolutionHeight")

        _log(f"Timeline: {duration_seconds}s, {fps}fps, {width}x{height}")

        result = {
            "project_name": project.GetName(),
            "timeline_name": timeline.GetName(),
            "duration_seconds": duration_seconds,
            "total_frames": duration_frames,
            "fps": fps,
            "resolution": f"{width}x{height}",
            "start_frame": start_frame,
            "end_frame": end_frame,
            "tracks": {"video": [], "audio": [], "subtitle": []},
            "markers": [],
            "edit_statistics": {},
        }

        # ── Collect clips per track ──
        total_clips = 0
        unique_sources = set()
        all_clip_durations = []

        for track_type in ("video", "audio", "subtitle"):
            track_count = _safe_int(timeline.GetTrackCount(track_type))
            _log(f"Processing {track_count} {track_type} tracks")

            for track_idx in range(1, track_count + 1):
                track_name = timeline.GetTrackName(track_type, track_idx)
                items = timeline.GetItemListInTrack(track_type, track_idx)
                clips_data = []

                if items:
                    _log(f"  {track_type} track {track_idx} ({track_name}): {len(items)} clips")
                    for item_idx, item in enumerate(items):
                        try:
                            clip_start = _safe_int(item.GetStart())
                            clip_end = _safe_int(item.GetEnd())
                            clip_dur_frames = clip_end - clip_start
                            clip_dur_seconds = _frames_to_seconds(clip_dur_frames, fps)

                            clip_info = {
                                "name": item.GetName(),
                                "start_seconds": _frames_to_seconds(
                                    clip_start - start_frame, fps
                                ),
                                "end_seconds": _frames_to_seconds(
                                    clip_end - start_frame, fps
                                ),
                                "duration_seconds": clip_dur_seconds,
                            }

                            # Source media info (via MediaPoolItem) — only for video
                            # to avoid slow IPC on every audio clip
                            if track_type == "video":
                                try:
                                    mpi = item.GetMediaPoolItem()
                                    if mpi:
                                        file_path = mpi.GetClipProperty("File Path")
                                        if file_path:
                                            clip_info["source_file"] = file_path
                                            unique_sources.add(file_path)

                                        src_res = mpi.GetClipProperty("Resolution")
                                        if src_res:
                                            clip_info["source_resolution"] = src_res

                                        src_codec = mpi.GetClipProperty("Video Codec")
                                        if src_codec:
                                            clip_info["source_codec"] = src_codec
                                except Exception:
                                    pass

                            # Clip color label
                            try:
                                color = item.GetClipColor()
                                if color:
                                    clip_info["color_label"] = color
                            except Exception:
                                pass

                            clips_data.append(clip_info)
                            total_clips += 1
                            all_clip_durations.append(clip_dur_seconds)
                        except Exception as clip_err:
                            _log(f"  WARNING: Failed to read clip {item_idx} on {track_type} {track_idx}: {clip_err}")
                            continue

                occupied_seconds = sum(c["duration_seconds"] for c in clips_data)
                utilization = (
                    round((occupied_seconds / duration_seconds) * 100, 1)
                    if duration_seconds > 0
                    else 0
                )

                result["tracks"][track_type].append(
                    {
                        "index": track_idx,
                        "name": track_name or f"{track_type[0].upper()}{track_idx}",
                        "clip_count": len(clips_data),
                        "utilization_percent": utilization,
                        "clips": clips_data,
                    }
                )

        _log(f"Collected {total_clips} clips from {len(unique_sources)} unique sources")

        # ── Markers ──
        try:
            markers = timeline.GetMarkers()
            if markers:
                for frame_id, marker_data in markers.items():
                    marker_seconds = _frames_to_seconds(
                        _safe_int(frame_id) - start_frame, fps
                    )
                    result["markers"].append(
                        {
                            "time_seconds": marker_seconds,
                            "frame": _safe_int(frame_id),
                            "color": marker_data.get("color", ""),
                            "name": marker_data.get("name", ""),
                            "note": marker_data.get("note", ""),
                            "duration_frames": marker_data.get("duration", 0),
                        }
                    )
                _log(f"Found {len(result['markers'])} markers")
        except Exception:
            _log("No markers found or marker access failed")

        # ── Edit statistics ──
        avg_dur = (
            round(sum(all_clip_durations) / len(all_clip_durations), 2)
            if all_clip_durations
            else 0
        )

        # Build track utilization summary
        track_util = {}
        for ttype in ("video", "audio", "subtitle"):
            for t in result["tracks"][ttype]:
                track_util[t["name"]] = f"{t['utilization_percent']}%"

        result["edit_statistics"] = {
            "total_clips": total_clips,
            "total_cuts": max(0, total_clips - 1),
            "average_clip_duration_seconds": avg_dur,
            "unique_source_files": len(unique_sources),
            "track_utilization": track_util,
        }

        # ── Staleness fingerprint (for change detection) ──
        result["_fingerprint"] = (
            f"{total_clips}:{duration_frames}:{len(unique_sources)}"
        )

        _log(f"Done! {total_clips} clips, {duration_seconds}s, fingerprint={result['_fingerprint']}")
        return json.dumps(result, indent=2)

    @mcp.tool()
    def sample_visuals(
        strategy: str = "uniform",
        interval_seconds: int = 10,
        max_frames: int = 20,
    ) -> str:
        """
        Extract representative visual frames from the current DaVinci Resolve
        timeline for AI vision analysis.

        Strategies:
          - "uniform": one frame every `interval_seconds` (default 10s)
          - "at_cuts": one frame shortly after each clip transition
          - "at_markers": one frame at each timeline marker

        Frames are extracted from the original source media files using FFmpeg,
        which is much faster than rendering through DaVinci Resolve. The
        scan_timeline tool is called internally to get clip/source mappings.

        Returns JSON with paths to the extracted frame images.

        Args:
            strategy: Sampling strategy — "uniform", "at_cuts", or "at_markers"
            interval_seconds: Seconds between frames for "uniform" strategy
            max_frames: Maximum number of frames to extract (safety limit)
        """
        _log = lambda msg: print(f"[sample_visuals] {msg}", file=sys.stderr, flush=True)

        _log(f"Starting (strategy={strategy}, max_frames={max_frames})")

        ffmpeg = _find_ffmpeg()
        if not ffmpeg:
            _log("ERROR: FFmpeg not found")
            return json.dumps(
                {
                    "error": "FFmpeg not found. Install FFmpeg and ensure it is on your PATH."
                }
            )

        _log(f"FFmpeg found: {ffmpeg}")

        # Get the timeline structure first
        try:
            project = connector.get_project()
            timeline = connector.get_timeline()
        except (NoProjectError, NoTimelineError, ResolveNotRunningError) as exc:
            _log(f"ERROR: {exc}")
            return json.dumps({"error": str(exc)})

        _log(f"Connected to timeline '{timeline.GetName()}'")

        fps_str = timeline.GetSetting("timelineFrameRate")
        fps = _safe_float(fps_str, 24.0)
        start_frame = _safe_int(timeline.GetStartFrame())
        end_frame = _safe_int(timeline.GetEndFrame())
        duration_seconds = _frames_to_seconds(end_frame - start_frame, fps)

        # Build a list of (timeline_seconds, clip_name) sample points
        sample_points = []

        if strategy == "at_markers":
            try:
                markers = timeline.GetMarkers()
                if markers:
                    for frame_id in sorted(markers.keys()):
                        t = _frames_to_seconds(
                            _safe_int(frame_id) - start_frame, fps
                        )
                        sample_points.append(
                            (t, markers[frame_id].get("name", "marker"))
                        )
            except Exception:
                pass
            if not sample_points:
                return json.dumps(
                    {
                        "error": "No markers found on the timeline. Use 'uniform' or 'at_cuts' strategy instead."
                    }
                )

        elif strategy == "at_cuts":
            # Sample the first frame of each clip on V1 (or the first populated video track)
            video_track_count = _safe_int(timeline.GetTrackCount("video"))
            for track_idx in range(1, video_track_count + 1):
                items = timeline.GetItemListInTrack("video", track_idx)
                if items and len(items) > 0:
                    for item in items:
                        clip_start = _safe_int(item.GetStart())
                        # Sample 0.5s into each clip to avoid black transition frames
                        sample_frame = clip_start + int(fps * 0.5)
                        t = _frames_to_seconds(sample_frame - start_frame, fps)
                        if 0 <= t <= duration_seconds:
                            sample_points.append((t, item.GetName()))
                    break  # Only use the first populated video track

        else:  # "uniform"
            t = 0.0
            while t < duration_seconds:
                sample_points.append((t, f"frame_at_{t:.0f}s"))
                t += interval_seconds

        # Cap at max_frames
        if len(sample_points) > max_frames:
            # Evenly downsample
            step = len(sample_points) / max_frames
            sample_points = [
                sample_points[int(i * step)] for i in range(max_frames)
            ]

        # Build a mapping of timeline seconds → source file + source offset
        # by walking V1 clips
        clip_map = []
        video_track_count = _safe_int(timeline.GetTrackCount("video"))
        for track_idx in range(1, video_track_count + 1):
            items = timeline.GetItemListInTrack("video", track_idx)
            if not items:
                continue
            for item in items:
                clip_start_tl = _frames_to_seconds(
                    _safe_int(item.GetStart()) - start_frame, fps
                )
                clip_end_tl = _frames_to_seconds(
                    _safe_int(item.GetEnd()) - start_frame, fps
                )

                source_file = None
                try:
                    mpi = item.GetMediaPoolItem()
                    if mpi:
                        source_file = mpi.GetClipProperty("File Path")
                except Exception:
                    pass

                # Source start offset — the clip may be trimmed from its source
                try:
                    src_start_offset = _safe_int(item.GetLeftOffset())
                except Exception:
                    src_start_offset = 0

                clip_map.append(
                    {
                        "tl_start": clip_start_tl,
                        "tl_end": clip_end_tl,
                        "source_file": source_file,
                        "src_offset_frames": src_start_offset,
                    }
                )
            if clip_map:
                break  # Only use the first populated video track

        _log(f"Built clip map with {len(clip_map)} entries, {len(sample_points)} sample points")

        # Create output directory
        output_dir = os.path.join(tempfile.gettempdir(), "pipefx_frames")
        os.makedirs(output_dir, exist_ok=True)

        # Clean old frames from previous runs
        for f in os.listdir(output_dir):
            if f.startswith("frame_") and f.endswith(".jpg"):
                try:
                    os.remove(os.path.join(output_dir, f))
                except OSError:
                    pass

        # Extract frames
        _log(f"Extracting {len(sample_points)} frames via FFmpeg...")
        extracted = []
        for idx, (tl_seconds, label) in enumerate(sample_points):
            # Find which clip covers this timeline position
            matched_clip = None
            for cm in clip_map:
                if cm["tl_start"] <= tl_seconds < cm["tl_end"]:
                    matched_clip = cm
                    break

            if not matched_clip or not matched_clip["source_file"]:
                continue

            if not os.path.exists(matched_clip["source_file"]):
                continue

            # Calculate the seek position in the source file
            offset_into_clip = tl_seconds - matched_clip["tl_start"]
            src_seek = (
                _frames_to_seconds(matched_clip["src_offset_frames"], fps)
                + offset_into_clip
            )

            output_path = os.path.join(output_dir, f"frame_{idx:04d}.jpg")

            try:
                cmd = [
                    ffmpeg,
                    "-y",
                    "-ss", str(round(src_seek, 3)),
                    "-i", matched_clip["source_file"],
                    "-vframes", "1",
                    "-q:v", "3",
                    "-vf", "scale=960:-1",  # Resize for efficiency
                    output_path,
                ]
                subprocess.run(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    creationflags=(
                        0x08000000 if os.name == "nt" else 0
                    ),  # CREATE_NO_WINDOW on Windows
                )
            except (subprocess.TimeoutExpired, Exception) as ffmpeg_err:
                _log(f"  Frame {idx} failed: {ffmpeg_err}")
                continue

            if os.path.exists(output_path):
                extracted.append(
                    {
                        "time_seconds": round(tl_seconds, 2),
                        "path": output_path,
                        "clip_name": label,
                    }
                )

        _log(f"Done! Extracted {len(extracted)}/{len(sample_points)} frames")
        return json.dumps(
            {
                "strategy": strategy,
                "interval_seconds": interval_seconds if strategy == "uniform" else None,
                "total_frames": len(extracted),
                "output_directory": output_dir,
                "frames": extracted,
            },
            indent=2,
        )
