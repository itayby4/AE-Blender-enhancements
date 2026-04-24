"""
PipeFX — Subtitle creation tool for DaVinci Resolve.

Takes translated subtitles as JSON input, builds an SRT file,
imports it into the Media Pool, and appends it to the active timeline.
"""

import json
import math
import os
import tempfile
from typing import Optional

from ..resolve_connector import NoTimelineError, NoProjectError


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


def _build_srt(subtitles: list[dict], max_chars_per_line: int | None = None) -> str:
    """Build SRT file content from a list of {start_seconds, end_seconds, text} dicts."""
    lines = []
    for i, sub in enumerate(subtitles, 1):
        text = sub.get("text", "")
        if max_chars_per_line and len(text) > max_chars_per_line:
            text = _wrap_text(text, max_chars_per_line)

        lines.append(f"{i}")
        lines.append(
            f"{_format_timestamp(sub['start_seconds'])} --> "
            f"{_format_timestamp(sub['end_seconds'])}"
        )
        lines.append(text)
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
        Add subtitles to the current DaVinci Resolve timeline.

        Takes a JSON string representing subtitles — a list of dictionaries,
        each with 'start_seconds', 'end_seconds', and 'text'.

        Formatting parameters:
          - max_words: Max words per subtitle entry. Longer entries are split
            into multiple shorter ones with evenly distributed timing.
          - max_chars: Max total characters per subtitle entry. Text is
            truncated with '...' if it exceeds this limit.
          - max_chars_per_line: Max characters per line before inserting
            a line break. Text wraps at word boundaries.

        Backward compatibility: 'start_frame' / 'end_frame' are also accepted
        and automatically converted to seconds using the timeline frame rate.

        This tool:
        1. Builds an SRT file from the provided subtitles.
        2. Imports the SRT into the DaVinci Media Pool.
        3. Appends it to the active timeline as a subtitle track.
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

        fps_str = timeline.GetSetting("timelineFrameRate")
        fps = float(fps_str) if fps_str else 25.0

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
        timeline_name = timeline.GetName()
        srt_filename = f"{timeline_name}_subtitles.srt"
        srt_path = os.path.join(tempfile.gettempdir(), srt_filename)

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        # Ensure the timeline has a subtitle track
        media_pool = project.GetMediaPool()
        if timeline.GetTrackCount("subtitle") < 1:
            try:
                timeline.AddTrack("subtitle")
            except Exception:
                pass  # Older Resolve versions may not support AddTrack

        # Remember current timeline so we can restore it if DaVinci switches
        current_timeline_name = timeline.GetName()

        # Import SRT into Media Pool and append directly to the active timeline
        try:
            imported = media_pool.ImportMedia([srt_path])
            if imported and len(imported) > 0:
                result = media_pool.AppendToTimeline(imported)
                if not result:
                    return json.dumps({
                        "error": "SRT imported to Media Pool but failed to append to timeline.",
                        "srt_path": srt_path,
                        "suggestion": "Drag the SRT clip from the Media Pool onto your timeline manually.",
                    })
            else:
                return json.dumps({
                    "error": "Failed to import SRT into Media Pool.",
                    "srt_path": srt_path,
                    "suggestion": "The SRT file was saved — you can import it manually.",
                })
        except Exception as e:
            return json.dumps({
                "error": f"SRT import failed: {e}",
                "srt_path": srt_path,
                "suggestion": "The SRT file was saved — you can import it manually.",
            })

        # Restore active timeline if DaVinci switched to a different one
        try:
            active = project.GetCurrentTimeline()
            if active and active.GetName() != current_timeline_name:
                # Find and restore the original timeline
                timeline_count = project.GetTimelineCount()
                for i in range(1, timeline_count + 1):
                    tl = project.GetTimelineByIndex(i)
                    if tl and tl.GetName() == current_timeline_name:
                        project.SetCurrentTimeline(tl)
                        break
        except Exception:
            pass

        return json.dumps({
            "success": True,
            "total_subtitles": len(normalised),
            "message": (
                f"Added {len(normalised)} subtitles directly to timeline '{current_timeline_name}'. "
                f"SRT backup saved at {srt_path}"
            ),
            "srt_path": srt_path,
        })
