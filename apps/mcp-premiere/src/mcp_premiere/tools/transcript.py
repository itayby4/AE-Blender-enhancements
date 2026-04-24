"""
PipeFX ΓÇö Timeline transcript tool for Adobe Premiere Pro.

Reads captions/subtitles from the current sequence.
Premiere Pro stores captions as special clips on caption tracks.
"""

import json
import os
import re
import tempfile

from ..premiere_connector import PremiereNotRunningError, NoProjectError

# Premiere ticks constant
TICKS_PER_SECOND = 254016000000


def _ticks_to_seconds(ticks) -> float:
    """Convert Premiere Pro ticks to seconds."""
    try:
        return round(float(int(ticks)) / TICKS_PER_SECOND, 3)
    except (TypeError, ValueError):
        return 0.0


def _parse_srt(content: str) -> list[dict]:
    """Parse SRT content into a list of {start_seconds, end_seconds, text} dicts."""
    # Strip BOM if present
    if content.startswith("\ufeff"):
        content = content[1:]

    blocks = content.strip().split("\n\n")
    transcript = []

    _TIME_RE = re.compile(
        r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})"
    )

    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue

        # Line 0 = sequence number, Line 1 = timecodes, Line 2+ = text
        m = _TIME_RE.match(lines[1])
        if not m:
            continue

        start_sec = (
            int(m.group(1)) * 3600
            + int(m.group(2)) * 60
            + int(m.group(3))
            + int(m.group(4)) / 1000.0
        )
        end_sec = (
            int(m.group(5)) * 3600
            + int(m.group(6)) * 60
            + int(m.group(7))
            + int(m.group(8)) / 1000.0
        )

        text = " ".join(lines[2:]).strip()
        if text:
            transcript.append(
                {"start_seconds": start_sec, "end_seconds": end_sec, "text": text}
            )

    return transcript


def register(mcp, connector):
    @mcp.tool()
    def get_timeline_transcript(track_index: int = 1) -> str:
        """
        Get the transcript (captions/subtitles) of the current Premiere Pro sequence.

        Reads caption clips from the active sequence and returns their text
        with timing information.

        Returns a JSON object with:
          - timeline: the sequence name
          - subtitle_track: which track was read
          - transcript: list of {start_seconds, end_seconds, text}
        """
        try:
            app = connector.get_app()
            project = connector.get_project()
            sequence = connector.get_active_sequence()
        except (PremiereNotRunningError, NoProjectError) as exc:
            return json.dumps({"error": str(exc)})

        seq_name = str(sequence.name)
        transcript = []

        # Approach 1: Try to read captions via ExtendScript
        # Premiere stores captions as special clips; try to access them
        try:
            # Use ExtendScript to export captions to a temp SRT file
            temp_dir = tempfile.gettempdir()
            srt_path = os.path.join(temp_dir, f"pipefx_premiere_transcript.srt")

            # Clean up previous file
            if os.path.exists(srt_path):
                try:
                    os.remove(srt_path)
                except OSError:
                    pass

            escaped_path = srt_path.replace("\\", "\\\\")

            # Try to export captions using Premiere's built-in caption export
            export_script = f"""
            var seq = app.project.activeSequence;
            var captionFile = new File("{escaped_path}");
            var result = "NO_CAPTIONS";

            // Check if there are caption tracks
            if (seq.captionTracks && seq.captionTracks.numTracks > 0) {{
                // Premiere has caption export capabilities
                result = "HAS_CAPTIONS:" + seq.captionTracks.numTracks;
            }}
            result;
            """
            cap_result = str(connector.eval_qe(export_script) or "")

            if "HAS_CAPTIONS" in cap_result:
                # Read captions directly from caption tracks via ExtendScript
                read_script = f"""
                var seq = app.project.activeSequence;
                var trackIdx = {track_index - 1};
                var captions = [];

                if (seq.captionTracks && trackIdx < seq.captionTracks.numTracks) {{
                    var track = seq.captionTracks[trackIdx];
                    if (track && track.clips) {{
                        for (var i = 0; i < track.clips.numItems; i++) {{
                            var clip = track.clips[i];
                            captions.push({{
                                start_ticks: clip.start.ticks,
                                end_ticks: clip.end.ticks,
                                text: clip.name || ""
                            }});
                        }}
                    }}
                }}
                JSON.stringify(captions);
                """
                captions_raw = connector.eval_qe(read_script)

                if captions_raw:
                    try:
                        captions_data = json.loads(str(captions_raw))
                        for cap in captions_data:
                            start_sec = _ticks_to_seconds(cap.get("start_ticks", 0))
                            end_sec = _ticks_to_seconds(cap.get("end_ticks", 0))
                            text = cap.get("text", "").strip()
                            if text:
                                transcript.append({
                                    "start_seconds": start_sec,
                                    "end_seconds": end_sec,
                                    "text": text,
                                })
                    except json.JSONDecodeError:
                        pass

        except Exception:
            pass

        # Approach 2: If no captions found, check project for imported SRT files
        if not transcript:
            try:
                # Search project items for SRT files that might contain subtitles
                num_items = project.rootItem.children.numItems
                for i in range(num_items):
                    item = project.rootItem.children[i]
                    item_name = item.name if hasattr(item, "name") else ""
                    if item_name.lower().endswith(".srt"):
                        # Found an SRT in the project, try to read it
                        try:
                            media_path = item.getMediaPath()
                            if media_path and os.path.exists(media_path):
                                with open(media_path, "r", encoding="utf-8") as f:
                                    content = f.read()
                                transcript = _parse_srt(content)
                                if transcript:
                                    break
                        except Exception:
                            continue
            except Exception:
                pass

        if not transcript:
            return json.dumps({
                "error": "No captions or subtitles found in the active sequence.",
                "suggestion": (
                    "Ensure you have captions on the timeline. "
                    "You can add captions in Premiere via Window > Captions and Graphics, "
                    "or import an SRT file."
                ),
            })

        return json.dumps({
            "timeline": seq_name,
            "subtitle_track": track_index,
            "total_entries": len(transcript),
            "transcript": transcript,
        }, indent=2)
