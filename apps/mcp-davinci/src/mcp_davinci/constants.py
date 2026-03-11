import os
import sys

VALID_MARKER_COLORS = [
    "Blue", "Cyan", "Green", "Yellow", "Red", "Pink",
    "Purple", "Fuchsia", "Rose", "Lavender", "Sky", "Mint",
    "Lemon", "Sand", "Cocoa", "Cream",
]


def get_fusionscript_path() -> str:
    """Return the platform-specific path to the fusionscript native module."""
    env_path = os.getenv("RESOLVE_SCRIPT_LIB") or os.getenv("RESOLVE_SCRIPT_API")
    if env_path:
        return env_path

    if sys.platform.startswith("win"):
        return r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
    elif sys.platform.startswith("darwin"):
        return (
            "/Applications/DaVinci Resolve/DaVinci Resolve.app"
            "/Contents/Libraries/Fusion/fusionscript.so"
        )
    else:
        return "/opt/resolve/libs/Fusion/fusionscript.so"
