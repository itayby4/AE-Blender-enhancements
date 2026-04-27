"""
PipeFX Bridge — Blender Addon

Install this addon in Blender (Edit > Preferences > Add-ons > Install…).
It starts a local HTTP server on localhost:9876 that the PipeFX MCP server
connects to. Python code sent to /execute runs on Blender's main thread via
a 50 ms timer queue, so bpy calls are thread-safe.

Customize the port with the PIPEFX_BRIDGE_PORT environment variable before
launching Blender, or change BRIDGE_PORT below.
"""

bl_info = {
    "name": "PipeFX Bridge",
    "author": "PipeFX",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "System",
    "description": "Exposes a local HTTP server so the PipeFX MCP server can control Blender",
    "category": "System",
}

import bpy
import json
import os
import queue
import threading
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

BRIDGE_PORT = int(os.environ.get("PIPEFX_BRIDGE_PORT", "9876"))

# Requests arrive from the HTTP thread and are queued here.
# The main-thread timer drains this queue and posts results back.
_request_queue: queue.Queue = queue.Queue()

# Incremented each time the timer fires so the status panel can show activity.
_tick_count = 0
_server_thread: threading.Thread | None = None
_httpd: HTTPServer | None = None


# ---------------------------------------------------------------------------
# HTTP handler (runs in background thread)
# ---------------------------------------------------------------------------

class _BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass  # silence default access log

    def do_GET(self):
        if self.path == "/ping":
            self._send_json(200, {"ok": True, "blender": bpy.app.version_string})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/execute":
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            payload = json.loads(body)
            code = payload["code"]
        except (json.JSONDecodeError, KeyError) as exc:
            self._send_json(400, {"error": f"bad request: {exc}"})
            return

        result_queue: queue.Queue = queue.Queue()
        _request_queue.put((code, result_queue))

        try:
            result = result_queue.get(timeout=30)
            status = 200 if result.get("error") is None else 500
            self._send_json(status, result)
        except queue.Empty:
            self._send_json(504, {"error": "Timed out waiting for Blender main thread"})

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ---------------------------------------------------------------------------
# Main-thread timer — drains the request queue safely
# ---------------------------------------------------------------------------

def _main_thread_tick() -> float:
    global _tick_count
    _tick_count += 1

    while True:
        try:
            code, result_queue = _request_queue.get_nowait()
        except queue.Empty:
            break

        local_ns: dict = {}
        try:
            exec(code, {"bpy": bpy, "json": json}, local_ns)  # noqa: S102
            result_queue.put({"result": local_ns.get("__result__"), "error": None})
        except Exception:
            result_queue.put({"result": None, "error": traceback.format_exc()})

    return 0.05  # re-schedule in 50 ms


# ---------------------------------------------------------------------------
# Start / stop helpers
# ---------------------------------------------------------------------------

def _start_server():
    global _httpd, _server_thread
    if _httpd is not None:
        return

    _httpd = HTTPServer(("localhost", BRIDGE_PORT), _BridgeHandler)
    _server_thread = threading.Thread(target=_httpd.serve_forever, daemon=True)
    _server_thread.start()
    bpy.app.timers.register(_main_thread_tick, persistent=True)
    print(f"[PipeFX] Bridge running on localhost:{BRIDGE_PORT}", flush=True)


def _stop_server():
    global _httpd, _server_thread
    if _httpd is not None:
        _httpd.shutdown()
        _httpd = None

    if bpy.app.timers.is_registered(_main_thread_tick):
        bpy.app.timers.unregister(_main_thread_tick)


# ---------------------------------------------------------------------------
# Blender operators + panel
# ---------------------------------------------------------------------------

class PIPEFX_OT_StartBridge(bpy.types.Operator):
    bl_idname = "pipefx.start_bridge"
    bl_label = "Start PipeFX Bridge"
    bl_description = f"Start the HTTP bridge on localhost:{BRIDGE_PORT}"

    def execute(self, context):
        _start_server()
        self.report({"INFO"}, f"PipeFX Bridge started on port {BRIDGE_PORT}")
        return {"FINISHED"}


class PIPEFX_OT_StopBridge(bpy.types.Operator):
    bl_idname = "pipefx.stop_bridge"
    bl_label = "Stop PipeFX Bridge"

    def execute(self, context):
        _stop_server()
        self.report({"INFO"}, "PipeFX Bridge stopped")
        return {"FINISHED"}


class PIPEFX_PT_Panel(bpy.types.Panel):
    bl_label = "PipeFX Bridge"
    bl_idname = "PIPEFX_PT_Panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PipeFX"

    def draw(self, context):
        layout = self.layout
        running = _httpd is not None
        layout.label(text=f"Port: {BRIDGE_PORT}")
        layout.label(text="Status: " + ("Running" if running else "Stopped"))
        if running:
            layout.operator("pipefx.stop_bridge", icon="PAUSE")
        else:
            layout.operator("pipefx.start_bridge", icon="PLAY")


# ---------------------------------------------------------------------------
# Register / unregister
# ---------------------------------------------------------------------------

_CLASSES = [PIPEFX_OT_StartBridge, PIPEFX_OT_StopBridge, PIPEFX_PT_Panel]


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)
    # Auto-start on addon load
    bpy.app.timers.register(_start_server, first_interval=0.5)


def unregister():
    _stop_server()
    for cls in reversed(_CLASSES):
        bpy.utils.unregister_class(cls)
