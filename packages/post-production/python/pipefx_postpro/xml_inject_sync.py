"""
xml_inject_sync.py
Injects synced external audio/video into an FCP7 XML (Premiere Pro / DaVinci Resolve).

Given:
  - An original FCP7 XML (exported from an NLE)
  - A sync-map JSON: { "video_path": { "audio_path": "...", "offset_seconds": 1.234 } }

Produces a new XML with the synced external media placed on new tracks:
  - Audio-only files (.wav, .mp3, etc.) ΓåÆ new audio track(s)
  - Video files (.mp4, .mov, etc.) ΓåÆ new video track + new audio track

Offset semantics (from audio_sync.find_audio_offset):
  - Positive offset ΓåÆ external audio starts AFTER the camera video
  - Negative offset ΓåÆ external audio starts BEFORE the camera video
"""
import xml.etree.ElementTree as ET
import argparse
import copy
import json
import os
import sys
import urllib.parse

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass


def _get_file_path(file_node):
    """Extract a local file path from an FCP7 XML <file> node's <pathurl>."""
    pathurl = file_node.find('pathurl')
    if pathurl is not None and pathurl.text:
        path = pathurl.text.replace('file://localhost/', '').replace('file://', '')
        path = urllib.parse.unquote(path)
        if os.name == 'nt' and path.startswith('/'):
            path = path[1:]
        return path
    return None


def _path_to_url(filepath):
    """Convert a local file path to a file://localhost/ URL for FCP7 XML."""
    abs_path = os.path.abspath(filepath)
    # On Windows, convert backslashes to forward slashes
    url_path = abs_path.replace('\\', '/')
    # URL-encode special characters (but not /:)
    url_path = urllib.parse.quote(url_path, safe='/:')
    return f"file://localhost/{url_path}"


def _parse_rate(node):
    """Extract FPS from an FCP7 <rate> element."""
    rate_el = node.find('rate')
    if rate_el is not None:
        tb = rate_el.find('timebase')
        ntsc = rate_el.find('ntsc')
        if tb is not None and tb.text:
            fps = float(tb.text)
            if ntsc is not None and ntsc.text and ntsc.text.upper() == 'TRUE':
                fps = fps * 1000.0 / 1001.0
            return fps
    return None


VIDEO_EXTENSIONS = {'.mp4', '.mov', '.mxf', '.avi', '.mkv', '.m4v', '.wmv', '.webm', '.ts', '.mpg', '.mpeg'}


def _is_video_file(filepath):
    """Check if a file is a video file based on its extension."""
    _, ext = os.path.splitext(filepath)
    return ext.lower() in VIDEO_EXTENSIONS


def _get_media_duration_frames(media_path, timebase):
    """Get the duration of an audio/video file in frames using ffprobe."""
    try:
        import subprocess
        # Find ffmpeg/ffprobe - look for bundled ffprobe next to this script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        ffprobe = os.path.join(script_dir, 'ffprobe.exe')
        if not os.path.exists(ffprobe):
            ffprobe = 'ffprobe'  # Fallback to system PATH

        result = subprocess.run(
            [ffprobe, '-v', 'quiet', '-print_format', 'json',
             '-show_format', '-show_streams', media_path],
            capture_output=True, text=True, encoding='utf-8'
        )
        info = json.loads(result.stdout)
        duration_sec = float(info.get('format', {}).get('duration', 0))
        return int(round(duration_sec * timebase)), info
    except Exception:
        # Fallback: assume a long duration
        return int(timebase * 3600 * 4), {}  # 4 hours


def _get_video_dimensions(probe_info):
    """Extract width/height from ffprobe stream info."""
    for stream in probe_info.get('streams', []):
        if stream.get('codec_type') == 'video':
            return int(stream.get('width', 1920)), int(stream.get('height', 1080))
    return 1920, 1080


def inject_synced_audio(xml_path, sync_map, out_path):
    """
    Inject synced external audio into an FCP7 XML.

    Args:
        xml_path: Path to the original FCP7 XML.
        sync_map: Dict of { video_source_path: { audio_path, offset_seconds } }.
        out_path: Path to write the output XML.
    """
    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"XML not found: {xml_path}")

    tree = ET.parse(xml_path)
    root = tree.getroot()

    sequence = root.find('.//sequence')
    if sequence is None:
        raise ValueError("Could not find <sequence> in XML.")

    # Parse timeline rate
    fps = _parse_rate(sequence)
    if fps is None:
        fps = 24.0
    rate_el = sequence.find('rate')
    timebase = int(float(rate_el.find('timebase').text)) if rate_el is not None else 24
    is_ntsc = (rate_el.find('ntsc') is not None and
               rate_el.find('ntsc').text and
               rate_el.find('ntsc').text.upper() == 'TRUE') if rate_el is not None else False

    print(f"Timeline: {timebase}fps (NTSC={is_ntsc})", flush=True)

    # Normalize all sync_map paths for comparison
    # Support both old format { vid: { audio_path, offset } }
    # and new format { vid: [ { audio_path, offset }, ... ] }
    normalized_sync_map = {}
    for vid_path, sync_info in sync_map.items():
        norm_key = os.path.normpath(vid_path).lower()
        # Normalize to always be an array
        if isinstance(sync_info, list):
            normalized_sync_map[norm_key] = sync_info
        else:
            normalized_sync_map[norm_key] = [sync_info]

    # Build a lookup: file_id ΓåÆ source_path
    file_paths = {}
    video_node = root.find('.//media/video')
    if video_node is not None:
        for track in video_node.findall('track'):
            for clip in track.findall('clipitem'):
                f_node = clip.find('file')
                if f_node is not None:
                    file_id = f_node.get('id', '')
                    path = _get_file_path(f_node)
                    if path and file_id:
                        file_paths[file_id] = path

    # Collect all video clips and their source paths
    video_clips = []
    if video_node is not None:
        for track in video_node.findall('track'):
            for clip in track.findall('clipitem'):
                f_node = clip.find('file')
                if f_node is None:
                    continue
                file_id = f_node.get('id', '')
                source_path = _get_file_path(f_node) or file_paths.get(file_id, '')
                if not source_path:
                    continue

                start_node = clip.find('start')
                end_node = clip.find('end')
                in_node = clip.find('in')
                out_node = clip.find('out')

                if any(n is None for n in [start_node, end_node, in_node, out_node]):
                    continue

                video_clips.append({
                    'clip': clip,
                    'source_path': source_path,
                    'file_id': file_id,
                    'start': int(start_node.text),
                    'end': int(end_node.text),
                    'in': int(in_node.text),
                    'out': int(out_node.text),
                    'name': clip.find('name').text if clip.find('name') is not None else '',
                })

    if not video_clips:
        print("WARNING: No video clips found in the XML.", flush=True)
        # Still write the file unchanged
        tree.write(out_path, encoding='UTF-8', xml_declaration=True)
        return

    print(f"Found {len(video_clips)} video clips in the timeline.", flush=True)

    # Match video clips to sync entries (each clip may match multiple audio files)
    matched_clips = []
    for vc in video_clips:
        norm_source = os.path.normpath(vc['source_path']).lower()
        sync_entries = normalized_sync_map.get(norm_source)
        if sync_entries:
            for sync_entry in sync_entries:
                matched_clips.append((vc, sync_entry))

    if not matched_clips:
        print("WARNING: No video clips matched any entries in the sync map.", flush=True)
        print(f"  Video sources: {[vc['source_path'] for vc in video_clips]}", flush=True)
        print(f"  Sync map keys: {list(sync_map.keys())}", flush=True)
        tree.write(out_path, encoding='UTF-8', xml_declaration=True)
        return

    print(f"Matched {len(matched_clips)} clip-media pairs to synced media.", flush=True)

    # Group by external media file for track creation
    media_groups = {}
    for vc, sync_entry in matched_clips:
        ext_path = sync_entry['audio_path']
        if ext_path not in media_groups:
            media_groups[ext_path] = []
        media_groups[ext_path].append((vc, sync_entry))

    # Find the audio and video sections of the sequence
    media_node = sequence.find('media')
    audio_node = media_node.find('audio')
    if audio_node is None:
        audio_node = ET.SubElement(media_node, 'audio')
    if video_node is None:
        video_node = ET.SubElement(media_node, 'video')

    # Generate unique file IDs for external media assets
    existing_file_ids = set()
    for el in root.iter():
        fid = el.get('id', '')
        if fid.startswith('file-'):
            existing_file_ids.add(fid)

    next_file_id = 100
    while f"file-{next_file_id}" in existing_file_ids:
        next_file_id += 1

    next_clip_id = 5000
    ticks_per_frame = 254016000000 // timebase

    total_audio_injected = 0
    total_video_injected = 0

    for ext_path, clip_entries in media_groups.items():
        ext_file_id = f"file-{next_file_id}"
        next_file_id += 1

        is_video = _is_video_file(ext_path)
        duration_frames, probe_info = _get_media_duration_frames(ext_path, timebase)
        ext_basename = os.path.basename(ext_path)
        media_type = "video+audio" if is_video else "audio"

        print(f"\nInjecting {media_type} track(s) for: {ext_basename}", flush=True)
        print(f"  Duration: {duration_frames} frames ({duration_frames / timebase:.1f}s)", flush=True)

        # ΓöÇΓöÇ Helper: build one clipitem element ΓöÇΓöÇ
        def _make_clipitem(parent_track, vc, sync_entry, clip_suffix, source_mediatype, source_trackindex):
            nonlocal next_clip_id
            offset_sec = sync_entry['offset_seconds']
            offset_frames = int(round(offset_sec * timebase))

            media_in = vc['in'] + offset_frames
            media_out = vc['out'] + offset_frames

            # Clamp to valid range
            media_in = max(0, media_in)
            media_out = max(media_in + 1, media_out)
            media_out = min(media_out, duration_frames)

            if media_in >= duration_frames:
                print(f"  SKIP clip '{vc['name']}': in ({media_in}) exceeds media length", flush=True)
                return False

            next_clip_id += 1
            clip_id = f"clipitem-sync-{next_clip_id}"

            clip_el = ET.SubElement(parent_track, 'clipitem', {'id': clip_id})

            name_el = ET.SubElement(clip_el, 'name')
            name_el.text = f"{ext_basename} (Synced)"

            enabled_el = ET.SubElement(clip_el, 'enabled')
            enabled_el.text = 'TRUE'

            duration_el = ET.SubElement(clip_el, 'duration')
            duration_el.text = str(duration_frames)

            rate_sub = ET.SubElement(clip_el, 'rate')
            tb_el = ET.SubElement(rate_sub, 'timebase')
            tb_el.text = str(timebase)
            ntsc_el = ET.SubElement(rate_sub, 'ntsc')
            ntsc_el.text = 'TRUE' if is_ntsc else 'FALSE'

            start_el = ET.SubElement(clip_el, 'start')
            start_el.text = str(vc['start'])

            end_el = ET.SubElement(clip_el, 'end')
            end_el.text = str(vc['end'])

            in_el = ET.SubElement(clip_el, 'in')
            in_el.text = str(media_in)

            out_el = ET.SubElement(clip_el, 'out')
            out_el.text = str(media_out)

            ppro_in_el = ET.SubElement(clip_el, 'pproTicksIn')
            ppro_in_el.text = str(media_in * ticks_per_frame)

            ppro_out_el = ET.SubElement(clip_el, 'pproTicksOut')
            ppro_out_el.text = str(media_out * ticks_per_frame)

            # File reference ΓÇö always just reference the shared file ID
            ET.SubElement(clip_el, 'file', {'id': ext_file_id})

            # Source track
            st_el = ET.SubElement(clip_el, 'sourcetrack')
            st_mt = ET.SubElement(st_el, 'mediatype')
            st_mt.text = source_mediatype
            st_ti = ET.SubElement(st_el, 'trackindex')
            st_ti.text = str(source_trackindex)

            print(f"  Γ£ô [{clip_suffix}] '{vc['name']}': timeline [{vc['start']}ΓÇô{vc['end']}], "
                  f"media [{media_in}ΓÇô{media_out}] (offset: {offset_sec:+.3f}s)", flush=True)
            return True

        # ΓöÇΓöÇ Build the shared <file> definition element ΓöÇΓöÇ
        # We need to define it once and reference it from all clipitems.
        # We'll inject it into the first clipitem and then reference from others.
        # Instead, let's pre-create it and inject into first clip.

        # ΓöÇΓöÇ Create tracks ΓöÇΓöÇ

        if is_video:
            # === VIDEO TRACK ===
            vid_track_el = ET.SubElement(video_node, 'track')
            vid_track_el.set('TL.SQTrackShy', '0')
            vid_track_el.set('TL.SQTrackExpandedHeight', '25')
            vid_track_el.set('TL.SQTrackExpanded', '0')
            vid_track_el.set('MZ.TrackTargeted', '1')

            for vc, sync_entry in clip_entries:
                if _make_clipitem(vid_track_el, vc, sync_entry, 'V', 'video', 1):
                    total_video_injected += 1

            enabled_vt = ET.SubElement(vid_track_el, 'enabled')
            enabled_vt.text = 'TRUE'
            locked_vt = ET.SubElement(vid_track_el, 'locked')
            locked_vt.text = 'FALSE'

        # === AUDIO TRACK (always created for both video and audio-only files) ===
        audio_track_el = ET.SubElement(audio_node, 'track')
        audio_track_el.set('TL.SQTrackAudioKeyframeStyle', '0')
        audio_track_el.set('TL.SQTrackShy', '0')
        audio_track_el.set('TL.SQTrackExpandedHeight', '41')
        audio_track_el.set('TL.SQTrackExpanded', '0')
        audio_track_el.set('MZ.TrackTargeted', '1')
        audio_track_el.set('PannerCurrentValue', '0.5')
        audio_track_el.set('PannerIsInverted', 'true')
        audio_track_el.set('PannerStartKeyframe', '-91445760000000000,0.5,0,0,0,0,0,0')
        audio_track_el.set('PannerName', 'Balance')
        audio_track_el.set('currentExplodedTrackIndex', '0')
        audio_track_el.set('totalExplodedTrackCount', '1')
        audio_track_el.set('premiereTrackType', 'Mono')

        for vc, sync_entry in clip_entries:
            if _make_clipitem(audio_track_el, vc, sync_entry, 'A', 'audio', 1):
                total_audio_injected += 1

        enabled_at = ET.SubElement(audio_track_el, 'enabled')
        enabled_at.text = 'TRUE'
        locked_at = ET.SubElement(audio_track_el, 'locked')
        locked_at.text = 'FALSE'
        output_ch = ET.SubElement(audio_track_el, 'outputchannelindex')
        output_ch.text = '1'

        # Now inject the shared <file> definition into the FIRST clipitem that references it
        # Find the first clipitem with our file ID and expand it
        first_ref = None
        for el in root.iter('clipitem'):
            f_el = el.find('file')
            if f_el is not None and f_el.get('id') == ext_file_id and len(f_el) == 0:
                first_ref = f_el
                break

        if first_ref is not None:
            fn_el = ET.SubElement(first_ref, 'name')
            fn_el.text = ext_basename
            pathurl_el = ET.SubElement(first_ref, 'pathurl')
            pathurl_el.text = _path_to_url(ext_path)

            file_rate = ET.SubElement(first_ref, 'rate')
            file_tb = ET.SubElement(file_rate, 'timebase')
            file_tb.text = str(timebase)
            file_ntsc = ET.SubElement(file_rate, 'ntsc')
            file_ntsc.text = 'TRUE' if is_ntsc else 'FALSE'

            file_dur = ET.SubElement(first_ref, 'duration')
            file_dur.text = str(duration_frames)

            file_media = ET.SubElement(first_ref, 'media')

            if is_video:
                # Video characteristics
                vid_width, vid_height = _get_video_dimensions(probe_info)
                file_vid = ET.SubElement(file_media, 'video')
                file_vid_sc = ET.SubElement(file_vid, 'samplecharacteristics')
                vid_rate = ET.SubElement(file_vid_sc, 'rate')
                vid_rate_tb = ET.SubElement(vid_rate, 'timebase')
                vid_rate_tb.text = str(timebase)
                vid_rate_ntsc = ET.SubElement(vid_rate, 'ntsc')
                vid_rate_ntsc.text = 'TRUE' if is_ntsc else 'FALSE'
                vid_w = ET.SubElement(file_vid_sc, 'width')
                vid_w.text = str(vid_width)
                vid_h = ET.SubElement(file_vid_sc, 'height')
                vid_h.text = str(vid_height)
                vid_anamorphic = ET.SubElement(file_vid_sc, 'anamorphic')
                vid_anamorphic.text = 'FALSE'
                vid_pixelar = ET.SubElement(file_vid_sc, 'pixelaspectratio')
                vid_pixelar.text = 'Square'
                vid_fieldd = ET.SubElement(file_vid_sc, 'fielddominance')
                vid_fieldd.text = 'none'

            # Audio characteristics (always present)
            file_audio = ET.SubElement(file_media, 'audio')
            file_sc = ET.SubElement(file_audio, 'samplecharacteristics')
            depth_el = ET.SubElement(file_sc, 'depth')
            depth_el.text = '16'
            sr_el = ET.SubElement(file_sc, 'samplerate')
            sr_el.text = '48000'
            cc_el = ET.SubElement(file_audio, 'channelcount')
            cc_el.text = '2'

    # Rename the sequence to indicate sync was applied
    name_node = sequence.find('name')
    if name_node is not None:
        original_name = name_node.text or 'Untitled'
        sync_type = 'A/V' if total_video_injected > 0 else 'Audio'
        name_node.text = f"{original_name} - {sync_type} Synced"

    # Write the output
    tree.write(out_path, encoding='UTF-8', xml_declaration=True)

    # Fix DOCTYPE
    with open(out_path, 'r', encoding='UTF-8') as f:
        content = f.read()
    if '<!DOCTYPE' not in content:
        content = content.replace(
            "<?xml version='1.0' encoding='UTF-8'?>",
            '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>'
        )
    if '<?xml' not in content:
        content = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + content
    with open(out_path, 'w', encoding='UTF-8') as f:
        f.write(content)

    total_injected = total_audio_injected + total_video_injected
    print(f"\n[+] Success! Injected {total_injected} synced clips "
          f"({total_video_injected} video, {total_audio_injected} audio) "
          f"across {len(media_groups)} media source(s).", flush=True)
    print(f"    Output: {out_path}", flush=True)


def main():
    parser = argparse.ArgumentParser(
        description="Inject synced external audio into FCP7 XML"
    )
    parser.add_argument("--xml", required=True, help="Input FCP7 XML path")
    parser.add_argument("--sync-map", required=True,
                        help="JSON file: { video_path: { audio_path, offset_seconds } }")
    parser.add_argument("--out", required=True, help="Output XML path")
    args = parser.parse_args()

    with open(args.sync_map, 'r', encoding='utf-8') as f:
        sync_map = json.load(f)

    inject_synced_audio(args.xml, sync_map, args.out)


if __name__ == '__main__':
    main()
