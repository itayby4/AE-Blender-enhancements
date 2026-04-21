"""
PipeFX — Timeline transcript tool for DaVinci Resolve.

Reads subtitles from the current timeline via SRT export,
which guarantees correct encoding for ALL languages
(Hebrew, Arabic, Chinese, Japanese, etc.).
"""

import json
import os
import re
import tempfile

from ..resolve_connector import NoTimelineError, NoProjectError, ResolveNotRunningError


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
        Get the transcript (subtitles) of the current timeline.
        Works with ALL languages including Hebrew, Arabic, Chinese, etc.

        Exports the subtitle track to a temporary SRT file and parses it,
        which guarantees correct Unicode encoding regardless of language.

        Returns a JSON object with:
          - timeline: the timeline name
          - subtitle_track: which track was read
          - transcript: list of {start_seconds, end_seconds, text}
        """
        try:
            resolve = connector.get_resolve()
            timeline = connector.get_timeline()
        except NoTimelineError:
            return json.dumps({"error": "No active timeline found."})
        except NoProjectError:
            return json.dumps({"error": "No active project found."})
        except ResolveNotRunningError as exc:
            return json.dumps({"error": str(exc)})

        # Verify subtitle track exists
        subtitle_count = timeline.GetTrackCount("subtitle")
        if subtitle_count < 1 or track_index > subtitle_count:
            return json.dumps({
                "error": f"No subtitle track {track_index} found.",
                "available_tracks": subtitle_count,
                "suggestion": (
                    "Please ensure you have generated subtitles. "
                    "You can do this in DaVinci Resolve via "
                    "Timeline > Create Subtitles from Audio."
                ),
            })

        # Export subtitles to a temporary SRT file
        temp_dir = tempfile.gettempdir()
        srt_path = os.path.join(temp_dir, f"pipefx_transcript_track{track_index}.srt")

        # Clean up any leftover file from a previous run
        if os.path.exists(srt_path):
            try:
                os.remove(srt_path)
            except OSError:
                pass

        export_type = getattr(resolve, "EXPORT_SUBTITLE", None)
        export_subtype = getattr(resolve, "EXPORT_SRT", None)

        # DaVinci Resolve enum values vary across versions.
        # Known defaults: EXPORT_SUBTITLE = 2, EXPORT_SRT = 0
        if export_type is None:
            export_type = 2
        if export_subtype is None:
            export_subtype = 0

        try:
            success = timeline.Export(srt_path, export_type, export_subtype)
        except Exception as e:
            return json.dumps({"error": f"DaVinci Export API error: {e}"})

        if not success or not os.path.exists(srt_path):
            return json.dumps({
                "error": "Failed to export subtitles from DaVinci Resolve.",
                "suggestion": (
                    "Ensure the subtitle track has content and "
                    "DaVinci Resolve has write access to the temp directory."
                ),
            })

        # Parse the exported SRT
        try:
            with open(srt_path, "r", encoding="utf-8") as f:
                content = f.read()

            transcript = _parse_srt(content)
        except Exception as e:
            return json.dumps({"error": f"Failed to parse exported SRT: {e}"})
        finally:
            # Always clean up the temp file
            try:
                os.remove(srt_path)
            except OSError:
                pass

        if not transcript:
            return json.dumps({
                "error": "Subtitle track exists but no subtitle entries were found.",
                "suggestion": "Please ensure your subtitle track has clips on it.",
            })

        return json.dumps({
            "timeline": timeline.GetName(),
            "subtitle_track": track_index,
            "total_entries": len(transcript),
            "transcript": transcript,
        }, indent=2)
