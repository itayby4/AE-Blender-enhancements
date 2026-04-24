# `@pipefx/mcp-blender`

MCP server for Blender. Part of the PipeFX monorepo.

**Status:** placeholder stub. The module imports cleanly but exposes no real tools yet — it exists to reserve the shape.
**IPC mode:** stdio (planned).
**Language:** Python >= 3.10 (FastMCP).
**Backend connector id:** `blender` — see [apps/backend/src/config.ts](../../apps/backend/src/config.ts).

## Tools

None yet. When filled in, tool modules will live under `src/mcp_blender/tools/` and follow the davinci pattern: each module exposes `def register(mcp, connector):` and is wired from `tools/__init__.py::register_tools`.

See [apps/mcp-davinci/README.md](../mcp-davinci/README.md) for the reference pattern.

## Nx targets

```powershell
pnpm nx serve @pipefx/mcp-blender   # .\venv\Scripts\python.exe -m mcp_blender.server
pnpm nx test  @pipefx/mcp-blender   # import-smoke
```

Smoke-only is the right bar while this is a placeholder. Do not treat import-success as functional validation.

## Setup

```powershell
cd apps/mcp-blender
python -m venv venv
.\venv\Scripts\pip.exe install -e .
```
