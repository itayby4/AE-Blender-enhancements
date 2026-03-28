import json
import os
import time
import tempfile

from ..resolve_connector import NoTimelineError, NoProjectError
from .subtitle_xml_builder import build_synced_subtitle_fcpxml, build_subtitle_fcpxml


def register(mcp, connector):
    @mcp.tool()
    def add_timeline_subtitle(subtitles_json: str) -> str:
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
        srt_path = os.path.join(desktop, f"Hebrew_Subtitles_{unique_id}.srt")

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

        # --- 3) Export current timeline to FCPXML (for timing metadata) ---
        temp_dir = tempfile.gettempdir()
        timeline_name = timeline.GetName()
        safe_name = "".join(c for c in timeline_name if c.isalnum() or c in (' ', '_', '-')).strip()
        export_path = os.path.join(temp_dir, f"{safe_name}_original.fcpxml")

        exported = False
        try:
            success = timeline.Export(
                export_path,
                getattr(resolve, 'EXPORT_FCPXML_1_8', 6),
                getattr(resolve, 'EXPORT_NONE', 0)
            )
            if not success:
                success = timeline.Export(export_path, 6, 0)
            exported = success and os.path.exists(export_path)
        except Exception:
            exported = False

        # --- 3) Build synced subtitle FCPXML ---
        sub_timeline_name = f"{safe_name}_Subtitles_{unique_id}"
        fcpxml_path = os.path.join(temp_dir, f"{sub_timeline_name}.fcpxml")

        if exported:
            try:
                build_synced_subtitle_fcpxml(
                    source_fcpxml_path=export_path,
                    subtitles=normalised,
                    output_path=fcpxml_path,
                    timeline_name=sub_timeline_name,
                )
            except Exception as e:
                exported = False  # Fall through to fallback

        if not exported:
            # Fallback: standalone FCPXML (try to read tcStart from timeline)
            try:
                start_frame = int(timeline.GetStartFrame())
                tc_start = start_frame / fps
            except Exception:
                tc_start = 0.0

            try:
                width = int(project.GetSetting('timelineResolutionWidth') or 1920)
                height = int(project.GetSetting('timelineResolutionHeight') or 1080)
                fcpxml_path = build_subtitle_fcpxml(
                    subtitles=normalised,
                    fps=fps,
                    width=width,
                    height=height,
                    timeline_name=sub_timeline_name,
                    output_dir=temp_dir,
                    tc_start=tc_start,
                )
            except Exception as e:
                return json.dumps({
                    "success": True,
                    "message": f"Created SRT at {srt_path} but FCPXML generation failed: {e}. Please import SRT manually.",
                    "srt_path": srt_path,
                })

        # --- 4) Import FCPXML as new timeline ---
        media_pool = project.GetMediaPool()
        try:
            new_timeline = media_pool.ImportTimelineFromFile(fcpxml_path, {
                "timelineName": sub_timeline_name,
            })
            if new_timeline:
                return json.dumps({
                    "success": True,
                    "message": (
                        f"Created {len(normalised)} subtitles and imported as timeline '{sub_timeline_name}'. "
                        f"It is synced with '{timeline_name}' – same start time and duration. "
                        f"SRT backup: {srt_path}"
                    ),
                    "srt_path": srt_path,
                    "fcpxml_path": fcpxml_path,
                    "timeline_name": sub_timeline_name,
                })
        except Exception:
            pass

        # Fallback: SRT import
        try:
            imported = media_pool.ImportMedia([srt_path])
            if imported and len(imported) > 0:
                return json.dumps({
                    "success": True,
                    "message": f"FCPXML import failed. Imported SRT into Media Pool. Please drag to timeline. SRT: {srt_path}",
                    "srt_path": srt_path,
                })
        except Exception:
            pass

        return json.dumps({
            "success": True,
            "message": f"Created SRT ({srt_path}) and FCPXML ({fcpxml_path}). Import manually via File > Import AAF, EDL, XML.",
            "srt_path": srt_path,
            "fcpxml_path": fcpxml_path,
        })
