import json

from ..resolve_connector import NoProjectError, ResolveNotRunningError


def register(mcp, connector):
    @mcp.tool()
    def get_project_info() -> str:
        """Get information about the currently open DaVinci Resolve project and timeline."""
        try:
            project = connector.get_project()
        except (NoProjectError, ResolveNotRunningError) as exc:
            return str(exc)

        timeline = project.GetCurrentTimeline()
        timeline_name = timeline.GetName() if timeline else "No active timeline"

        info = {
            "project_name": project.GetName(),
            "framerate": project.GetSetting("timelineFrameRate"),
            "resolution": (
                f"{project.GetSetting('timelineResolutionWidth')}"
                f"x{project.GetSetting('timelineResolutionHeight')}"
            ),
            "active_timeline": timeline_name,
        }

        return json.dumps(info, indent=2)

    @mcp.tool()
    def add_render_job(start_frame: int, end_frame: int, custom_name: str, target_dir: str = "") -> str:
        """
        Adds a render job to the DaVinci Resolve Deliver page queue for a specific frame range.
        This isolates an 'edited' segment ready for export!
        """
        try:
            project = connector.get_project()
        except Exception as exc:
            return str(exc)
            
        import os
        if not target_dir:
            target_dir = os.path.join(os.environ.get('USERPROFILE', 'C:\\'), 'Desktop', 'PipeFX_Reels')
            
        if not os.path.exists(target_dir):
            try:
                os.makedirs(target_dir)
            except OSError:
                pass
                
        settings = {
            "MarkIn": start_frame,
            "MarkOut": end_frame,
            "CustomName": custom_name,
            "TargetDir": target_dir
        }
        
        success = project.SetRenderSettings(settings)
        if not success:
            return "Failed to set render settings."
            
        success = project.AddRenderJob()
        if success:
            return f"Successfully added Render Job '{custom_name}' for frames {start_frame}-{end_frame}."
        else:
            return "Failed to add Render Job."
