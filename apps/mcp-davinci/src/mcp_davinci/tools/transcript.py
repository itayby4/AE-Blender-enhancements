import json

from ..resolve_connector import NoTimelineError, NoProjectError, ResolveNotRunningError

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
        except ResolveNotRunningError as exc:
            return json.dumps({"error": str(exc)})

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

    @mcp.tool()
    def read_srt_file(file_path: str) -> str:
        """Read an SRT file from the given path and return the transcript in JSON format with timings."""
        import os
        import re
        
        # Remove any surrounding quotes from the path
        file_path = file_path.strip('"').strip("'")
        
        if not os.path.exists(file_path):
            return json.dumps({"error": f"File not found: {file_path}"})
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            blocks = content.strip().split('\n\n')
            transcript = []
            
            for block in blocks:
                lines = block.split('\n')
                if len(lines) >= 3:
                    time_line = lines[1]
                    text_lines = [lines[i] for i in range(2, len(lines))]
                    text = " ".join(text_lines)
                    
                    # Parse time: 00:00:01,000 --> 00:00:04,000
                    m = re.match(r"(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})", time_line)
                    if m:
                        start_sec = int(m.group(1))*3600 + int(m.group(2))*60 + int(m.group(3)) + int(m.group(4))/1000.0
                        end_sec = int(m.group(5))*3600 + int(m.group(6))*60 + int(m.group(7)) + int(m.group(8))/1000.0
                        
                        transcript.append({
                            "start_seconds": start_sec,
                            "end_seconds": end_sec,
                            "text": text
                        })
            return json.dumps({"transcript": transcript}, indent=2)
        except Exception as e:
            return json.dumps({"error": f"Failed to parse SRT: {str(e)}"})
            
    @mcp.tool()
    def export_and_read_hebrew_transcript(track_index: int = 1) -> str:
        """
        Exports the timeline's subtitle track to a temporary SRT file and reads it back 
        to bypass DaVinci Resolve's native scripting encoding issues with Hebrew.
        Returns a JSON list of dictionaries with 'start_seconds', 'end_seconds', and 'text'.
        """
        import os
        import tempfile
        import re

        try:
            resolve = connector.get_resolve()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})
        except ResolveNotRunningError as exc:
            return json.dumps({"error": str(exc)})

        subtitle_count = timeline.GetTrackCount("subtitle")
        if subtitle_count < 1 or track_index > subtitle_count:
            return json.dumps({
                "error": f"No subtitle track {track_index} found.",
                "suggestion": "Please ensure you have generated subtitles."
            })
            
        temp_dir = tempfile.gettempdir()
        srt_path = os.path.join(temp_dir, f"temp_subs_track_{track_index}.srt")
        
        try:
            export_type = getattr(resolve, "EXPORT_SUBTITLES", 2)
            export_subtype = getattr(resolve, "EXPORT_SRT", 0)
            
            success = timeline.Export(srt_path, export_type, export_subtype)
            if not success:
                return json.dumps({"error": f"Failed to export subtitles using DaVinci API to {srt_path}."})
        except Exception as e:
             return json.dumps({"error": f"DaVinci API Export error: {e}"})

        if not os.path.exists(srt_path):
            return json.dumps({"error": f"DaVinci claimed export success, but SRT file not found at {srt_path}."})
            
        try:
            with open(srt_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            blocks = content.strip().split('\n\n')
            transcript = []
            
            for block in blocks:
                lines = block.split('\n')
                if len(lines) >= 3:
                    time_line = lines[1]
                    text_lines = [lines[i] for i in range(2, len(lines))]
                    text = " ".join(text_lines)
                    
                    m = re.match(r"(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})", time_line)
                    if m:
                        start_sec = int(m.group(1))*3600 + int(m.group(2))*60 + int(m.group(3)) + int(m.group(4))/1000.0
                        end_sec = int(m.group(5))*3600 + int(m.group(6))*60 + int(m.group(7)) + int(m.group(8))/1000.0
                        
                        transcript.append({
                            "start_seconds": start_sec,
                            "end_seconds": end_sec,
                            "text": text
                        })
            
            try:
                os.remove(srt_path)
            except OSError:
                pass
                
            return json.dumps({"transcript": transcript}, indent=2)
        except Exception as e:
            return json.dumps({"error": f"Failed to parse SRT: {str(e)}"})
