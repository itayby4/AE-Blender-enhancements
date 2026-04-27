# `@pipefx/mcp-ableton`

MCP server for Ableton Live. Part of the PipeFX monorepo.

**Status:** placeholder stub. The module imports cleanly but exposes no real tools yet — it exists to reserve the shape.
**IPC mode:** stdio (planned).
**Language:** Python >= 3.10 (FastMCP).
**Backend connector id:** `ableton` — see [apps/backend/src/config.ts](../../apps/backend/src/config.ts).

## Tools

None yet. When filled in, tool modules will live under `src/mcp_ableton/tools/` and follow the davinci pattern: each module exposes `def register(mcp, connector):` and is wired from `tools/__init__.py::register_tools`.

See [apps/mcp-davinci/README.md](../mcp-davinci/README.md) for the reference pattern.

## Nx targets

```powershell
pnpm nx serve @pipefx/mcp-ableton   # .\venv\Scripts\python.exe -m mcp_ableton.server
pnpm nx test  @pipefx/mcp-ableton   # import-smoke
```

Smoke-only is the right bar while this is a placeholder. Do not treat import-success as functional validation.

## Setup

```powershell
cd apps/mcp-ableton
python -m venv venv
.\venv\Scripts\pip.exe install -e .
```
