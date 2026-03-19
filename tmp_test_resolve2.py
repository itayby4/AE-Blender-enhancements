import sys
import os

# Add the src dir to path so we can import the mcp_davinci package
workspace = r"c:/Users/itayb/Documents/GitHub/pipefx/apps/mcp-davinci/src"
sys.path.append(workspace)

from mcp_davinci.resolve_connector import ResolveConnector

def main():
    connector = ResolveConnector()
    try:
        timeline = connector.get_timeline()
        print("Got timeline:", timeline.GetName())
    except Exception as e:
        print("Error getting timeline:", e)
        return

    print("\nTimeline Methods:")
    import pprint
    pprint.pprint([m for m in dir(timeline) if not m.startswith('_')])

    print("\nGetting subtitle items...")
    # 1 is video, 2 is audio, 3 is subtitle.
    items = timeline.GetItemListInTrack("subtitle", 1)
    if items:
        print("First subtitle item:", items[0].GetName())
        print("Methods:")
        pprint.pprint([m for m in dir(items[0]) if not m.startswith('_')])

if __name__ == "__main__":
    main()
