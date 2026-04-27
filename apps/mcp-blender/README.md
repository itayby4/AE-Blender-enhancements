# `@pipefx/mcp-blender`

MCP server for Blender. Part of the PipeFX monorepo.

**IPC mode:** stdio (MCP) → HTTP (Blender bridge addon).
**Language:** Python >= 3.10 (FastMCP).
**Backend connector id:** `blender` — see [apps/backend/src/config.ts](../../apps/backend/src/config.ts).

## How it works

`bpy` only runs inside Blender's process, so direct external scripting is not possible. This package solves that with two pieces:

1. **A Blender addon** (`blender_addon/__init__.py`) that runs an HTTP server on `localhost:9876` inside Blender, and drains a queue of Python snippets onto Blender's main thread via `bpy.app.timers` (so `bpy` calls are thread-safe).
2. **The MCP server** (`src/mcp_blender/`) that exposes typed tools to the agent. Each tool builds a small Python snippet, posts it to the bridge, and returns the JSON result.

```
Agent → MCP server (FastMCP, stdio) → HTTP → Blender addon → bpy
```

## Tools

| Module          | Tools                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| `scene.py`      | `get_scene_info`, `list_collections`                                                          |
| `objects.py`    | `list_objects`, `get_object_info`, `create_primitive`, `delete_object`, `set_transform`        |
| `render.py`     | `get_render_settings`, `set_render_settings`, `render_frame`                                  |
| `scripting.py`  | `ping_blender`, `execute_python`                                                              |

Tool modules follow the davinci pattern: each exposes `def register(mcp, connector):` and is wired from `tools/__init__.py::register_tools`.

## Installing the Blender addon (one-time, per machine)

1. Open Blender.
2. **Edit → Preferences → Add-ons → Install…**
3. Pick the file `apps/mcp-blender/blender_addon/__init__.py`.
4. Enable **PipeFX Bridge** in the add-ons list.
5. The bridge auto-starts on port `9876`. You should see a "PipeFX" panel in the 3D Viewport sidebar (`N` key) with Start/Stop controls.

Override the port with the `PIPEFX_BRIDGE_PORT` environment variable before launching Blender (must match `PIPEFX_BRIDGE_PORT` for the MCP server).

## Setup

```powershell
cd apps/mcp-blender
python -m venv venv
.\venv\Scripts\pip.exe install -e .
```

## Nx targets

```powershell
pnpm nx serve @pipefx/mcp-blender   # .\venv\Scripts\python.exe -m mcp_blender.server
pnpm nx test  @pipefx/mcp-blender   # import-smoke
```

## Verifying end-to-end

1. Launch Blender with the addon enabled.
2. Run `pnpm nx serve @pipefx/mcp-blender` (or wire it as a connector in `apps/backend/src/config.ts`).
3. Call `ping_blender` first — should return `OK — Blender <version>`.
4. Try `get_scene_info` to see the live scene state.

If `ping_blender` returns "Cannot reach PipeFX Bridge…", the addon isn't loaded or is on a different port. Check the PipeFX panel in Blender's 3D Viewport sidebar.

## Reference pattern

See [apps/mcp-davinci/README.md](../mcp-davinci/README.md). The structural layout is identical; only the connector mechanism differs (DaVinci has a built-in scripting socket; Blender needs the addon bridge).
