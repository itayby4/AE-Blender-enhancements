import json
import os
import shutil
import subprocess
import tempfile
import time

from typing import Optional
from ..resolve_connector import NoTimelineError, NoProjectError


def _find_ffmpeg() -> str | None:
    """Find ffmpeg executable on the system."""
    found = shutil.which('ffmpeg')
    if found:
        return found
    # Use static_ffmpeg package as fallback (pip install static-ffmpeg)
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
        found = shutil.which('ffmpeg')
        if found:
            return found
    except ImportError:
        pass
    return None


def _find_rendered_file(directory: str, base_name: str) -> str | None:
    """Find a rendered file by base name, regardless of extension."""
    for f in os.listdir(directory):
        name_no_ext = os.path.splitext(f)[0]
        if name_no_ext == base_name:
            return os.path.join(directory, f)
    return None


def register(mcp, connector):
    @mcp.tool()
    def render_timeline_audio(start_seconds: Optional[float] = None, end_seconds: Optional[float] = None) -> str:
        """
        Renders the current timeline's audio to temporary MP3 files.
        Optional 'start_seconds' and 'end_seconds' can be passed to limit the render to a specific time range (in seconds relative to the start of the video).
        Returns the absolute paths to the audio files in a JSON result.
        """
        try:
            project = connector.get_project()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        # Sanitize timeline name for safe file paths
        import re
        temp_dir = tempfile.gettempdir()
        safe_name = re.sub(r'[^A-Za-z0-9_\-\.]', '_', timeline.GetName())
        file_name = f"{safe_name}_audio"

        # Clear any previous render jobs
        project.DeleteAllRenderJobs()

        # Explicitly set the render format to MP3 before configuring jobs
        try:
            project.SetCurrentRenderFormatAndCodec("mp3", "mp3")
        except Exception:
            pass  # Older API versions may not have this, fall through to SetRenderSettings

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
             user_start_f = orig_start_f + int(start_seconds * fps)
             start_f = max(orig_start_f, user_start_f)

        if end_seconds is not None:
             user_end_f = orig_start_f + int(end_seconds * fps)
             end_f = min(orig_end_f, user_end_f)

        if start_f > end_f:
             return json.dumps({"error": f"Invalid time range: computed start frame {start_f} is after end frame {end_f}."})

        frames_per_chunk = int(fps * 60 * 10) # 10 minute chunks Max

        chunk_jobs = []

        # Iterate over timeline range creating jobs
        for i, chunk_in in enumerate(range(start_f, end_f + 1, frames_per_chunk)):
            chunk_out = min(chunk_in + frames_per_chunk - 1, end_f)

            chunk_file_name = f"{file_name}_part{i+1}"
            chunk_path = os.path.join(temp_dir, chunk_file_name + ".mp3")

            # Clean up any leftover files with same base name (prevents DaVinci conflicts)
            old_file = _find_rendered_file(temp_dir, chunk_file_name)
            if old_file:
                try:
                    os.remove(old_file)
                except OSError:
                    pass

            # offset from timeline start in seconds
            offset_seconds = (chunk_in - start_f) / fps

            settings = {
                "SelectAllFrames": False,
                "MarkIn": chunk_in,
                "MarkOut": chunk_out,
                "CustomName": chunk_file_name,
                "TargetDir": temp_dir,
                "Format": "mp3",
                "AudioCodec": "mp3",
                "ExportVideo": False,
                "ExportAudio": True,
            }
            project.SetRenderSettings(settings)
            time.sleep(0.1) # Brief pause for resolve to digest settings
            project.AddRenderJob()

            job_list = project.GetRenderJobList()
            if not job_list:
                return json.dumps({"error": f"Failed to add render job for chunk {i+1}."})

            job_id = job_list[-1]["JobId"]
            chunk_jobs.append({
                "job_id": job_id,
                "path": chunk_path,
                "file_name": chunk_file_name,
                "offset_seconds": offset_seconds
            })

        # Start all jobs
        if not project.StartRendering():
            return json.dumps({"error": "Failed to start rendering chunks."})

        # Wait for all jobs
        still_rendering = True
        while still_rendering:
            time.sleep(1)
            still_rendering = False
            for cj in chunk_jobs:
                status = project.GetRenderJobStatus(cj["job_id"])
                if status and status.get("JobStatus") == "Rendering":
                    still_rendering = True
                    break
                elif status and status.get("JobStatus") == "Failed":
                    return json.dumps({"error": f"Render failed for a chunk."})

        # Post-render: resolve actual file paths
        # DaVinci sometimes silently renders as .mov instead of .mp3.
        # Whisper API accepts .mov/.mp4/.wav natively, so no conversion needed.
        for cj in chunk_jobs:
            expected_mp3 = cj["path"]
            if os.path.exists(expected_mp3):
                continue  # DaVinci produced .mp3 correctly

            # Search for the actual rendered file (e.g., .mov, .wav, .mp4)
            actual_file = _find_rendered_file(temp_dir, cj["file_name"])
            if not actual_file:
                return json.dumps({"error": f"Rendered file not found for chunk: {cj['file_name']}"})

            # Use the actual file path directly — Whisper accepts most audio/video formats
            cj["path"] = actual_file
            print(f"DaVinci rendered as {os.path.splitext(actual_file)[1]} instead of .mp3, using as-is.")

        return json.dumps({
            "success": True,
            "audio_chunks": [{"path": c["path"], "offset_seconds": c["offset_seconds"]} for c in chunk_jobs],
            "message": f"Successfully rendered {len(chunk_jobs)} audio chunks."
        })

