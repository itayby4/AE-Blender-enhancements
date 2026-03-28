"""
Diagnostic: Export current timeline FCPXML and show its structure.
Run with DaVinci Resolve open:
    python apps/mcp-davinci/src/mcp_davinci/tools/test_export.py
"""
import sys
import os
import tempfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from mcp_davinci.resolve_connector import ResolveConnector

def fraction_to_float(frac_str):
    if not frac_str:
        return 0.0
    s = frac_str.replace('s', '')
    if '/' in s:
        num, den = s.split('/')
        return float(num) / float(den)
    return float(s)

def main():
    c = ResolveConnector()
    resolve = c.get_resolve()
    project = c.get_project()
    timeline = c.get_timeline()

    print(f"Timeline: {timeline.GetName()}")
    print(f"Start Frame: {timeline.GetStartFrame()}")
    print(f"End Frame: {timeline.GetEndFrame()}")
    print(f"FPS: {project.GetSetting('timelineFrameRate')}")
    print(f"Resolution: {project.GetSetting('timelineResolutionWidth')}x{project.GetSetting('timelineResolutionHeight')}")
    print()

    # Export to FCPXML
    temp_dir = tempfile.gettempdir()
    export_path = os.path.join(temp_dir, "diag_export.fcpxml")

    success = timeline.Export(export_path, getattr(resolve, 'EXPORT_FCPXML_1_8', 6), getattr(resolve, 'EXPORT_NONE', 0))
    if not success:
        success = timeline.Export(export_path, 6, 0)

    if not success or not os.path.exists(export_path):
        print("ERROR: Failed to export timeline to FCPXML!")
        return

    print(f"Exported to: {export_path}")
    print()

    # Parse and show structure
    tree = ET.parse(export_path)
    root = tree.getroot()

    # Show format elements
    for fmt in root.iter("format"):
        print(f"Format: id={fmt.get('id')}, name={fmt.get('name')}, frameDuration={fmt.get('frameDuration')}")

    # Show sequence
    seq = root.find('.//sequence')
    if seq is not None:
        tc_start = seq.get('tcStart', 'N/A')
        tc_start_sec = fraction_to_float(tc_start) if tc_start != 'N/A' else 0
        duration = seq.get('duration', 'N/A')
        duration_sec = fraction_to_float(duration) if duration != 'N/A' else 0
        print(f"\nSequence: tcStart={tc_start} ({tc_start_sec:.2f}s), duration={duration} ({duration_sec:.2f}s), format={seq.get('format')}")

    # Show spine clips
    spine = root.find('.//spine')
    if spine is not None:
        clip_tags = {'clip', 'asset-clip', 'video', 'audio', 'mc-clip', 'ref-clip', 'gap', 'title'}
        print("\nSpine children:")
        for i, child in enumerate(spine):
            if child.tag in clip_tags:
                offset = child.get('offset', 'N/A')
                offset_sec = fraction_to_float(offset) if offset != 'N/A' else 0
                duration = child.get('duration', 'N/A')
                dur_sec = fraction_to_float(duration) if duration != 'N/A' else 0
                start = child.get('start', 'N/A')
                name = child.get('name', 'unnamed')
                print(f"  [{i}] <{child.tag}> name='{name}' offset={offset} ({offset_sec:.2f}s) duration={duration} ({dur_sec:.2f}s) start={start}")

    # Show first 500 chars of raw XML for quick inspection
    print("\n--- First 1000 chars of FCPXML ---")
    with open(export_path, 'r', encoding='utf-8') as f:
        print(f.read()[:1000])

if __name__ == '__main__':
    main()
