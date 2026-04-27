# `@pipefx/mcp-aftereffects`

MCP server for Adobe After Effects, packaged as a **CEP panel** that runs inside After Effects.

The panel hosts an MCP server over HTTP/SSE on `127.0.0.1:7891`. The PipeFX backend connects as a regular MCP client. When the panel is open, AE is reachable; when it's closed (or AE quits), the connector goes red. Same lifecycle as every other MCP — no extra plumbing.

## Why CEP and not UXP

After Effects' UXP runtime (as of AE 26 / 2026) supports `type: "command"` only — no dockable panels. CEP supports dockable panels, exposes Node.js inside the panel (so we can host the SSE server directly), and is shipped in every modern AE. Adobe has formally "deprecated" CEP in favor of UXP, but it isn't going anywhere in AE for years precisely because UXP doesn't yet replace it for panels.

## Status

- **Platform:** Windows-only at the moment. macOS support deferred.
- **AE version floor:** 24.0+ (CEP 11). Older versions use CEP 10 and would need a separate manifest.
- **Distribution (planned):** signed ZXP via Adobe Exchange. Right now you sideload manually.

## Tools

| Category | Tool | Notes |
|---|---|---|
| Liveness | `bridge-health` | AE + panel + protocol version. Rarely needed; the SSE channel itself proves liveness. |
| Inspect | `get-project-info`, `list-compositions`, `get-layer-info` | Read-only. |
| Create | `create-composition`, `create-shape-layer`, `create-text-layer`, `create-solid-layer`, `create-camera`, `duplicate-layer` | |
| Modify | `set-layer-properties`, `batch-set-layer-properties`, `set-composition-properties`, `set-layer-mask`, `setLayerKeyframe`, `setLayerExpression` | |
| Delete | `delete-layer` | |
| Effects | `apply-effect`, `apply-effect-template` | Templates: `gaussian-blur`, `glow`, `drop-shadow`, `cinematic-look`, `text-pop`, etc. |

Every write tool is wrapped in `app.beginUndoGroup` / `endUndoGroup`, so each tool call is one Cmd+Z away from being undone.

## Architecture

```
PipeFX Backend  ──SSE──▶  127.0.0.1:7891  (CEP panel inside AE)
                                │
                                ▼
                          MCP server  (Node, in CEP CEF)
                                │
                                ▼   evalScript bridge
                            host.jsx  (ExtendScript)
                                │
                                ▼
                    After Effects document
```

The TypeScript side (`src/`) handles the MCP server, validates arguments via Zod, and dispatches each tool call as a single `evalScript` round-trip into `host.jsx`. ExtendScript holds the actual AE manipulation logic — same object model the original `.jsx` scripts used, so all the proven AE-side behaviour is preserved.

## Building

```powershell
pnpm nx build @pipefx/mcp-aftereffects
```

Vite produces a complete sideload-able extension in `dist/`:

```
dist/
  CSXS/
    manifest.xml
  .debug
  index.html
  index.js                ← bundled React + MCP server
  CSInterface.js
  host.jsx                ← ExtendScript handlers
```

## Sideloading the panel (development)

CEP requires you to enable **PlayerDebugMode** once before it'll load unsigned extensions. This is per-user, set in the registry, and survives reboots.

### One-time machine setup

1. **Enable PlayerDebugMode** (admin not required — this is HKCU):

   Open PowerShell and run:

   ```powershell
   reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
   ```

   The `CSXS.11` key matches the CEP version in AE 24+. If you also use older Adobe apps (CC 2019 era), repeat with `CSXS.9` or `CSXS.10`. Setting one doesn't break others.

2. **Copy the built extension** into AE's CEP extensions folder:

   ```powershell
   $dst = "$env:APPDATA\Adobe\CEP\extensions\com.pipefx.mcp-aftereffects"
   New-Item -ItemType Directory -Force -Path $dst | Out-Null
   Copy-Item -Path "apps\mcp-aftereffects\dist\*" -Destination $dst -Recurse -Force
   ```

   Or, if you'd rather develop in-place, point a symlink at `dist/`:

   ```powershell
   New-Item -ItemType Junction -Path "$env:APPDATA\Adobe\CEP\extensions\com.pipefx.mcp-aftereffects" -Target (Resolve-Path "apps\mcp-aftereffects\dist")
   ```

3. **Restart After Effects.** A full quit and relaunch — not just close the panel. The first launch after the registry change picks up PlayerDebugMode.

### Per-session

4. In AE: **Window → Extensions → PipeFX MCP**. The panel docks like any other.

5. The panel UI shows status:
   - **"Starting MCP server…"** — booting; should clear in <1s.
   - **"Waiting for backend"** — server up, listening on `127.0.0.1:7891`. Start the backend.
   - **"Backend connected"** — fully wired. Try the chat.
   - **"Server failed to start"** — error displayed inline. Most often: port 7891 already in use (close the previous panel first).

6. Open Chrome DevTools to debug the panel JS: `http://localhost:8088` while AE is running (the port is set in `.debug`).

### Troubleshooting

- **Panel doesn't appear in Window → Extensions menu** → PlayerDebugMode isn't enabled, or the extension folder isn't in `%APPDATA%\Adobe\CEP\extensions\`. Verify both, then fully restart AE.
- **"`require` is not defined"** in the panel JS console → the `--enable-nodejs` CEF flag in `CSXS/manifest.xml` is missing or the manifest didn't update. Check `dist/CSXS/manifest.xml` matches the source.
- **Backend can't connect** → confirm the panel is running (`http://127.0.0.1:7891/healthz` should return JSON), and that the backend's AE connector URL is `http://127.0.0.1:7891/sse`.

## Distribution (later)

For end users, we'll package this as a **signed ZXP** distributed through Adobe Exchange. Signing requires a certificate from Adobe (paid). Not wired up yet — track separately.
