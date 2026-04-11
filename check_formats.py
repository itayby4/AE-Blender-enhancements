import sys, os, traceback

# Redirect output to file
out_path = os.path.join(os.path.dirname(__file__), "formats_output.txt")
with open(out_path, "w") as f:
    try:
        sys.path.insert(0, r'C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules')
        import DaVinciResolveScript as dvr
        f.write("Module loaded OK\n")
        
        resolve = dvr.scriptapp("Resolve")
        if not resolve:
            f.write("ERROR: Could not connect to DaVinci Resolve\n")
            sys.exit(1)
        
        f.write(f"Connected: {resolve.GetProductName()} {resolve.GetVersionString()}\n")
        
        pm = resolve.GetProjectManager()
        proj = pm.GetCurrentProject()
        if not proj:
            f.write("ERROR: No project open\n")
            sys.exit(1)
        
        f.write(f"Project: {proj.GetName()}\n\n")
        
        formats = proj.GetRenderFormats()
        f.write("=== ALL RENDER FORMATS ===\n")
        for key, val in sorted(formats.items()):
            f.write(f"  {key}: {val}\n")
        
        f.write("\n=== MP3 CODECS ===\n")
        f.write(f"  {proj.GetRenderCodecs('mp3')}\n")
        
        f.write("\n=== WAV CODECS ===\n")
        f.write(f"  {proj.GetRenderCodecs('wav')}\n")
        
        f.write("\n=== CURRENT FORMAT & CODEC ===\n")
        f.write(f"  {proj.GetCurrentRenderFormatAndCodec()}\n")
        
    except Exception as e:
        f.write(f"EXCEPTION: {e}\n")
        traceback.print_exc(file=f)

print(f"Output saved to: {out_path}")
