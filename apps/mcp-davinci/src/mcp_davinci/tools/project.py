import json

from ..resolve_connector import NoProjectError


def register(mcp, connector):
    @mcp.tool()
    def get_project_info() -> str:
        """Get information about the currently open DaVinci Resolve project and timeline."""
        try:
            project = connector.get_project()
        except NoProjectError:
            return "No project is currently open in DaVinci Resolve."

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
