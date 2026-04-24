from ..constants import VALID_MARKER_COLORS
from ..resolve_connector import NoProjectError, NoTimelineError, ResolveNotRunningError


def register(mcp, connector):
    @mcp.tool()
    def add_timeline_marker(
        frameId: int,
        color: str,
        name: str,
        note: str,
        duration: int = 1,
    ) -> str:
        """Add a marker to the current timeline.

        Args:
            frameId: The frame number where the marker should be placed.
            color: The color of the marker (e.g., 'Blue', 'Cyan', 'Green', 'Yellow',
                   'Red', 'Pink', 'Purple', 'Fuchsia', 'Rose', 'Lavender', 'Sky',
                   'Mint', 'Lemon', 'Sand', 'Cocoa', 'Cream').
            name: Name of the marker.
            note: Note attached to the marker.
            duration: Duration of the marker in frames (default 1).
        """
        try:
            timeline = connector.get_timeline()
        except (NoProjectError, NoTimelineError, ResolveNotRunningError) as exc:
            return str(exc)
            
        start_frame = timeline.GetStartFrame()
        end_frame = timeline.GetEndFrame()
        
        # Auto-correct relative frames
        if frameId < start_frame:
            frameId = start_frame + frameId
            
        # Auto-correct SRT 1-hour offset bug
        if frameId > end_frame:
            try:
                project = connector.get_project()
                fps = float(project.GetSetting("timelineFrameRate") or 24.0)
                one_hour = int(fps * 3600)
                if frameId >= one_hour and (frameId - one_hour) <= end_frame:
                    frameId = frameId - one_hour
            except Exception:
                pass

        success = timeline.AddMarker(frameId, color, name, note, duration)

        if success:
            return f"Successfully added {color} marker '{name}' at frame {frameId}."
        else:
            return f"Processed marker request for frame {frameId} (it may already exist, or color is custom)."
