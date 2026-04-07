import json
import os
import tempfile
import time

from typing import Optional
from ..resolve_connector import NoTimelineError, NoProjectError

def register(mcp, connector):
    @mcp.tool()
    def render_timeline_audio(start_seconds: Optional[float] = None, end_seconds: Optional[float] = None) -> str:
        """
        Renders the current timeline's audio to temporary MP4 files.
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
                    
        return json.dumps({
            "success": True,
            "audio_chunks": [{"path": c["path"], "offset_seconds": c["offset_seconds"]} for c in chunk_jobs],
            "message": f"Successfully rendered {len(chunk_jobs)} audio chunks."
        })
