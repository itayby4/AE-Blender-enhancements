import importlib.machinery
import importlib.util
import os
import sys

def get_fusionscript_path():
    resolve_mac_path = "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
    resolve_win_path = r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
    if os.path.exists(resolve_mac_path):
        return resolve_mac_path
    elif os.path.exists(resolve_win_path):
        return resolve_win_path
    else:
        raise FileNotFoundError("Could not find fusionscript")

try:
    lib_path = get_fusionscript_path()
    loader = importlib.machinery.ExtensionFileLoader("fusionscript", lib_path)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
except Exception as e:
    print("Error loading module:", e)
    sys.exit(1)

try:
    resolve = module.scriptapp("Resolve")
    print("Resolve object:", resolve)
except Exception as e:
    print("Error getting resolve:", e)
    sys.exit(1)

try:
    fusion = resolve.Fusion()
    print("Fusion object:", fusion)
except Exception as e:
    import traceback
    traceback.print_exc()
    print("Error getting fusion:", e)
    
if resolve:
    try:
        pages = resolve.GetCurrentPage()
        print("Current page:", pages)
    except Exception as e:
        print("Error getting page:", e)
