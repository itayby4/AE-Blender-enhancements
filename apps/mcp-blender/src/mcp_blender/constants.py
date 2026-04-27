import os

BLENDER_BRIDGE_HOST = os.environ.get("PIPEFX_BRIDGE_HOST", "localhost")
BLENDER_BRIDGE_PORT = int(os.environ.get("PIPEFX_BRIDGE_PORT", "9876"))
BLENDER_BRIDGE_TIMEOUT = float(os.environ.get("PIPEFX_BRIDGE_TIMEOUT", "30"))
