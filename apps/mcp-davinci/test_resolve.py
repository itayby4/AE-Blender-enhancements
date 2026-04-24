import os
import sys
import importlib.machinery
import importlib.util

resolve_dir = r"C:\Program Files\Blackmagic Design\DaVinci Resolve"
os.environ["PATH"] = resolve_dir + os.pathsep + os.environ["PATH"]

# Also os.add_dll_directory
if hasattr(os, 'add_dll_directory'):
    os.add_dll_directory(resolve_dir)

print("Loading fusionscript...")
lib_path = os.path.join(resolve_dir, "fusionscript.dll")
loader = importlib.machinery.ExtensionFileLoader("fusionscript", lib_path)
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
try:
    loader.exec_module(module)
    print("Module loaded.")
    resolve = module.scriptapp("Resolve")
    print("scriptapp returned:", resolve)
except Exception as e:
    import traceback
    traceback.print_exc()
