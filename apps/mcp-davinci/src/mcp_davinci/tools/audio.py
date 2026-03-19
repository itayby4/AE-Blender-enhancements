import json
import os
import tempfile
import time

from ..resolve_connector import NoTimelineError, NoProjectError

def register(mcp, connector):
    @mcp.tool()
    def render_timeline_audio() -> str:
        """
        Renders the current timeline's audio to a temporary WAV file.
        Returns the absolute path to the audio file as 'audio_path' in the JSON result.
        The AI engine will automatically intercept this 'audio_path' and attach it to the Gemini prompt context.
        """
        try:
            project = connector.get_project()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        # Set up a render job for audio only
        temp_dir = tempfile.gettempdir()
        file_name = f"{timeline.GetName().replace(' ', '_')}_audio"
        audio_path = os.path.join(temp_dir, file_name + ".wav")

        settings = {
            "SelectAllFrames": True,
            "CustomName": file_name,
            "TargetDir": temp_dir,
            "Format": "wav"
        }
        
        project.SetRenderSettings(settings)
        project.AddRenderJob()
        
        job_list = project.GetRenderJobList()
        if not job_list:
            return json.dumps({"error": "Failed to add render job."})
            
        job_id = job_list[-1]["JobId"]
        
        if not project.StartRendering(job_id):
            return json.dumps({"error": "Failed to start rendering."})
            
        status = project.GetRenderJobStatus(job_id)
        while status and status.get("JobStatus") == "Rendering":
            time.sleep(1)
            status = project.GetRenderJobStatus(job_id)
            
        if status and status.get("JobStatus") == "Complete":
            return json.dumps({
                "success": True,
                "audio_path": audio_path,
                "message": f"Successfully rendered audio to {audio_path}"
            })
        else:
            return json.dumps({
                "error": f"Render failed or was cancelled. Status: {status.get('JobStatus') if status else 'Unknown'}"
            })
