import sys
import os

workspace = r"c:/Users/itayb/Documents/GitHub/pipefx/apps/mcp-davinci/src"
sys.path.append(workspace)

from mcp_davinci.resolve_connector import ResolveConnector

def main():
    connector = ResolveConnector()
    try:
        timeline = connector.get_timeline()
        print("Got timeline:", timeline.GetName())
        
        # Check all tracks to find anything with text
        for track_type in ["audio", "video", "subtitle"]:
            count = timeline.GetTrackCount(track_type)
            print(f"Track type: {track_type}, count: {count}")
            for i in range(1, count + 1):
                items = timeline.GetItemListInTrack(track_type, i)
                if not items: continue
                print(f"  Track {i} has {len(items)} items. Example: {items[0].GetName()}")
                if track_type == "video" and ("Text" in items[0].GetName() or "Subtitle" in items[0].GetName()):
                    print("We have a Text/Subtitle item in video track.")
                if track_type == "subtitle":
                    print("  Subtitle methods:", [m for m in dir(items[0]) if not m.startswith('_')])
    except Exception as e:
        print("Error getting timeline:", e)

if __name__ == "__main__":
    main()
