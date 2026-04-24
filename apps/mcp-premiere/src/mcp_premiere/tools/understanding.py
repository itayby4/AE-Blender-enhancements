"""
PipeFX — Project Understanding tools for Adobe Premiere Pro.

Provides two tools:
  - scan_timeline:   structural blueprint of the current sequence
  - sample_visuals:  extract representative frames via FFmpeg
"""

import json
import os
import shutil
import subprocess
import tempfile

from ..premiere_connector import PremiereNotRunningError, NoProjectError


# ── Premiere ticks constant ──
TICKS_PER_SECOND = 254016000000


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


def _ticks_to_seconds(ticks):
    """Convert Premiere Pro ticks to seconds."""
    try:
        return round(float(int(ticks)) / TICKS_PER_SECOND, 3)
    except (TypeError, ValueError):
        return 0.0


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def register(mcp, connector):

    @mcp.tool()
    def premiere_scan_timeline() -> str:
        """
        Scan the current Adobe Premiere Pro sequence and return its complete
        structural blueprint: every clip on every track, markers, source media
        info, and edit statistics.

        Use this tool to understand what content is on the timeline before
        making edits. The result is a JSON document describing the full
        timeline structure.

        This is a read-only operation — it does NOT modify anything.
        """
        try:
            app = connector.get_app()
            project = connector.get_project()
            sequence = connector.get_active_sequence()
        except (PremiereNotRunningError, NoProjectError) as exc:
            return json.dumps({"error": str(exc)})

        # ── Sequence-level metadata ──
        try:
            timebase_ticks = int(sequence.timebase)
            fps = round(TICKS_PER_SECOND / timebase_ticks, 3) if timebase_ticks else 24.0
        except (TypeError, ValueError):
            fps = 24.0

        try:
            end_ticks = int(sequence.end)
            duration_seconds = round(end_ticks / TICKS_PER_SECOND, 3)
        except (TypeError, ValueError):
            duration_seconds = 0.0

        # Get resolution via ExtendScript
        try:
            res_script = """
            var seq = app.project.activeSequence;
            var settings = seq.getSettings();
            JSON.stringify({
                width: settings.videoFrameWidth,
                height: settings.videoFrameHeight
            });
            """
            res_raw = connector.eval_qe(res_script)
            res_data = json.loads(str(res_raw)) if res_raw else {}
            resolution = f"{res_data.get('width', '?')}x{res_data.get('height', '?')}"
        except Exception:
            resolution = "unknown"

        result = {
            "project_name": project.name,
            "timeline_name": sequence.name,
            "duration_seconds": duration_seconds,
            "fps": fps,
            "resolution": resolution,
            "tracks": {"video": [], "audio": [], "subtitle": []},
            "markers": [],
            "edit_statistics": {},
        }

        total_clips = 0
        unique_sources = set()
        all_clip_durations = []

        # ── Video tracks ──
        try:
            num_video = sequence.videoTracks.numTracks
        except Exception:
            num_video = 0

        for track_idx in range(num_video):
            try:
                track = sequence.videoTracks[track_idx]
                track_name = track.name if hasattr(track, "name") else f"V{track_idx + 1}"
                clips_data = []

                try:
                    num_clips = track.clips.numItems
                except Exception:
                    num_clips = 0

                for clip_idx in range(num_clips):
                    try:
                        clip = track.clips[clip_idx]
                        clip_start = _ticks_to_seconds(clip.start.ticks)
                        clip_end = _ticks_to_seconds(clip.end.ticks)
                        clip_dur = round(clip_end - clip_start, 3)

                        clip_info = {
                            "name": clip.name,
                            "start_seconds": clip_start,
                            "end_seconds": clip_end,
                            "duration_seconds": clip_dur,
                        }

                        # Source media info
                        try:
                            pi = clip.projectItem
                            if pi:
                                try:
                                    media_path = pi.getMediaPath()
                                    if media_path:
                                        clip_info["source_file"] = media_path
                                        unique_sources.add(media_path)
                                except Exception:
                                    pass

                                try:
                                    clip_info["bin_path"] = pi.treePath
                                except Exception:
                                    pass
                        except Exception:
                            pass

                        clips_data.append(clip_info)
                        total_clips += 1
                        all_clip_durations.append(clip_dur)
                    except Exception:
                        continue

                occupied = sum(c["duration_seconds"] for c in clips_data)
                utilization = (
                    round((occupied / duration_seconds) * 100, 1)
                    if duration_seconds > 0
                    else 0
                )

                result["tracks"]["video"].append(
                    {
                        "index": track_idx + 1,
                        "name": track_name,
                        "clip_count": len(clips_data),
                        "utilization_percent": utilization,
                        "clips": clips_data,
                    }
                )
            except Exception:
                continue

        # ── Audio tracks ──
        try:
            num_audio = sequence.audioTracks.numTracks
        except Exception:
            num_audio = 0

        for track_idx in range(num_audio):
            try:
                track = sequence.audioTracks[track_idx]
                track_name = track.name if hasattr(track, "name") else f"A{track_idx + 1}"
                clips_data = []

                try:
                    num_clips = track.clips.numItems
                except Exception:
                    num_clips = 0

                for clip_idx in range(num_clips):
                    try:
                        clip = track.clips[clip_idx]
                        clip_start = _ticks_to_seconds(clip.start.ticks)
                        clip_end = _ticks_to_seconds(clip.end.ticks)
                        clip_dur = round(clip_end - clip_start, 3)

                        clip_info = {
                            "name": clip.name,
                            "start_seconds": clip_start,
                            "end_seconds": clip_end,
                            "duration_seconds": clip_dur,
                        }

                        try:
                            pi = clip.projectItem
                            if pi:
                                media_path = pi.getMediaPath()
                                if media_path:
                                    clip_info["source_file"] = media_path
                                    unique_sources.add(media_path)
                        except Exception:
                            pass

                        clips_data.append(clip_info)
                        total_clips += 1
                        all_clip_durations.append(clip_dur)
                    except Exception:
                        continue

                occupied = sum(c["duration_seconds"] for c in clips_data)
                utilization = (
                    round((occupied / duration_seconds) * 100, 1)
                    if duration_seconds > 0
                    else 0
                )

                result["tracks"]["audio"].append(
                    {
                        "index": track_idx + 1,
                        "name": track_name,
                        "clip_count": len(clips_data),
                        "utilization_percent": utilization,
                        "clips": clips_data,
                    }
                )
            except Exception:
                continue

        # ── Markers ──
        try:
            markers = sequence.markers
            if markers:
                num_markers = markers.numMarkers
                for i in range(num_markers):
                    try:
                        marker = markers[i]
                        marker_start = _ticks_to_seconds(marker.start.ticks)
                        result["markers"].append(
                            {
                                "time_seconds": marker_start,
                                "name": getattr(marker, "name", ""),
                                "note": getattr(marker, "comments", ""),
                                "color": getattr(marker, "colorIndex", ""),
                            }
                        )
                    except Exception:
                        continue
        except Exception:
            pass

        # ── Edit statistics ──
        avg_dur = (
            round(sum(all_clip_durations) / len(all_clip_durations), 2)
            if all_clip_durations
            else 0
        )

        track_util = {}
        for ttype in ("video", "audio"):
            for t in result["tracks"][ttype]:
                track_util[t["name"]] = f"{t['utilization_percent']}%"

        result["edit_statistics"] = {
            "total_clips": total_clips,
            "total_cuts": max(0, total_clips - 1),
            "average_clip_duration_seconds": avg_dur,
            "unique_source_files": len(unique_sources),
            "track_utilization": track_util,
        }

        # ── Staleness fingerprint ──
        result["_fingerprint"] = (
            f"{total_clips}:{int(duration_seconds * 1000)}:{len(unique_sources)}"
        )

        return json.dumps(result, indent=2)

    @mcp.tool()
    def premiere_sample_visuals(
        strategy: str = "uniform",
        interval_seconds: int = 10,
        max_frames: int = 20,
    ) -> str:
        """
        Extract representative visual frames from the current Adobe Premiere Pro
        sequence for AI vision analysis.

        Strategies:
          - "uniform": one frame every `interval_seconds` (default 10s)
          - "at_cuts": one frame shortly after each clip transition
          - "at_markers": one frame at each sequence marker

        Frames are extracted from the original source media files using FFmpeg,
        which is much faster than rendering through Premiere Pro.

        Returns JSON with paths to the extracted frame images.

        Args:
            strategy: Sampling strategy — "uniform", "at_cuts", or "at_markers"
            interval_seconds: Seconds between frames for "uniform" strategy
            max_frames: Maximum number of frames to extract (safety limit)
        """
        ffmpeg = _find_ffmpeg()
        if not ffmpeg:
            return json.dumps(
                {
                    "error": "FFmpeg not found. Install FFmpeg and ensure it is on your PATH."
                }
            )

        try:
            app = connector.get_app()
            project = connector.get_project()
            sequence = connector.get_active_sequence()
        except (PremiereNotRunningError, NoProjectError) as exc:
            return json.dumps({"error": str(exc)})

        # Get FPS and duration
        try:
            timebase_ticks = int(sequence.timebase)
            fps = round(TICKS_PER_SECOND / timebase_ticks, 3) if timebase_ticks else 24.0
        except (TypeError, ValueError):
            fps = 24.0

        try:
            end_ticks = int(sequence.end)
            duration_seconds_total = round(end_ticks / TICKS_PER_SECOND, 3)
        except (TypeError, ValueError):
            duration_seconds_total = 0.0

        # Build sample points
        sample_points = []

        if strategy == "at_markers":
            try:
                markers = sequence.markers
                if markers:
                    for i in range(markers.numMarkers):
                        marker = markers[i]
                        t = _ticks_to_seconds(marker.start.ticks)
                        name = getattr(marker, "name", f"marker_{i}")
                        sample_points.append((t, name))
            except Exception:
                pass
            if not sample_points:
                return json.dumps(
                    {
                        "error": "No markers found on the sequence. Use 'uniform' or 'at_cuts' strategy instead."
                    }
                )

        elif strategy == "at_cuts":
            try:
                num_video = sequence.videoTracks.numTracks
                for track_idx in range(num_video):
                    track = sequence.videoTracks[track_idx]
                    num_clips = track.clips.numItems
                    if num_clips > 0:
                        for clip_idx in range(num_clips):
                            clip = track.clips[clip_idx]
                            clip_start = _ticks_to_seconds(clip.start.ticks)
                            t = clip_start + 0.5  # 0.5s into the clip
                            if 0 <= t <= duration_seconds_total:
                                sample_points.append((t, clip.name))
                        break  # First populated video track only
            except Exception:
                pass

        else:  # "uniform"
            t = 0.0
            while t < duration_seconds_total:
                sample_points.append((t, f"frame_at_{t:.0f}s"))
                t += interval_seconds

        # Cap at max_frames
        if len(sample_points) > max_frames:
            step = len(sample_points) / max_frames
            sample_points = [
                sample_points[int(i * step)] for i in range(max_frames)
            ]

        # Build clip map from V1
        clip_map = []
        try:
            num_video = sequence.videoTracks.numTracks
            for track_idx in range(num_video):
                track = sequence.videoTracks[track_idx]
                num_clips = track.clips.numItems
                if num_clips > 0:
                    for clip_idx in range(num_clips):
                        clip = track.clips[clip_idx]
                        tl_start = _ticks_to_seconds(clip.start.ticks)
                        tl_end = _ticks_to_seconds(clip.end.ticks)

                        source_file = None
                        try:
                            pi = clip.projectItem
                            if pi:
                                source_file = pi.getMediaPath()
                        except Exception:
                            pass

                        # Premiere in-point (source trim)
                        src_in_seconds = 0.0
                        try:
                            src_in_seconds = _ticks_to_seconds(clip.inPoint.ticks)
                        except Exception:
                            pass

                        clip_map.append(
                            {
                                "tl_start": tl_start,
                                "tl_end": tl_end,
                                "source_file": source_file,
                                "src_in_seconds": src_in_seconds,
                            }
                        )
                    break
        except Exception:
            pass

        # Create output directory
        output_dir = os.path.join(tempfile.gettempdir(), "pipefx_frames")
        os.makedirs(output_dir, exist_ok=True)

        # Clean old frames
        for f in os.listdir(output_dir):
            if f.startswith("frame_") and f.endswith(".jpg"):
                try:
                    os.remove(os.path.join(output_dir, f))
                except OSError:
                    pass

        # Extract frames via FFmpeg
        extracted = []
        for idx, (tl_seconds, label) in enumerate(sample_points):
            matched_clip = None
            for cm in clip_map:
                if cm["tl_start"] <= tl_seconds < cm["tl_end"]:
                    matched_clip = cm
                    break

            if not matched_clip or not matched_clip["source_file"]:
                continue

            if not os.path.exists(matched_clip["source_file"]):
                continue

            offset_into_clip = tl_seconds - matched_clip["tl_start"]
            src_seek = matched_clip["src_in_seconds"] + offset_into_clip

            output_path = os.path.join(output_dir, f"frame_{idx:04d}.jpg")

            try:
                cmd = [
                    ffmpeg,
                    "-y",
                    "-ss", str(round(src_seek, 3)),
                    "-i", matched_clip["source_file"],
                    "-vframes", "1",
                    "-q:v", "3",
                    "-vf", "scale=960:-1",
                    output_path,
                ]
                subprocess.run(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    creationflags=(
                        0x08000000 if os.name == "nt" else 0
                    ),
                )
            except (subprocess.TimeoutExpired, Exception):
                continue

            if os.path.exists(output_path):
                extracted.append(
                    {
                        "time_seconds": round(tl_seconds, 2),
                        "path": output_path,
                        "clip_name": label,
                    }
                )

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
