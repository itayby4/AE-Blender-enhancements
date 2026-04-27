import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusPanel } from './ui/StatusPanel.js';
import { startMcpServer, type McpServerHandle } from './mcp/server.js';
import { loadHostScript, probeAeVersion } from './cep/eval-bridge.js';

// CEP panel entry. Boots the MCP server, probes AE for version info,
// renders the status indicator. The backend connects to us via SSE.

let serverHandle: McpServerHandle | null = null;

async function boot() {
  const root = document.getElementById('root');
  if (!root) {
    console.error('[pipefx-mcp] #root element not found');
    return;
  }

  const reactRoot = createRoot(root);
  reactRoot.render(
    <StrictMode>
      <StatusPanel state={{ phase: 'starting' }} />
    </StrictMode>
  );

  // CEP's manifest <ScriptPath> auto-load is unreliable in AE — load host.jsx
  // explicitly here. Failure here is fatal: every tool dispatch goes through
  // __pipefxDispatch from host.jsx, so without it the panel is useless.
  try {
    await loadHostScript();
  } catch (err) {
    reactRoot.render(
      <StrictMode>
        <StatusPanel state={{ phase: 'error', message: `host.jsx load failed: ${String(err)}` }} />
      </StrictMode>
    );
    return;
  }

  let aeVersion: string | undefined;
  try {
    const probe = await probeAeVersion();
    aeVersion = probe.aeVersion;
  } catch (err) {
    // Non-fatal — the server can still boot, just shows missing AE info.
    console.warn('[pipefx-mcp] AE probe failed:', err);
  }

  try {
    serverHandle = await startMcpServer(7891);
    let connected = false;
    const render = () =>
      reactRoot.render(
        <StrictMode>
          <StatusPanel
            state={{
              phase: 'running',
              port: serverHandle!.port,
              connected,
              aeVersion,
            }}
          />
        </StrictMode>
      );
    render();
    serverHandle.onConnectionChange((c) => {
      connected = c;
      render();
    });
  } catch (err) {
    reactRoot.render(
      <StrictMode>
        <StatusPanel state={{ phase: 'error', message: String(err) }} />
      </StrictMode>
    );
  }
}

boot();
