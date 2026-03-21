import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_davinci.resolve_connector import ResolveConnector

connector = ResolveConnector()
project = connector.get_project()

out = ""

# List all available render formats
formats = project.GetRenderFormats()
out += "=== Available Render Formats ===\n"
for fmt_name, fmt_ext in formats.items():
    out += f"  Format: '{fmt_name}' -> Extension: '{fmt_ext}'\n"
    # For each format, list codecs
    codecs = project.GetRenderCodecs(fmt_name)
    if codecs:
        for codec_name, codec_ext in codecs.items():
            out += f"    Codec: '{codec_name}' -> Extension: '{codec_ext}'\n"

with open("test_da_out.txt", "w") as f:
    f.write(out)
