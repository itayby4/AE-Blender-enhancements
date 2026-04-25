import os
import sys
import argparse

# Reach across to the video-kit Python module (xml_tools.py). Same
# rationale as autopod.py — video-kit's Python utilities aren't shipped
# as an importable package, so we sys.path-inject from a deterministic
# relative path:
#   pipefx_postpro/ → python/ → post-production/ → packages/ → repo root
_VIDEO_KIT_FCPXML_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        '..',
        '..',
        '..',
        '..',
        'packages',
        'video-kit',
        'src',
        'fcpxml',
    )
)
if _VIDEO_KIT_FCPXML_DIR not in sys.path:
    sys.path.insert(0, _VIDEO_KIT_FCPXML_DIR)
from xml_tools import sync_fcpxml_with_external_audio  # noqa: E402

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
