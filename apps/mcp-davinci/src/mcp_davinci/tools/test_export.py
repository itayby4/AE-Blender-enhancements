import sys
import os

# Adjust path so we can import resolve_connector
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src', 'mcp_davinci'))

try:
    from resolve_connector import ResolveConnector
except ImportError:
    # Try another path
    sys.path.append(r"c:\Users\itayb\Documents\GitHub\pipefx\apps\mcp-davinci\src\mcp_davinci")
    from resolve_connector import ResolveConnector

connector = ResolveConnector()
try:
    resolve = connector.get_resolve()
    timeline = connector.get_timeline()
    temp_srt = r"c:\Users\itayb\Desktop\test_export.srt"
    
    print(f"Has EXPORT_SUBTITLES? {hasattr(resolve, 'EXPORT_SUBTITLES')}")
    if hasattr(resolve, 'EXPORT_SUBTITLES'):
        print(f"EXPORT_SUBTITLES value: {resolve.EXPORT_SUBTITLES}")
        print(f"EXPORT_SRT value: {resolve.EXPORT_SRT}")
        success = timeline.Export(temp_srt, resolve.EXPORT_SUBTITLES, resolve.EXPORT_SRT)
        print(f"Export success: {success}")
    else:
        print("resolve object does not have EXPORT_SUBTITLES")
except Exception as e:
    print(f"Error: {e}")
