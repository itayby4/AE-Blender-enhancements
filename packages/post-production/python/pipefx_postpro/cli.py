import sys
import argparse

# Phase 9.5: xml_tools.py moved into pipefx_postpro/ alongside this file,
# so the cross-package sys.path injection that previously reached into
# `packages/video-kit/src/fcpxml/` is gone. Plain sibling import now.
from .xml_tools import sync_fcpxml_with_external_audio

def main():
    parser = argparse.ArgumentParser(description="PipeFX Audio Sync Engine (post-production)")
    parser.add_argument("timeline_xml", help="Path to the exported FCPXML from DaVinci Resolve.")
    parser.add_argument("external_audio", help="Path to the external high-quality audio file (.wav/.mp3) to sync.")
    parser.add_argument("-o", "--output", help="Optional path for the destination synced XML output.", default=None)
    
    args = parser.parse_args()
    
    out_path = args.output
    if not out_path:
        # Generate a safe output name
        base = args.timeline_xml.rpartition(".")[0]
        out_path = f"{base}_synced.fcpxml"
        
    print(f"===========================================================")
    print(f" PipeFX Audio Sync Engine (MVP)")
    print(f" Timeline XML:  {args.timeline_xml}")
    print(f" External Mic:  {args.external_audio}")
    print(f" Output target: {out_path}")
    print(f"===========================================================")
    
    try:
        sync_fcpxml_with_external_audio(args.timeline_xml, args.external_audio, out_path)
    except Exception as e:
        print(f"\n[ERROR] Sync Engine failed: {e}")
        sys.exit(1)
        
if __name__ == "__main__":
    main()
