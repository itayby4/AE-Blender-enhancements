import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
workspace = r"c:/Users/itayb/Documents/GitHub/pipefx/apps/mcp-davinci/src"
sys.path.append(workspace)

from mcp_davinci.resolve_connector import ResolveConnector

def main():
    connector = ResolveConnector()
    try:
        timeline = connector.get_timeline()
        items = timeline.GetItemListInTrack("video", 1)
        if items:
            clip = items[0]
            print(f"Clip Name: {clip.GetName()}")
            print(f"Start: {clip.GetStart()}, End: {clip.GetEnd()}")
            import pprint
            try:
                props = clip.GetProperty()
                print("Properties:")
                pprint.pprint(props)
            except Exception as e:
                print("GetProperty failed:", e)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
