import sys
import os
import time

sys.stdout.reconfigure(encoding='utf-8')

workspace = r"c:/Users/itayb/Documents/GitHub/pipefx/apps/mcp-davinci/src"
sys.path.append(workspace)

from mcp_davinci.resolve_connector import ResolveConnector

def main():
    connector = ResolveConnector()
    try:
        timeline = connector.get_timeline()
        print("Got timeline:", timeline.GetName())
        
        # Try to generate subtitles
        print("Attempting CreateSubtitlesFromAudio...")
        # Most Resolve methods take no arguments or specific ones. 
        # CreateSubtitlesFromAudio() usually takes no args or a dictionary of settings. Let's try without args or default args.
        try:
            res = timeline.CreateSubtitlesFromAudio()
            print("CreateSubtitlesFromAudio result:", res)
            
            # waiting for it to process?
            time.sleep(5)
            
            count = timeline.GetTrackCount("subtitle")
            print(f"Subtitle track count: {count}")
            if count > 0:
                items = timeline.GetItemListInTrack("subtitle", 1)
                print(f"Subtitle 1 items: {len(items)}")
        except Exception as e:
            print("Failed to CreateSubtitlesFromAudio:", e)

    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
