// Minimal subset of ConnectorRegistry used by brain-tasks tool registrations.
// Structurally satisfied by @pipefx/connectors ConnectorRegistry — no direct dep needed.
export interface LocalToolRegistry {
  registerLocalTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<string>
  ): void;
}
