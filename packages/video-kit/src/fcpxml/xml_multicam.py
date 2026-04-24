"""
xml_multicam.py
Applies multicam cuts to either FCP7 XML (Premiere Pro) or FCPXML 1.8 (DaVinci Resolve).
Auto-detects the format based on root element.

Cuts JSON: [{"start_seconds": 0.0, "end_seconds": 5.0, "camera": "1"}, ...]
"""
import xml.etree.ElementTree as ET
import copy
import argparse
import json
import os

# ──────────────────────────────────────────────────────────
# Shared utilities
# ──────────────────────────────────────────────────────────

def time_to_frames(seconds: float, timebase: int) -> int:
    return int(round(seconds * timebase))


def fraction_to_float(frac_str: str) -> float:
    """Convert FCPXML fractional string like '360000/24000s' or '10s' to float."""
    if not frac_str:
        return 0.0
    s = frac_str.replace('s', '')
    if '/' in s:
        num, den = s.split('/')
        return float(num) / float(den)
    return float(s)


def float_to_fraction(val: float, den: int = 24000) -> str:
    """Convert float back to FCPXML fraction string like '120000/24000s'."""
    num = int(round(val * den))
    if num % den == 0:
        return f"{num // den}s"
    return f"{num}/{den}s"


# ──────────────────────────────────────────────────────────
# FCP7 XML Slicer (Premiere Pro)
# ──────────────────────────────────────────────────────────

def apply_cuts_fcp7(root, cuts):
    """Apply multicam cuts to FCP7 XML (Premiere Pro xmeml format)."""

    sequence = root.find('.//sequence')
    if sequence is None:
        raise ValueError("Could not find <sequence> in XML.")

    # Rename the sequence
    name_node = sequence.find('name')
    original_name = name_node.text if name_node is not None else 'Untitled'
    new_name = f"{original_name} - AutoPod Edit"
    if name_node is not None:
        name_node.text = new_name
    print(f"Sequence renamed: '{original_name}' -> '{new_name}'", flush=True)

    rate = sequence.find('.//rate')
    timebase = 24
    if rate is not None:
        tb_node = rate.find('timebase')
        if tb_node is not None and tb_node.text:
            timebase = int(tb_node.text)

    # Convert cuts to frames
    frame_cuts = []
    for c in cuts:
        start_f = time_to_frames(c['start_seconds'], timebase)
        end_f = time_to_frames(c['end_seconds'], timebase)
        frame_cuts.append({"start": start_f, "end": end_f, "camera": str(c["camera"])})

    video_node = sequence.find('media/video')
    if video_node is None:
        raise ValueError("No video media found.")

    tracks = video_node.findall('track')

    # Global counter for unique clip IDs
    clip_counter = 1000

    # Track which <file id="..."> definitions we've already emitted
    # Determine which cameras are actually referenced in the cut list
    active_cameras = set(c['camera'] for c in frame_cuts)

    # Process each video track
    for track_idx, track in enumerate(tracks):
        camera_id = str(track_idx + 1)

        # Skip tracks that aren't mapped to active cameras 
        if camera_id not in active_cameras:
            print(f"  Track is Camera {camera_id} but has no cuts. Keeping intact.")
            continue
            
        # Standard AutoPod optimization: Leave Camera 1 as a continuous base track!
        # This prevents breaking the foundation track into a thousand chunks, improving performance 
        # in DaVinci Resolve and making color grading the wide shot drastically easier.
        if camera_id == '1':
            print(f"  Track is mapped to Camera {camera_id}. Keeping continuous base track uncut.")
            continue

        # We will build a new list of children for this track
        new_track_children = []

        old_items = list(track)

        for item in old_items:
            if item.tag != 'clipitem' and item.tag != 'generatoritem':
                new_track_children.append(item)
                continue

            start_node = item.find('start')
            end_node = item.find('end')
            in_node = item.find('in')
            out_node = item.find('out')

            if start_node is None or end_node is None or in_node is None or out_node is None:
                new_track_children.append(item)
                continue

            clip_start = int(start_node.text)
            clip_end = int(end_node.text)
            clip_in = int(in_node.text)

            original_clip_id = item.get('id', '')

            for cut in frame_cuts:
                overlap_start = max(clip_start, cut['start'])
                overlap_end = min(clip_end, cut['end'])

                if overlap_start < overlap_end:
                    if cut['camera'] == camera_id:
                        piece = copy.deepcopy(item)

                        clip_counter += 1
                        new_clip_id = f"clipitem-autopod-{clip_counter}"
                        piece.set('id', new_clip_id)

                        offset = overlap_start - clip_start
                        duration = overlap_end - overlap_start
                        new_in = clip_in + offset
                        new_out = new_in + duration

                        piece.find('start').text = str(overlap_start)
                        piece.find('end').text = str(overlap_end)
                        piece.find('in').text = str(new_in)
                        piece.find('out').text = str(new_out)

                        ticks_per_frame = 254016000000 // timebase
                        ppro_in = piece.find('pproTicksIn')
                        ppro_out = piece.find('pproTicksOut')
                        if ppro_in is not None:
                            ppro_in.text = str(new_in * ticks_per_frame)
                        if ppro_out is not None:
                            ppro_out.text = str(new_out * ticks_per_frame)

                        for link in piece.findall('.//link'):
                            link_clip_ref = link.find('clipref')
                            if link_clip_ref is not None and link_clip_ref.text == original_clip_id:
                                link_clip_ref.text = new_clip_id

                        file_node = piece.find('file')
                        if file_node is not None:
                            # Do not strip out the inner content of repeated file nodes.
                            # DaVinci Resolve struggles/lags heavily when trying to resolve
                            # empty <file id="..."> tags, unlike Premiere Pro.
                            pass

                        new_track_children.append(piece)

        for child in list(track):
            track.remove(child)
        for child in new_track_children:
            track.append(child)

    total = sum(len(t.findall('clipitem')) for t in tracks)
    print(f"FCP7 XML multicam slicing complete: {total} clip pieces across {len(tracks)} tracks", flush=True)

    return 'xmeml'


# ──────────────────────────────────────────────────────────
# FCPXML Slicer (DaVinci Resolve)
# ──────────────────────────────────────────────────────────

def apply_cuts_fcpxml(root, cuts):
    """Apply multicam cuts to FCPXML 1.8 (DaVinci Resolve format).
    
    DaVinci nests everything in the spine. A primary <clip> acts as the anchor,
    and Camera 2, audio tracks, etc. are nested inside as <clip lane="..."> or
    <asset-clip>. 
    
    We slice the timeline by:
    1. Replicating the spine for every cut duration.
    2. Adjusting the offset, start, duration fields recursively.
    3. Trimming <video> / <asset-clip> elements that belong to inactive cameras.
    """

    sequence = root.find('.//sequence')
    if sequence is None:
        raise ValueError("No <sequence> found in FCPXML")

    # Get sequence tcStart
    seq_start_str = sequence.get('tcStart', '0s')
    seq_start = fraction_to_float(seq_start_str)

    # Get denominator for fraction math
    format_ref = sequence.get('format', '')
    den = 24000  # default
    if format_ref:
        fmt = root.find(f".//format[@id='{format_ref}']")
        if fmt is not None:
            fd = fmt.get('frameDuration', '')
            if fd and '/' in fd.replace('s', ''):
                den = int(fd.replace('s', '').split('/')[1])

    # Build asset lookup: id -> src path
    assets = {}
    for asset in root.iter('asset'):
        asset_id = asset.get('id', '')
        src = asset.get('src', '')
        if src:
            for prefix in ('file://localhost/', 'file:///'):
                if src.startswith(prefix):
                    src = src[len(prefix):]
                    break
            import urllib.parse
            path = urllib.parse.unquote(src)
            if os.name == 'nt' and path.startswith('/'):
                path = path[1:]
            assets[asset_id] = path

    # Build camera index
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.mxf', '.r3d', '.braw',
                  '.prores', '.dnxhd', '.m4v', '.webm', '.wmv', '.mpg', '.mpeg'}
    camera_by_path = {}
    camera_paths = []

    for asset_id, path in assets.items():
        ext = os.path.splitext(path)[1].lower()
        if ext in video_exts or ext == '':
            if path not in camera_by_path:
                cam_id = str(len(camera_paths) + 1)
                camera_by_path[path] = cam_id
                camera_paths.append(path)

    camera_by_asset = {}
    for asset_id, path in assets.items():
        if path in camera_by_path:
            camera_by_asset[asset_id] = camera_by_path[path]

    # Find the spine
    spines = root.findall('.//spine')
    if not spines:
        raise ValueError("No <spine> found in FCPXML")
    primary_spine = spines[0]
    new_spine = ET.Element('spine')

    current_sequence_offset = seq_start
    clip_tags = {'clip', 'asset-clip', 'title', 'video', 'audio', 'mc-clip', 'ref-clip', 'gap'}

    processed_clip_count = 0

    for cut in cuts:
        start_sec = cut.get('start_seconds', 0.0)
        end_sec = cut.get('end_seconds', 0.0)
        cut_camera = str(cut.get('camera', '1'))

        # Resolve relative vs absolute
        if start_sec >= seq_start and seq_start > 0:
            abs_slice_start = start_sec
            abs_slice_end = end_sec
        else:
            abs_slice_start = seq_start + start_sec
            abs_slice_end = seq_start + end_sec
            
        cut_duration = abs_slice_end - abs_slice_start
        if cut_duration <= 0:
            continue
            
        shift_amount = abs_slice_start - current_sequence_offset
        spine_copy = copy.deepcopy(primary_spine)

        # Function 1: Slicing time limits recursively
        def slice_element_time(parent):
            elements_to_remove = []
            for child in parent:
                if child.tag in clip_tags:
                    offset_str = child.get('offset', '0s')
                    duration_str = child.get('duration', '0s')
                    start_str = child.get('start', '0s')
                    
                    offset = fraction_to_float(offset_str)
                    duration = fraction_to_float(duration_str)
                    start = fraction_to_float(start_str)
                    
                    end = offset + duration
                    
                    # If this block is totally outside our cut, kill it
                    if end <= abs_slice_start or offset >= abs_slice_end:
                        elements_to_remove.append(child)
                        continue
                        
                    new_offset = offset
                    new_start = start
                    new_duration = duration
                    
                    if offset < abs_slice_start:
                        diff = abs_slice_start - offset
                        new_offset = abs_slice_start
                        new_start += diff
                        new_duration -= diff
                    
                    if (new_offset + new_duration) > abs_slice_end:
                        new_duration = abs_slice_end - new_offset
                        
                    shifted_offset = new_offset - shift_amount
                    
                    child.set('offset', float_to_fraction(shifted_offset, den))
                    child.set('start', float_to_fraction(new_start, den))
                    child.set('duration', float_to_fraction(new_duration, den))
                    
                    # DO NOT RECURSE!
                    # In DaVinci FCPXML, child elements (<video>, nested <clip>)
                    # use offsets tied to the source file's timecode, not the sequence.
                    # The top-level <asset-clip> or <clip> acts as a duration viewport.
            
            for child in elements_to_remove:
                parent.remove(child)

        # Function 2: Remove inactive cameras
        def prune_inactive_cameras(parent):
            elements_to_remove = []
            for child in list(parent):
                if child.tag in ('video', 'asset-clip', 'mc-clip', 'ref-clip'):
                    ref = child.get('ref', '')
                    if ref in camera_by_asset:
                        cam_id = camera_by_asset[ref]
                        if cam_id != cut_camera:
                            elements_to_remove.append(child)
                            continue
                # Recurse down
                prune_inactive_cameras(child)
                
                # Cleanup: If a <clip> wrapper now has no video or audio inside, kill the wrapper.
                if child.tag == 'clip':
                    has_media = False
                    for sub in child:
                        if sub.tag in ('video', 'audio', 'asset-clip', 'clip', 'mc-clip', 'ref-clip'):
                            has_media = True
                            break
                    if not has_media:
                        elements_to_remove.append(child)
            
            for child in elements_to_remove:
                if child in parent:
                    parent.remove(child)

        slice_element_time(spine_copy)
        prune_inactive_cameras(spine_copy)
        
        # Append surviving clips for this cut to the new spine
        for child in list(spine_copy):
            new_spine.append(child)
            processed_clip_count += 1
            
        current_sequence_offset += cut_duration
        
    sequence.remove(primary_spine)
    sequence.append(new_spine)
    
    total_duration = current_sequence_offset - seq_start
    sequence.set('duration', float_to_fraction(total_duration, den))

    # Rename the sequence/project
    for project_el in root.iter('project'):
        old_name = project_el.get('name', 'Untitled')
        project_el.set('name', f"{old_name} - AutoPod Edit")
        break

    print(f"FCPXML multicam slicing complete: {processed_clip_count} cut segments generated", flush=True)

    return 'fcpxml'


# ──────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────

def apply_cuts_to_xml(xml_path: str, cuts_path: str, out_path: str):
    """Auto-detect format and apply multicam cuts."""
    with open(cuts_path, 'r') as f:
        cuts = json.load(f)

    tree = ET.parse(xml_path)
    root = tree.getroot()

    root_tag = root.tag.lower()
    if root_tag == 'fcpxml':
        print("Detected FCPXML format (DaVinci Resolve).", flush=True)
        fmt = apply_cuts_fcpxml(root, cuts)
    else:
        print("Detected FCP7 XML format (Premiere Pro).", flush=True)
        fmt = apply_cuts_fcp7(root, cuts)

    tree.write(out_path, encoding='UTF-8', xml_declaration=True)

    # Fix DOCTYPE
    with open(out_path, 'r', encoding='UTF-8') as f:
        content = f.read()
    if '<!DOCTYPE' not in content:
        if fmt == 'fcpxml':
            content = content.replace("<?xml version='1.0' encoding='UTF-8'?>",
                                      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>')
        else:
            content = content.replace("<?xml version='1.0' encoding='UTF-8'?>",
                                      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>')
        if '<?xml' not in content:
            if fmt == 'fcpxml':
                content = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n' + content
            else:
                content = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + content
    with open(out_path, 'w', encoding='UTF-8') as f:
        f.write(content)

    total_cuts = len(cuts)
    print(f"XML multicam slicing complete: {total_cuts} cuts applied", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", required=True, help="Input XML path (FCP7 or FCPXML)")
    parser.add_argument("--cuts", required=True, help="Input cuts JSON path")
    parser.add_argument("--out", required=True, help="Output XML path")

    args = parser.parse_args()
    apply_cuts_to_xml(args.xml, args.cuts, args.out)

if __name__ == '__main__':
    main()
