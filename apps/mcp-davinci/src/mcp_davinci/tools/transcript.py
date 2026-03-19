import json

from ..resolve_connector import NoTimelineError, NoProjectError

def register(mcp, connector):
    @mcp.tool()
    def get_timeline_transcript(track_index: int = 1) -> str:
        """
        Get the transcript (subtitles) of the current timeline.
        Reads from the specified subtitle track (default: 1).
        If the timeline has no subtitles, the user should first run "Create Subtitles from Audio" in DaVinci Resolve.
        
        Returns a JSON list of dictionaries with 'start_frame', 'end_frame', and 'text'.
        """
        try:
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        # Try to read the subtitle track
        subtitle_count = timeline.GetTrackCount("subtitle")
        if subtitle_count < 1 or track_index > subtitle_count:
            return json.dumps({
                "error": f"No subtitle track {track_index} found.",
                "suggestion": "Please ensure you have generated subtitles. You can do this in DaVinci Resolve via Timeline > Create Subtitles from Audio."
            })

        items = timeline.GetItemListInTrack("subtitle", track_index)
        if not items:
            return json.dumps({
                "error": "Subtitle track exists but has no items.",
                "suggestion": "Please ensure your subtitle track has clips on it."
            })

        transcript_data = []
        for item in items:
            # For subtitle clips, the name is typically the subtitle text.
            # We'll use GetName() and sanitize it just in case.
            text = item.GetName()
            start = item.GetStart()
            end = item.GetEnd()
            
            transcript_data.append({
                "start_frame": start,
                "end_frame": end,
                "text": text
            })

        return json.dumps({
            "timeline": timeline.GetName(),
            "subtitle_track": track_index,
            "transcript": transcript_data
        }, indent=2)
