import json
import os
import time
import tempfile

from ..resolve_connector import NoTimelineError, NoProjectError
from .subtitle_xml_builder import build_synced_subtitle_fcpxml, build_subtitle_fcpxml


def register(mcp, connector):
    @mcp.tool()
    def add_timeline_subtitle(subtitles_json: str, animation: bool = False) -> str:
        """
        Takes a JSON string representing translated subtitles.
        Each element should be a dictionary with 'start_seconds', 'end_seconds', and 'text'.
        Each subtitle should be SHORT – ideally up to 5 words for readability.
        (Optional backward compatibility: 'start_frame' / 'end_frame').

        This tool:
        1. Exports the current timeline to FCPXML to read its timing metadata.
        2. Builds a subtitle-only FCPXML with the SAME tcStart and duration
           (so it's perfectly synced with the original timeline).
        3. Imports the subtitle FCPXML as a new timeline.
        4. Also saves an SRT backup on the Desktop.
        """
        try:
            subs = json.loads(subtitles_json)
            if not isinstance(subs, list):
                return json.dumps({"error": "subtitles_json must be a JSON list of dictionaries."})
        except json.JSONDecodeError:
            return json.dumps({"error": "Failed to parse subtitles_json string."})

        try:
            resolve = connector.get_resolve()
            project = connector.get_project()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})

        fps_str = project.GetSetting('timelineFrameRate')
        fps = float(fps_str) if fps_str else 25.0

        # Normalise subtitles to always have start_seconds / end_seconds
        normalised = []
        for sub in subs:
            start_sec = sub.get('start_seconds')
            if start_sec is None:
                start_sec = sub.get('start_frame', 0) / fps

            end_sec = sub.get('end_seconds')
            if end_sec is None:
                end_sec = sub.get('end_frame', 0) / fps

            normalised.append({
                "start_seconds": float(start_sec),
                "end_seconds": float(end_sec),
                "text": sub.get('text', ''),
            })

        # --- 1) Generate SRT backup ---
        desktop = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser('~')), 'Desktop')
        unique_id = int(time.time())
        srt_path = os.path.join(desktop, f"Auto_Subtitles_{unique_id}.srt")

        srt_content = ""
        for i, sub in enumerate(normalised, 1):
            s = sub["start_seconds"]
            e = sub["end_seconds"]
            h_s, m_s, s_s, ms_s = int(s // 3600), int((s // 60) % 60), int(s % 60), int((s % 1) * 1000)
            h_e, m_e, s_e, ms_e = int(e // 3600), int((e // 60) % 60), int(e % 60), int((e % 1) * 1000)
            srt_content += f"{i}\n"
            srt_content += f"{h_s:02d}:{m_s:02d}:{s_s:02d},{ms_s:03d} --> {h_e:02d}:{m_e:02d}:{s_e:02d},{ms_e:03d}\n"
            srt_content += f"{sub['text']}\n\n"

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        # --- 2) Import SRT into Media Pool ---
        media_pool = project.GetMediaPool()
        try:
            imported_srt = media_pool.ImportMedia([srt_path])
            if imported_srt and len(imported_srt) > 0:
                print(f"SRT imported into Media Pool: {srt_path}")
            else:
                print(f"SRT import returned empty, file saved at: {srt_path}")
        except Exception as e:
            print(f"SRT import failed ({e}), file saved at: {srt_path}")

        # --- 3) Return Success ---
        return json.dumps({
            "success": True,
            "message": f"Created SRT file ({srt_path}) and imported it into the Media Pool. Please drag it into your timeline.",
            "srt_path": srt_path,
        })
