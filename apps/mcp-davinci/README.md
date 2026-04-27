# `@pipefx/mcp-davinci`

MCP server for DaVinci Resolve. Part of the PipeFX monorepo.

**Status:** functional (primary, most-used connector).
**IPC mode:** stdio.
**Language:** Python >= 3.10 (FastMCP).
**Backend connector id:** `resolve` — see [apps/backend/src/config.ts](../../apps/backend/src/config.ts).

## Tools

Registered in [src/mcp_davinci/tools/__init__.py](src/mcp_davinci/tools/__init__.py). Categories: project, markers, macros, transcript, editing, subtitles, audio, xml_export, fusion, understanding, autopod_xml, user_skills.

Each tool module exposes a `register(mcp, connector)` function that attaches `@mcp.tool()` handlers. All Resolve access goes through [src/mcp_davinci/resolve_connector.py](src/mcp_davinci/resolve_connector.py) (tiered cache: fusionscript permanent, resolve 5s TTL, project/timeline never cached).

## Nx targets

```powershell
pnpm nx serve @pipefx/mcp-davinci   # .\venv\Scripts\python.exe -m mcp_davinci.server
pnpm nx test  @pipefx/mcp-davinci   # import-smoke
```

## Setup

```powershell
cd apps/mcp-davinci
python -m venv venv
.\venv\Scripts\pip.exe install -e .
```

The backend spawns this MCP by pointing `resolveVenvPython(...)` at `apps/mcp-davinci/venv` with args `['-m', 'mcp_davinci.server']` and cwd `apps/mcp-davinci/src`.

## Adding a tool

1. Create `src/mcp_davinci/tools/<name>.py` with a `def register(mcp, connector):` that wraps `@mcp.tool()` handlers.
2. Import and call it from `src/mcp_davinci/tools/__init__.py`.
3. Restart the backend (`pnpm nx serve @pipefx/backend`).
