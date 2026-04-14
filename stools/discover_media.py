"""
discover_media.py
Parses either FCP7 XML (Premiere Pro) or FCPXML 1.8 (DaVinci Resolve) to extract:
  - Video file paths (one per track = one per camera)
  - Audio file paths (unique source files on audio tracks)
  - Number of audio channels for each discovered audio file (via ffprobe)
  - Timeline FPS and duration in seconds

Auto-detects the XML format based on root element.
"""
import xml.etree.ElementTree as ET
import argparse
import urllib.parse
import os
import json
import sys
import subprocess

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass


def get_file_path(node):
    """Extract a local file path from an XML <file> node's <pathurl>."""
    pathurl = node.find('pathurl')
    if pathurl is not None and pathurl.text:
        path = pathurl.text.replace('file://localhost/', '').replace('file://', '')
        path = urllib.parse.unquote(path)
        if os.name == 'nt' and path.startswith('/'):
            path = path[1:]
        return path
    return None


def parse_rate(node):
    """Extract FPS from an FCP7 <rate> element. Returns float or None."""
    rate_el = node.find('rate')
    if rate_el is not None:
        tb = rate_el.find('timebase')
        ntsc = rate_el.find('ntsc')
        if tb is not None and tb.text:
            fps = float(tb.text)
            # NTSC pulldown: 30 -> 29.97, 24 -> 23.976, 60 -> 59.94
            if ntsc is not None and ntsc.text and ntsc.text.upper() == 'TRUE':
                fps = fps * 1000.0 / 1001.0
            return fps
    return None


def fraction_to_float(frac_str: str) -> float:
    """Convert FCPXML fractional string like '360000/24000s' or '10s' to float."""
    if not frac_str:
        return 0.0
    s = frac_str.replace('s', '')
    if '/' in s:
        num, den = s.split('/')
        return float(num) / float(den)
    return float(s)


def get_audio_channels(filepath: str) -> int:
    """Use ffprobe to discover how many audio channels a file has."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_streams",
                "-select_streams", "a:0",
                filepath,
            ],
            capture_output=True, text=True, encoding='utf-8',
        )
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        if streams:
            return int(streams[0].get("channels", 1))
    except Exception:
        pass
    return 1


# ──────────────────────────────────────────────────────────
# FCP7 XML Parser (Premiere Pro)
# ──────────────────────────────────────────────────────────

def parse_fcp7(root):
    """Parse FCP7 XML (xmeml) and return media config dict."""

    # FPS
    fps = None
    seq = root.find('.//sequence')
    if seq is not None:
        fps = parse_rate(seq)
    if fps is None:
        first_clip = root.find('.//clipitem')
        if first_clip is not None:
            fps = parse_rate(first_clip)
    if fps is None:
        fps = 24.0

    # Duration
    duration_sec = 0.0
    if seq is not None:
        dur_el = seq.find('duration')
        if dur_el is not None and dur_el.text:
            duration_frames = int(dur_el.text)
            duration_sec = duration_frames / fps

    # Video tracks (Cameras)
    video_node = root.find('.//media/video')
    cameras = []
    video_paths = []
    if video_node is not None:
        track_idx = 1
        for track in video_node.findall('track'):
            file_path = None
            for clip in track.findall('clipitem'):
                f_node = clip.find('file')
                if f_node is not None:
                    file_path = get_file_path(f_node)
                    if file_path:
                        break
            if file_path:
                cameras.append({
                    "id": str(track_idx),
                    "name": f"Camera {track_idx}",
                    "path": file_path
                })
                if file_path not in video_paths:
                    video_paths.append(file_path)
            track_idx += 1

    # Audio tracks (Sources)
    audio_node = root.find('.//media/audio')
    unique_audio_files = []
    if audio_node is not None:
        for track in audio_node.findall('track'):
            for clip in track.findall('clipitem'):
                f_node = clip.find('file')
                if f_node is not None:
                    path = get_file_path(f_node)
                    if path and path not in unique_audio_files:
                        unique_audio_files.append(path)

    return fps, duration_sec, cameras, video_paths, unique_audio_files


# ──────────────────────────────────────────────────────────
# FCPXML Parser (DaVinci Resolve)
# ──────────────────────────────────────────────────────────

def parse_fcpxml_src(src: str) -> str:
    """Convert an FCPXML src URL to a local file path.
    
    DaVinci Resolve uses:  file://localhost/C:/Users/...
    FCP may use:           file:///C:/Users/...
    """
    if not src:
        return ''
    # Strip the scheme + authority
    for prefix in ('file://localhost/', 'file:///'):
        if src.startswith(prefix):
            src = src[len(prefix):]
            break
    path = urllib.parse.unquote(src)
    # On Windows, ensure drive letter paths don't start with /
    if os.name == 'nt' and path.startswith('/'):
        path = path[1:]
    return path


def parse_fcpxml(root):
    """Parse FCPXML 1.8 (DaVinci Resolve) and return media config dict."""

    # ── Build asset lookup ──
    # Assets live under <resources> and carry hasVideo/hasAudio flags
    assets = {}          # id -> {path, hasVideo, hasAudio, channels}
    for asset in root.iter('asset'):
        asset_id = asset.get('id', '')
        src = asset.get('src', '')
        if not src:
            continue
        path = parse_fcpxml_src(src)
        has_video = asset.get('hasVideo', '0') == '1'
        has_audio = asset.get('hasAudio', '0') == '1'
        channels = int(asset.get('audioChannels', '0'))
        assets[asset_id] = {
            'path': path,
            'hasVideo': has_video,
            'hasAudio': has_audio,
            'channels': channels,
            'name': asset.get('name', os.path.basename(path)),
        }

    # ── FPS from the first <format> with frameDuration ──
    fps = 24.0
    for fmt in root.iter('format'):
        fd_str = fmt.get('frameDuration', '')
        if fd_str:
            frame_dur = fraction_to_float(fd_str)
            if frame_dur > 0:
                fps = 1.0 / frame_dur
                break

    # ── Duration from sequence ──
    duration_sec = 0.0
    seq = root.find('.//sequence')
    if seq is not None:
        dur_str = seq.get('duration', '')
        if dur_str:
            duration_sec = fraction_to_float(dur_str)

    # ── Collect all asset refs used in the timeline ──
    # In DaVinci FCPXML, the structure is:
    #   <spine>
    #     <clip name="CamA" ...>           ← wrapper (no ref attr)
    #       <video ref="r1" .../>          ← actual asset reference for video
    #       <clip lane="1" ...>            ← nested camera 2
    #         <video ref="r3" .../>
    #       </clip>
    #       <asset-clip ref="r4" .../>     ← audio on a lane
    #       <asset-clip ref="r5" .../>
    #     </clip>
    #   </spine>
    #
    # So we must:
    #  1. Iterate ALL <video> elements to find video asset refs
    #  2. Iterate ALL <asset-clip> elements to find audio/video asset refs
    #  3. Also check <audio> elements

    seen_video_paths = []
    cameras = []
    video_paths = []
    unique_audio_files = []

    # Pass 1: Find all <video ref="..."> elements (these are always video)
    for vid_el in root.iter('video'):
        ref = vid_el.get('ref', '')
        asset_info = assets.get(ref)
        if not asset_info:
            continue
        path = asset_info['path']
        if path and path not in seen_video_paths:
            seen_video_paths.append(path)
            track_idx = len(cameras) + 1
            cameras.append({
                "id": str(track_idx),
                "name": asset_info.get('name', f"Camera {track_idx}"),
                "path": path
            })
            video_paths.append(path)

    # Pass 2: Find all <asset-clip ref="..."> elements
    for ac_el in root.iter('asset-clip'):
        ref = ac_el.get('ref', '')
        asset_info = assets.get(ref)
        if not asset_info:
            continue
        path = asset_info['path']
        if not path:
            continue

        if asset_info['hasVideo'] and not asset_info['hasAudio']:
            # Pure video asset-clip
            if path not in seen_video_paths:
                seen_video_paths.append(path)
                track_idx = len(cameras) + 1
                cameras.append({
                    "id": str(track_idx),
                    "name": asset_info.get('name', f"Camera {track_idx}"),
                    "path": path
                })
                video_paths.append(path)
        elif asset_info['hasAudio'] and not asset_info['hasVideo']:
            # Pure audio asset-clip
            if path not in unique_audio_files:
                unique_audio_files.append(path)
        else:
            # Has both video and audio — classify by lane
            # Items on lane >= 2 that are audio-only files are audio
            # Items on lane 0 or 1 (or no lane) are usually video
            lane = ac_el.get('lane', '')
            if lane and int(lane) >= 2 and not asset_info['hasVideo']:
                if path not in unique_audio_files:
                    unique_audio_files.append(path)
            elif asset_info['hasVideo']:
                if path not in seen_video_paths:
                    seen_video_paths.append(path)
                    track_idx = len(cameras) + 1
                    cameras.append({
                        "id": str(track_idx),
                        "name": asset_info.get('name', f"Camera {track_idx}"),
                        "path": path
                    })
                    video_paths.append(path)

    # Pass 3: Any remaining assets that are audio-only and not yet captured
    # (safety net for unusual layouts)
    for asset_id, info in assets.items():
        if info['hasAudio'] and not info['hasVideo']:
            if info['path'] and info['path'] not in unique_audio_files:
                # Check if this asset is actually used in the timeline
                # by seeing if any element references it
                for el in root.iter():
                    if el.get('ref') == asset_id:
                        unique_audio_files.append(info['path'])
                        break

    return fps, duration_sec, cameras, video_paths, unique_audio_files


# ──────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract media info from FCP7 XML or FCPXML")
    parser.add_argument("--xml", required=True, help="Path to XML file (FCP7 or FCPXML)")
    parser.add_argument("--out", required=True, help="Path to save JSON config")
    args = parser.parse_args()

    tree = ET.parse(args.xml)
    root = tree.getroot()

    # Auto-detect format
    root_tag = root.tag.lower()
    if root_tag == 'fcpxml':
        print("Detected FCPXML format (DaVinci Resolve).", flush=True)
        fps, duration_sec, cameras, video_paths, unique_audio_files = parse_fcpxml(root)
    else:
        print("Detected FCP7 XML format (Premiere Pro).", flush=True)
        fps, duration_sec, cameras, video_paths, unique_audio_files = parse_fcp7(root)

    # Scrape channel info for each audio file
    audio_sources = []
    for af in unique_audio_files:
        if os.path.exists(af):
            channels = get_audio_channels(af)
            audio_sources.append({
                "path": af,
                "name": os.path.basename(af),
                "channels": channels
            })

    config = {
        "cameras": cameras,
        "videos": video_paths,  # mapping for sentient mapper legacy
        "audio_sources": audio_sources,
        "fps": fps,
        "duration_sec": duration_sec,
    }

    # Master audio heuristic for backward compatibility
    if audio_sources:
        config["master_audio"] = audio_sources[0]["path"]
    elif video_paths:
        config["master_audio"] = video_paths[0]
    else:
        config["master_audio"] = ""

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print(f"Discovered {len(cameras)} cameras, {len(audio_sources)} audio source files, "
          f"fps={fps}, duration={duration_sec:.1f}s", flush=True)


if __name__ == '__main__':
    main()
