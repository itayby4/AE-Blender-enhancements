import sys
import os

# fix print encoding
sys.stdout.reconfigure(encoding='utf-8')

workspace = r"c:/Users/itayb/Documents/GitHub/pipefx/apps/mcp-davinci/src"
sys.path.append(workspace)

from mcp_davinci.resolve_connector import ResolveConnector

def main():
    connector = ResolveConnector()
    try:
        timeline = connector.get_timeline()
        print("Got timeline:", timeline.GetName())
        
        for track_type in ["audio", "video", "subtitle"]:
            count = timeline.GetTrackCount(track_type)
            print(f"Track type: {track_type}, count: {count}")
            for i in range(1, count + 1):
                items = timeline.GetItemListInTrack(track_type, i)
                if not items: continue
                print(f"  Track {i} has {len(items)} items. First: {items[0].GetName()}")
                if track_type == "subtitle":
                    print("  Subtitle item methods:")
                    import pprint
                    pprint.pprint([m for m in dir(items[0]) if not m.startswith('_')])
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
