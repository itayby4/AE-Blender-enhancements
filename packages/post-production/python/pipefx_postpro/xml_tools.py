import xml.etree.ElementTree as ET
import os

# Phase 9.5: this file moved out of `packages/video-kit/src/fcpxml/` into
# `pipefx_postpro/` (sibling to audio_sync.py) so the cross-package
# sys.path injection — and the historical `stools/` reference — can be
# dropped. `sync_fcpxml_with_external_audio` is a post-production
# workflow operation (sync external audio into a timeline XML), not a
# generic FCPXML primitive, so it belongs here. Generic FCPXML helpers
# stay in video-kit (xml_multicam.py).
from .audio_sync import find_audio_offset

def sync_fcpxml_with_external_audio(xml_path: str, external_audio_path: str, out_path: str):
    """
    Parses an FCPXML file, finds the video assets, correlates them 
    with external_audio_path, and injects the synced external audio.
    """
    if not os.path.exists(xml_path):
        raise FileNotFoundError(f"FCPXML not found: {xml_path}")
    if not os.path.exists(external_audio_path):
        raise FileNotFoundError(f"External audio not found: {external_audio_path}")

    # Register namespace to avoid 'ns0:' prefix during serialization
    # Resolve uses empty dict or sometimes default FCPXML DTD
    ET.register_namespace('', '')
    
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    # 1. First, we must register the external audio as a resource (asset)
    # FCPXML resources usually sit in /fcpxml/resources
    resources = root.find('resources')
    if resources is None:
        resources = ET.SubElement(root, 'resources')
    
    # Create a unique ID for the external mic asset
    ext_audio_id = "r_external_mic_1"
    
    # Check if we already injected it (idempotency step)
    existing = resources.find(f".//asset[@id='{ext_audio_id}']")
    if not existing:
        asset_node = ET.SubElement(resources, 'asset', {
            'id': ext_audio_id,
            'name': os.path.basename(external_audio_path),
            'src': f"file://{os.path.abspath(external_audio_path).replace(chr(92), '/')}",
            'hasVideo': '0',
            'hasAudio': '1',
            'audioSources': '1',
            'audioChannels': '2' # default to stereo for safety
        })
    
    # 2. Find all unique video assets that we need to correlate against
    # Resolve usually outputs 'src' for each asset
    video_assets = {}
    for asset in resources.findall('asset'):
        if asset.get('hasVideo') == '1':
            video_assets[asset.get('id')] = asset.get('src').replace('file://', '')
    
    if not video_assets:
        print("[-] No video assets found in FCPXML!")
        return

    # 3. Calculate delays (Offset) for each camera file against the external mic
    cached_sync_offsets = {}
    for asset_id, src_path in video_assets.items():
        if not os.path.exists(src_path):
            print(f"[-] Warning: Camera file {src_path} not found on disk. Skipping correlation.")
            cached_sync_offsets[asset_id] = 0.0
            continue
            
        print(f"[*] Correlating {os.path.basename(src_path)} vs external mic...")
        try:
            # Shift value positive means Mic starts after Camera
            # e.g., offset_sec = 2.0 -> We need to delay the mic by 2.0 seconds. 
            offset_sec = find_audio_offset(src_path, external_audio_path)
            cached_sync_offsets[asset_id] = offset_sec
        except Exception as e:
            print(f"[-] Error correlating {src_path}: {e}")
            cached_sync_offsets[asset_id] = 0.0
            
    # 4. Inject into the timeline clips
    # FCPXML has sequence -> spine -> asset-clip
    # For every video asset-clip we find, we anchor an <audio> tag 
    for clip in root.findall(".//asset-clip"):
        ref_id = clip.get('ref')
        if ref_id in cached_sync_offsets:
            sync_shift_sec = cached_sync_offsets[ref_id]
            
            # Remove any existing injected audio to prevent duplicates
            for existing_audio in clip.findall(f"audio[@ref='{ext_audio_id}']"):
                clip.remove(existing_audio)
                
            # Create the anchored audio clip. 
            # In FCPXML, anchored items share the parent's timeline,
            # so its 'offset' is relative to the start of the primary clip.
            # To sync, the anchored audio start time logic goes here.
            # For POC, we will just use FCPXML time rational fractions.
            
            # DaVinci usually uses 24000/1001 for 23.976fps. 
            # We'll just write it as a simple string fraction for seconds:
            shift_fraction = f"{int(sync_shift_sec * 30000)}/30000s"
            
            print(f"[*] Injecting synced external audio under video edit: {clip.get('name')}")
            
            ET.SubElement(clip, 'audio', {
                'ref': ext_audio_id,
                'name': 'Synced Mic (PipeFX)',
                'offset': '0s',            # local offset relative to clip start
                'start': shift_fraction,   # where the mic should cue
                'duration': clip.get('duration', '10s'),
                'lane': '-1'               # place it 1 track below the video
            })

    # Save to out_path
    tree.write(out_path, encoding='utf-8', xml_declaration=True)
    print(f"\n[+] Success! Synced XML written to: {out_path}")
