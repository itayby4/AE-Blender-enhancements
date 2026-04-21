"""
PipeFX ΓÇö Subtitle creation tool for Adobe Premiere Pro.

Takes translated subtitles as JSON input, builds an SRT file,
and imports it into the active Premiere Pro project.
"""

import json
import math
import os
import tempfile
import time
from typing import Optional

from ..premiere_connector import PremiereNotRunningError, NoProjectError


def _wrap_text(text: str, max_chars_per_line: int) -> str:
    """Wrap text into multiple lines, breaking at word boundaries."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        if current_line and len(current_line) + 1 + len(word) > max_chars_per_line:
            lines.append(current_line)
            current_line = word
        else:
            current_line = f"{current_line} {word}" if current_line else word

    if current_line:
        lines.append(current_line)

    return "\n".join(lines)


def _format_timestamp(seconds: float) -> str:
    """Convert seconds to SRT timestamp format: HH:MM:SS,mmm"""
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    ms = (seconds % 1) * 1000
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(ms):03d}"


def _split_by_words(subtitles: list[dict], max_words: int) -> list[dict]:
    """Split subtitles that exceed max_words into multiple shorter entries."""
    result = []
    for sub in subtitles:
        words = sub["text"].split()
        if len(words) <= max_words:
            result.append(sub)
            continue

        # Split into chunks of max_words, distributing time evenly
        total_duration = sub["end_seconds"] - sub["start_seconds"]
        num_chunks = math.ceil(len(words) / max_words)
        chunk_duration = total_duration / num_chunks

        for i in range(num_chunks):
            chunk_words = words[i * max_words : (i + 1) * max_words]
            result.append({
                "start_seconds": sub["start_seconds"] + i * chunk_duration,
                "end_seconds": sub["start_seconds"] + (i + 1) * chunk_duration,
                "text": " ".join(chunk_words),
            })

    return result


def _build_srt(
    subtitles: list[dict],
    max_chars_per_line: int | None = None,
    font_color: str = "#FFFFFF",
) -> str:
    """Build SRT file content from a list of {start_seconds, end_seconds, text} dicts.

    Premiere Pro respects <font color> and <b> tags in SRT captions,
    so we wrap text in bold + white by default for better visibility.
    """
    lines = []
    for i, sub in enumerate(subtitles, 1):
        text = sub.get("text", "")
        if max_chars_per_line and len(text) > max_chars_per_line:
            text = _wrap_text(text, max_chars_per_line)

        # Apply HTML styling that Premiere supports
        styled_text = f'<font color="{font_color}"><b>{text}</b></font>'

        lines.append(f"{i}")
        lines.append(
            f"{_format_timestamp(sub['start_seconds'])} --> "
            f"{_format_timestamp(sub['end_seconds'])}"
        )
        lines.append(styled_text)
        lines.append("")  # blank line between entries

    return "\n".join(lines)


def register(mcp, connector):
    @mcp.tool()
    def add_timeline_subtitle(
        subtitles_json: str,
        max_words: Optional[int] = None,
        max_chars: Optional[int] = None,
        max_chars_per_line: Optional[int] = None,
    ) -> str:
        """
        Add subtitles to the current Adobe Premiere Pro timeline.

        Takes a JSON string representing subtitles ΓÇö a list of dictionaries,
        each with 'start_seconds', 'end_seconds', and 'text'.

        Formatting parameters:
          - max_words: Max words per subtitle entry. Longer entries are split
            into multiple shorter ones with evenly distributed timing.
          - max_chars: Max total characters per subtitle entry. Text is
            truncated with '...' if it exceeds this limit.
          - max_chars_per_line: Max characters per line before inserting
            a line break. Text wraps at word boundaries.

        This tool:
        1. Builds an SRT file from the provided subtitles.
        2. Imports the SRT into the Premiere Pro project.
        3. Premiere automatically creates a captions track from the SRT.
        """
        try:
            subs = json.loads(subtitles_json)
            if not isinstance(subs, list):
                return json.dumps({"error": "subtitles_json must be a JSON list of dictionaries."})
        except json.JSONDecodeError:
            return json.dumps({"error": "Failed to parse subtitles_json string."})

        try:
            project = connector.get_project()
            sequence = connector.get_active_sequence()
        except (PremiereNotRunningError, NoProjectError) as exc:
            return json.dumps({"error": str(exc)})

        # Get timeline framerate for backward compat (start_frame/end_frame)
        try:
            timebase_ticks = int(sequence.timebase)
            fps = 254016000000 / timebase_ticks if timebase_ticks else 25.0
        except (TypeError, ValueError):
            fps = 25.0

        # Normalise: always produce start_seconds / end_seconds
        normalised = []
        for sub in subs:
            start_sec = sub.get("start_seconds")
            if start_sec is None:
                start_sec = sub.get("start_frame", 0) / fps

            end_sec = sub.get("end_seconds")
            if end_sec is None:
                end_sec = sub.get("end_frame", 0) / fps

            normalised.append({
                "start_seconds": float(start_sec),
                "end_seconds": float(end_sec),
                "text": sub.get("text", ""),
            })

        # Apply formatting constraints
        if max_words:
            normalised = _split_by_words(normalised, max_words)

        if max_chars:
            for sub in normalised:
                if len(sub["text"]) > max_chars:
                    sub["text"] = sub["text"][:max_chars - 3].rstrip() + "..."

        # Build SRT content
        srt_content = _build_srt(normalised, max_chars_per_line)

        # Write SRT to temp file
        seq_name = str(sequence.name)
        srt_filename = f"{seq_name}_subtitles.srt"
        srt_path = os.path.join(tempfile.gettempdir(), srt_filename)

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        # Import SRT into the Premiere Pro project and add to timeline
        try:
            # Count items before import to verify after
            items_before = project.rootItem.children.numItems

            # Import the SRT file
            project.importFiles([srt_path], False, project.rootItem, False)

            # Give Premiere a moment to process the import
            time.sleep(0.5)

            items_after = project.rootItem.children.numItems
            new_items = items_after - items_before

            if new_items <= 0:
                return json.dumps({
                    "error": "SRT file was imported but no new items appeared in the project. "
                             "You can import the SRT manually via File > Import.",
                    "srt_path": srt_path,
                })

            # Find the newly imported SRT project item
            srt_item = None
            srt_basename = os.path.basename(srt_path)
            for i in range(project.rootItem.children.numItems):
                item = project.rootItem.children[i]
                if hasattr(item, 'name') and srt_basename in str(item.name):
                    srt_item = item
                    break

            # Add the SRT directly to the timeline as a caption track
            caption_added = False
            if srt_item:
                try:
                    import pymiere
                    result = pymiere.core.eval_script(f"""
                        var seq = app.project.activeSequence;
                        var root = app.project.rootItem;
                        var srtItem = null;
                        for (var i = 0; i < root.children.numItems; i++) {{
                            if (root.children[i].name.indexOf("{srt_basename}") >= 0) {{
                                srtItem = root.children[i];
                                break;
                            }}
                        }}
                        var ok = false;
                        if (srtItem) {{
                            ok = seq.createCaptionTrack(srtItem, "Subtitle");
                        }}
                        ok;
                    """)
                    caption_added = str(result).lower() == "true"
                except Exception:
                    pass

        except Exception as e:
            return json.dumps({
                "error": f"SRT import failed: {e}",
                "srt_path": srt_path,
                "suggestion": "The SRT file was saved ΓÇö you can import it manually via File > Import.",
            })

        if caption_added:
            return json.dumps({
                "success": True,
                "total_subtitles": len(normalised),
                "message": (
                    f"Added {len(normalised)} subtitles to the timeline as captions. "
                    f"SRT backup saved at {srt_path}"
                ),
                "srt_path": srt_path,
            })
        else:
            return json.dumps({
                "success": True,
                "total_subtitles": len(normalised),
                "message": (
                    f"Added {len(normalised)} subtitles to project '{str(project.name)}'. "
                    f"The SRT file has been imported into the project panel. "
                    f"Drag it onto the timeline's captions track if needed. "
                    f"SRT backup saved at {srt_path}"
                ),
                "srt_path": srt_path,
            })
