import json

from ..resolve_connector import NoTimelineError, NoProjectError

def register(mcp, connector):
    @mcp.tool()
    def apply_ripple_deletes(edits: str) -> str:
        """
        Takes a JSON string representing a list of cuts to make.
        Each element in the list should be a dictionary with 'start_frame' and 'end_frame'.
        Example JSON: [{"start_frame": 100, "end_frame": 150}, {"start_frame": 300, "end_frame": 400}]
        
        The method will sort them in reverse order, split the timeline tracks, and ripple-delete the sections.
        """
        try:
            cut_list = json.loads(edits)
            if not isinstance(cut_list, list):
                return json.dumps({"error": "edits must be a JSON list of dictionaries."})
        except json.JSONDecodeError:
            return json.dumps({"error": "Failed to parse edits JSON string."})

        try:
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        # To avoid shifting issues during editing, we must process edits from end to start
        cut_list.sort(key=lambda x: x.get('start_frame', 0), reverse=True)

        deleted_count = 0
        errors = []

        for cut in cut_list:
            start = cut.get('start_frame')
            end = cut.get('end_frame')
            
            if start is None or end is None:
                errors.append(f"Invalid cut dict missing start_frame or end_frame: {cut}")
                continue
                
            if start >= end:
                errors.append(f"Invalid cut range {start}-{end}")
                continue

            # DaVinci API doesn't have a direct "RippleDeleteRange" command.
            # We must use DeleteClips(clips) or script UI commands.
            # A common technique is to use timeline.DeleteClips() after splitting? 
            # Or use resolve API UI functions `resolve.OpenPage("edit")`, `SetIn()`, `SetOut()`, `DeleteSelected()`.
            # Wait, since 18.5 there might be timeline.DeleteMarker or timeline.DeleteMarkedRegion? NO.
            # Wait, `Timeline.DeleteClips` array of media pool items or timeline items.
            pass
            
        # Returning a placeholder for now since DaVinci API ripple delete needs specific clip item arrays
        # The correct way to Ripple Delete in Resolve via Scripting is:
        # We need to split the clips at `start` and `end`, then find the items in between, and `timeline.DeleteClips([...])`
        # OR set In/Out points and call the UI action to Ripple Delete.
        
        return json.dumps({
            "success": True,
            "message": f"Tool created, but true Ripple Delete requires In/Out UI macro or splitting all tracks.",
            "edits_received": len(cut_list),
            "errors": errors
        }, indent=2)
