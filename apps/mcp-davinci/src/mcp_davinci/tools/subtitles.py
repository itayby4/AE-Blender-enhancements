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
        Each element should be a dictionary with 'start_seconds', 'end_seconds', and 'text'.
        (Optional backward compatibility: 'start_frame' / 'end_frame').
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
            start_sec = sub.get('start_seconds')
            if start_sec is None:
                start_sec = sub.get('start_frame', 0) / fps
            
            end_sec = sub.get('end_seconds')
            if end_sec is None:
                end_sec = sub.get('end_frame', 0) / fps
            
            text = sub.get('text', '')
            
            ms_start = int((start_sec % 1) * 1000)
            s_s = int(start_sec % 60)
            m_s = int((start_sec // 60) % 60)
            h_s = int(start_sec // 3600)
            
            ms_end = int((end_sec % 1) * 1000)
            s_e = int(end_sec % 60)
            m_e = int((end_sec // 60) % 60)
            h_e = int(end_sec // 3600)
            
            srt_content += f"{i}\n"
            srt_content += f"{h_s:02d}:{m_s:02d}:{s_s:02d},{ms_start:03d} --> {h_e:02d}:{m_e:02d}:{s_e:02d},{ms_end:03d}\n"
            srt_content += f"{text}\n\n"

        import time
        desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
        unique_id = int(time.time())
        srt_path = os.path.join(desktop, f"Hebrew_Subtitles_{unique_id}.srt")
        
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        media_pool = project.GetMediaPool()
        imported = media_pool.ImportMedia([srt_path])

        if imported and len(imported) > 0:
            try:
                # Try to append the subtitle perfectly in sync
                srt_item = imported[0]
                start_f = timeline.GetStartFrame()
                clip_info = {
                    "mediaPoolItem": srt_item,
                    "recordFrame": int(start_f)
                }
                new_clips = media_pool.AppendToTimeline([clip_info])
                if new_clips:
                     return json.dumps({
                         "success": True,
                         "message": f"Successfully created SRT ({srt_path}), imported it, AND added it directly to your Timeline in sync!",
                         "srt_path": srt_path
                     })
            except Exception:
                pass

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
