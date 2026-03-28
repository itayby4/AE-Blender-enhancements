"""
Generates FCPXML 1.8 files with subtitle <title> elements.

Two modes:
1. build_subtitle_fcpxml() – creates a standalone subtitle FCPXML.
2. build_synced_subtitle_fcpxml() – reads an exported timeline FCPXML to extract
   tcStart, duration, fps, and resolution, then builds a synced subtitle FCPXML
   that matches the original timeline's time range exactly.
"""
import xml.etree.ElementTree as ET
import os
import time


def _float_to_fraction(val: float, den: int = 25) -> str:
    """Convert float seconds to FCPXML fractional string like '90000/25s'."""
    num = int(round(val * den))
    if den == 1 or num % den == 0:
        whole = num // den
        return f"{whole}/1s" if den == 1 else f"{whole}s"
    return f"{num}/{den}s"


def _fraction_to_float(frac_str: str) -> float:
    """Convert FCPXML fractional string like '3600/1s' or '10s' to float."""
    if not frac_str:
        return 0.0
    s = frac_str.replace('s', '')
    if '/' in s:
        num, den = s.split('/')
        return float(num) / float(den)
    return float(s)


def _extract_timeline_info(source_fcpxml_path: str) -> dict:
    """
    Parse an exported FCPXML and extract key timeline properties.
    Returns dict with: tc_start, duration, den, width, height, frame_duration.
    """
    tree = ET.parse(source_fcpxml_path)
    root = tree.getroot()

    # Find format element for denominator and resolution
    den = 25  # fallback
    width = 1920
    height = 1080
    frame_duration = "1/25s"

    # Get the sequence's format reference
    sequence = root.find('.//sequence')
    format_ref = sequence.get('format', '') if sequence is not None else ''

    for fmt in root.iter("format"):
        if fmt.get('id') == format_ref or not format_ref:
            fd = fmt.get("frameDuration", "1/25s")
            frame_duration = fd
            fd_clean = fd.replace('s', '')
            if '/' in fd_clean:
                den = int(fd_clean.split('/')[1])
            else:
                den = 1
            w = fmt.get("width")
            h = fmt.get("height")
            if w:
                width = int(w)
            if h:
                height = int(h)
            if fmt.get('id') == format_ref:
                break  # Exact match found

    # Extract sequence timing
    tc_start = 0.0
    duration = 0.0
    tc_start_str = "0s"
    duration_str = "0s"

    if sequence is not None:
        tc_start_str = sequence.get('tcStart', '0s')
        tc_start = _fraction_to_float(tc_start_str)
        duration_str = sequence.get('duration', '0s')
        duration = _fraction_to_float(duration_str)

    return {
        "tc_start": tc_start,
        "tc_start_str": tc_start_str,
        "duration": duration,
        "duration_str": duration_str,
        "den": den,
        "width": width,
        "height": height,
        "frame_duration": frame_duration,
    }


def _add_effect_resource(resources: ET.Element, effect_id: str) -> None:
    """Add a Basic Title effect resource."""
    ET.SubElement(resources, "effect", {
        "id": effect_id,
        "name": "Basic Title",
        "uid": ".../Titles.localized/Build In:Out.localized/Basic Title.localized/Basic Title.moti",
    })


def _build_title_element(
    parent: ET.Element,
    index: int,
    text: str,
    offset_str: str,
    duration_str: str,
    effect_ref: str,
    lane: str = "1",
) -> None:
    """Create a single <title> element as a child of parent."""
    title = ET.SubElement(parent, "title", {
        "name": text[:50],
        "lane": lane,
        "offset": offset_str,
        "ref": effect_ref,
        "duration": duration_str,
    })

    ts_id = f"ts{index}"
    text_style_def = ET.SubElement(title, "text-style-def", id=ts_id)
    ET.SubElement(text_style_def, "text-style", {
        "font": "Arial",
        "fontSize": "48",
        "fontColor": "1 1 1 1",
        "bold": "1",
        "shadowColor": "0 0 0 0.75",
        "shadowOffset": "3 315",
        "alignment": "center",
    })

    text_elem = ET.SubElement(title, "text")
    text_style_elem = ET.SubElement(text_elem, "text-style", ref=ts_id)
    text_style_elem.text = text


def _write_fcpxml(tree: ET.ElementTree, output_path: str) -> None:
    """Write FCPXML tree to file with proper DOCTYPE."""
    tree.write(output_path, encoding="UTF-8", xml_declaration=True)

    with open(output_path, "r", encoding="UTF-8") as f:
        content = f.read()
    if "<!DOCTYPE" not in content:
        content = content.replace(
            "<?xml version='1.0' encoding='UTF-8'?>",
            '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>',
        )
        if "<?xml" not in content:
            content = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n' + content
        with open(output_path, "w", encoding="UTF-8") as f:
            f.write(content)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_synced_subtitle_fcpxml(
    source_fcpxml_path: str,
    subtitles: list[dict],
    output_path: str,
    timeline_name: str = "Subtitles",
) -> str:
    """
    Build a subtitle FCPXML that is synced with the original timeline.

    1. Reads the exported FCPXML to extract tcStart, duration, resolution, fps.
    2. Creates a new FCPXML with a gap spanning the full timeline duration
       (same tcStart and duration as the original).
    3. Adds <title> elements anchored at the correct absolute positions.

    This means the subtitle timeline has the same time range as the original,
    so opening both timelines side-by-side shows them in perfect sync.
    """
    info = _extract_timeline_info(source_fcpxml_path)
    den = info["den"]
    tc_start = info["tc_start"]

    # Build new FCPXML
    fcpxml = ET.Element("fcpxml", version="1.8")
    resources = ET.SubElement(fcpxml, "resources")

    format_id = "r1"
    ET.SubElement(resources, "format", {
        "id": format_id,
        "name": f"FFVideoFormat{info['height']}p",
        "frameDuration": info["frame_duration"],
        "width": str(info["width"]),
        "height": str(info["height"]),
    })

    effect_id = "r2"
    _add_effect_resource(resources, effect_id)

    # Library > Event > Project > Sequence
    library = ET.SubElement(fcpxml, "library")
    event = ET.SubElement(library, "event", name=timeline_name)
    project = ET.SubElement(event, "project", name=timeline_name)

    sequence = ET.SubElement(project, "sequence", {
        "format": format_id,
        "duration": info["duration_str"],
        "tcStart": info["tc_start_str"],
        "tcFormat": "NDF",
    })

    spine = ET.SubElement(sequence, "spine")

    # Create a gap that spans the entire timeline (same tcStart-based offset)
    gap = ET.SubElement(spine, "gap", {
        "name": "Gap",
        "offset": info["tc_start_str"],
        "duration": info["duration_str"],
    })

    # Add each subtitle as an anchored title on the gap
    for i, sub in enumerate(subtitles, 1):
        start_sec = float(sub.get("start_seconds", 0))
        end_sec = float(sub.get("end_seconds", 0))
        text = sub.get("text", "")
        dur_sec = end_sec - start_sec

        if dur_sec <= 0:
            continue

        # Absolute offset = tcStart + subtitle seconds
        abs_offset = tc_start + start_sec

        _build_title_element(
            parent=gap,
            index=i,
            text=text,
            offset_str=_float_to_fraction(abs_offset, den),
            duration_str=_float_to_fraction(dur_sec, den),
            effect_ref=effect_id,
        )

    tree = ET.ElementTree(fcpxml)
    _write_fcpxml(tree, output_path)
    return output_path


def build_subtitle_fcpxml(
    subtitles: list[dict],
    fps: float = 25.0,
    width: int = 1920,
    height: int = 1080,
    timeline_name: str = "Subtitles",
    output_dir: str | None = None,
    tc_start: float = 0.0,
) -> str:
    """
    Build a standalone FCPXML 1.8 file with <title> elements.
    Used as fallback when timeline export is not available.
    """
    if not subtitles:
        raise ValueError("No subtitles provided.")

    # Determine denominator from fps
    known_dens = {
        23.976: 24000, 24.0: 2400, 25.0: 25, 29.97: 30000,
        30.0: 3000, 50.0: 5000, 59.94: 60000, 60.0: 6000,
    }
    den = 25  # default
    for rate, d in known_dens.items():
        if abs(fps - rate) < 0.05:
            den = d
            break

    frame_dur_num = int(round(den / fps))
    frame_dur_str = f"{frame_dur_num}/{den}s" if den != 1 else f"{frame_dur_num}s"

    fcpxml = ET.Element("fcpxml", version="1.8")
    resources = ET.SubElement(fcpxml, "resources")

    format_id = "r1"
    ET.SubElement(resources, "format", {
        "id": format_id,
        "name": f"FFVideoFormat{height}p{int(fps)}",
        "frameDuration": frame_dur_str,
        "width": str(width),
        "height": str(height),
    })

    effect_id = "r2"
    _add_effect_resource(resources, effect_id)

    max_end = max(s.get("end_seconds", 0) for s in subtitles)
    total_duration_str = _float_to_fraction(max_end, den)
    tc_start_str = _float_to_fraction(tc_start, den)

    library = ET.SubElement(fcpxml, "library")
    event = ET.SubElement(library, "event", name=timeline_name)
    project = ET.SubElement(event, "project", name=timeline_name)

    sequence = ET.SubElement(project, "sequence", {
        "format": format_id,
        "duration": total_duration_str,
        "tcStart": tc_start_str,
        "tcFormat": "NDF",
    })

    spine = ET.SubElement(sequence, "spine")

    gap = ET.SubElement(spine, "gap", {
        "name": "Gap",
        "offset": tc_start_str,
        "duration": total_duration_str,
    })

    for i, sub in enumerate(subtitles, 1):
        start_sec = float(sub.get("start_seconds", 0))
        end_sec = float(sub.get("end_seconds", 0))
        text = sub.get("text", "")
        dur_sec = end_sec - start_sec

        if dur_sec <= 0:
            continue

        abs_offset = tc_start + start_sec

        _build_title_element(
            parent=gap,
            index=i,
            text=text,
            offset_str=_float_to_fraction(abs_offset, den),
            duration_str=_float_to_fraction(dur_sec, den),
            effect_ref=effect_id,
        )

    if output_dir is None:
        user_home = os.environ.get("USERPROFILE") or os.path.expanduser("~")
        output_dir = os.path.join(user_home, "Desktop")

    unique_id = int(time.time())
    filename = f"{timeline_name}_{unique_id}.fcpxml"
    output_path = os.path.join(output_dir, filename)

    tree = ET.ElementTree(fcpxml)
    _write_fcpxml(tree, output_path)
    return output_path
