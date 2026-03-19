import json
import os

from ..resolve_connector import NoTimelineError, NoProjectError

def frames_to_tc(frames, fps):
    frames = max(0, int(frames))
    h = frames // (fps * 3600)
    m = (frames % (fps * 3600)) // (fps * 60)
    s = (frames % (fps * 60)) // fps
    f = frames % fps
    return f"{h:02d}:{m:02d}:{s:02d},{f:03d}"

def register(mcp, connector):
    @mcp.tool()
    def add_timeline_subtitle(subtitles_json: str) -> str:
        """
        Takes a JSON string representing translated subtitles.
        Each element should be a dictionary with 'start_frame', 'end_frame', and 'text'.
        This tool generates an .srt file and attempts to import it into the Media Pool.
        """
        try:
            subs = json.loads(subtitles_json)
            if not isinstance(subs, list):
                return json.dumps({"error": "subtitles_json must be a JSON list of dictionaries."})
        except json.JSONDecodeError:
            return json.dumps({"error": "Failed to parse subtitles_json string."})

        try:
            project = connector.get_project()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        fps = project.GetSetting('timelineFrameRate')
        fps = float(fps) if fps else 24.0

        srt_content = ""
        for i, sub in enumerate(subs, 1):
            start = sub.get('start_frame', 0)
            end = sub.get('end_frame', 0)
            text = sub.get('text', '')
            
            ms_start = int((start % fps) / fps * 1000)
            ms_end = int((end % fps) / fps * 1000)
            
            h_s = int(start // (fps * 3600))
            m_s = int((start % (fps * 3600)) // (fps * 60))
            s_s = int((start % (fps * 60)) // fps)
            
            h_e = int(end // (fps * 3600))
            m_e = int((end % (fps * 3600)) // (fps * 60))
            s_e = int((end % (fps * 60)) // fps)
            
            srt_content += f"{i}\n"
            srt_content += f"{h_s:02d}:{m_s:02d}:{s_s:02d},{ms_start:03d} --> {h_e:02d}:{m_e:02d}:{s_e:02d},{ms_end:03d}\n"
            srt_content += f"{text}\n\n"

        desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
        srt_path = os.path.join(desktop, f"Hebrew_Subtitles.srt")
        
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        media_pool = project.GetMediaPool()
        imported = media_pool.ImportMedia([srt_path])

        if imported:
            return json.dumps({
                "success": True,
                "message": f"Successfully created SRT file at {srt_path} and imported it into the Media Pool. Please drag it from the Media Pool to the timeline.",
                "srt_path": srt_path
            })
        else:
            return json.dumps({
                "success": True,
                "message": f"Created SRT file at {srt_path}. Could not automatically import it. Please import it manually into Resolve (File > Import > Subtitle).",
                "srt_path": srt_path
            })
