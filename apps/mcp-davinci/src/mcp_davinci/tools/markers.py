from ..constants import VALID_MARKER_COLORS
from ..resolve_connector import NoProjectError, NoTimelineError


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
        except (NoProjectError, NoTimelineError) as exc:
            return str(exc)

        success = timeline.AddMarker(frameId, color, name, note, duration)

        if success:
            return f"Successfully added {color} marker '{name}' at frame {frameId}."

        if color not in VALID_MARKER_COLORS:
            return (
                f"Failed to add marker. Color '{color}' is invalid. "
                f"Valid colors are: {', '.join(VALID_MARKER_COLORS)}"
            )
        return "Failed to add marker. Make sure the frame ID is within the timeline bounds."
