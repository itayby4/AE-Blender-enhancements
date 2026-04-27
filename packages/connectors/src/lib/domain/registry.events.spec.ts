import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEventBus } from '@pipefx/event-bus';
import type {
  Connector,
  ConnectorConfig,
  McpConnectorConnectedEvent,
  McpConnectorDisconnectedEvent,
  McpEventMap,
  McpToolCalledEvent,
  McpToolsChangedEvent,
  StdioTransportConfig,
  ToolCallResult,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';

import type { LifecycleStatus } from './lifecycle.js';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5.7 — Integration test for ConnectorRegistry event emissions.
//
// We stub out `createConnector` so the registry wires up against in-memory
// fake connectors instead of spawning real MCP transports. Each fake exposes
// its captured `onStatusChange` callback through a shared hoisted state map,
// letting the test drive lifecycle transitions and assert the four events
// declared in `@pipefx/connectors-contracts`:
//
//   • disconnect → mcp.connector.disconnected + mcp.tools.changed
//   • reconnect  → mcp.connector.connected    + mcp.tools.changed
//   • callTool   → mcp.tool.called
//
// Phase 7 (Skills) will subscribe to these events to light up / grey out
// capabilities, so locking the shape in here protects future consumers.
// ─────────────────────────────────────────────────────────────────────────────

interface FakeConnectorState {
  connected: boolean;
  tools: ToolDescriptor[];
  callToolImpl: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<ToolCallResult>;
  onStatusChange?: (
    status: LifecycleStatus,
    info?: { reason?: string }
  ) => void;
}

const mocks = vi.hoisted(() => {
  const states = new Map<string, FakeConnectorState>();
  return { states };
});

vi.mock('./lifecycle.js', () => ({
  createConnector: (options: {
    config: ConnectorConfig;
    onStatusChange?: (
      status: LifecycleStatus,
      info?: { reason?: string }
    ) => void;
  }): Connector => {
    const state: FakeConnectorState = {
      connected: false,
      tools: [],
      callToolImpl: async () => ({ content: 'ok' }),
      onStatusChange: options.onStatusChange,
    };
    mocks.states.set(options.config.id, state);
    return {
      config: options.config,
      async connect() {
        state.onStatusChange?.('connecting');
        state.connected = true;
        state.onStatusChange?.('connected');
      },
      async disconnect() {
        const was = state.connected;
        state.connected = false;
        if (was) state.onStatusChange?.('disconnected');
      },
      async reconnect() {
        const was = state.connected;
        state.connected = false;
        if (was) state.onStatusChange?.('disconnected', { reason: 'reconnecting' });
        state.onStatusChange?.('connecting');
        state.connected = true;
        state.onStatusChange?.('connected');
      },
      async listTools() {
        return state.tools;
      },
      async callTool(name, args) {
        return state.callToolImpl(name, args);
      },
      isConnected() {
        return state.connected;
      },
    };
  },
}));

// Import AFTER vi.mock so ConnectorRegistry picks up the stubbed factory.
// Loaded in beforeAll so the spec stays free of top-level await — esbuild's
// CJS production build for apps/backend cannot emit top-level await.
let ConnectorRegistry: typeof import('./registry.js')['ConnectorRegistry'];

beforeAll(async () => {
  ({ ConnectorRegistry } = await import('./registry.js'));
});

/** Flush the microtask queue plus a timer tick so `void bus.publish(...)` settles. */
async function flushEvents(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stateOf(id: string): FakeConnectorState {
  const s = mocks.states.get(id);
  if (!s) throw new Error(`no fake state for "${id}"`);
  return s;
}

const fakeTransport: StdioTransportConfig = {
  type: 'stdio',
  command: 'noop',
  args: [],
};

const config: ConnectorConfig = {
  id: 'fake',
  name: 'Fake Connector',
  transport: fakeTransport,
};

function toolDescriptor(name: string): ToolDescriptor {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    connectorId: 'fake',
  };
}

describe('ConnectorRegistry event emissions', () => {
  beforeEach(() => {
    mocks.states.clear();
  });

  it('emits mcp.connector.connected + mcp.tools.changed on first connect', async () => {
    const bus = createEventBus<McpEventMap>();
    const connected: McpConnectorConnectedEvent[] = [];
    const toolsChanged: McpToolsChangedEvent[] = [];
    bus.subscribe('mcp.connector.connected', async (e) => {
      connected.push(e);
    });
    bus.subscribe('mcp.tools.changed', async (e) => {
      toolsChanged.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);

    expect(mocks.states.get('fake')).toBeDefined();
    stateOf('fake').tools = [toolDescriptor('do_thing')];

    await registry.connect('fake');
    await flushEvents();

    expect(connected).toHaveLength(1);
    expect(connected[0].type).toBe('mcp.connector.connected');
    expect(connected[0].connectorId).toBe('fake');
    expect(connected[0].name).toBe('Fake Connector');

    expect(toolsChanged).toHaveLength(1);
    expect(toolsChanged[0].type).toBe('mcp.tools.changed');
    expect(toolsChanged[0].tools.map((t) => t.name)).toEqual(['do_thing']);
    expect(toolsChanged[0].activeConnectors).toEqual(['fake']);
  });

  it('emits mcp.connector.disconnected + mcp.tools.changed on disconnect', async () => {
    const bus = createEventBus<McpEventMap>();
    const disconnected: McpConnectorDisconnectedEvent[] = [];
    const toolsChanged: McpToolsChangedEvent[] = [];
    bus.subscribe('mcp.connector.disconnected', async (e) => {
      disconnected.push(e);
    });
    bus.subscribe('mcp.tools.changed', async (e) => {
      toolsChanged.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);
    stateOf('fake').tools = [toolDescriptor('do_thing')];

    await registry.connect('fake');
    await flushEvents();
    // Clear the connect-time broadcast so the assertion sees only the disconnect.
    toolsChanged.length = 0;

    await registry.getConnector('fake').disconnect();
    await flushEvents();

    expect(disconnected).toHaveLength(1);
    expect(disconnected[0].type).toBe('mcp.connector.disconnected');
    expect(disconnected[0].connectorId).toBe('fake');
    expect(disconnected[0].status).toBe('disconnected');

    expect(toolsChanged).toHaveLength(1);
    expect(toolsChanged[0].tools).toEqual([]);
    expect(toolsChanged[0].activeConnectors).toEqual([]);
  });

  it('emits mcp.connector.connected + mcp.tools.changed on reconnect', async () => {
    const bus = createEventBus<McpEventMap>();
    const connected: McpConnectorConnectedEvent[] = [];
    const disconnected: McpConnectorDisconnectedEvent[] = [];
    const toolsChanged: McpToolsChangedEvent[] = [];
    bus.subscribe('mcp.connector.connected', async (e) => {
      connected.push(e);
    });
    bus.subscribe('mcp.connector.disconnected', async (e) => {
      disconnected.push(e);
    });
    bus.subscribe('mcp.tools.changed', async (e) => {
      toolsChanged.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);
    stateOf('fake').tools = [toolDescriptor('do_thing')];

    await registry.connect('fake');
    await flushEvents();

    const connectCountBeforeReconnect = connected.length;
    const disconnectCountBeforeReconnect = disconnected.length;

    await registry.getConnector('fake').reconnect();
    await flushEvents();

    // reconnect() synthesizes a disconnected→connected transition.
    expect(disconnected.length - disconnectCountBeforeReconnect).toBe(1);
    expect(disconnected[disconnected.length - 1].reason).toBe('reconnecting');

    expect(connected.length - connectCountBeforeReconnect).toBe(1);
    const lastConnected = connected[connected.length - 1];
    expect(lastConnected.connectorId).toBe('fake');

    // Tool set vanished then reappeared — two more mcp.tools.changed events.
    expect(toolsChanged.length).toBeGreaterThanOrEqual(3);
    expect(toolsChanged[toolsChanged.length - 1].tools.map((t) => t.name)).toEqual(
      ['do_thing']
    );
  });

  it('emits mcp.tool.called on successful callTool', async () => {
    const bus = createEventBus<McpEventMap>();
    const called: McpToolCalledEvent[] = [];
    bus.subscribe('mcp.tool.called', async (e) => {
      called.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);
    const state = stateOf('fake');
    state.tools = [toolDescriptor('do_thing')];
    state.callToolImpl = async () => ({ content: 'hello' });

    await registry.connect('fake');
    await registry.getAllTools();
    const result = await registry.callTool('do_thing', {});
    await flushEvents();

    expect(result.content).toBe('hello');
    expect(called).toHaveLength(1);
    expect(called[0].type).toBe('mcp.tool.called');
    expect(called[0].connectorId).toBe('fake');
    expect(called[0].toolName).toBe('do_thing');
    expect(called[0].isError).toBe(false);
    expect(typeof called[0].durationMs).toBe('number');
    expect(called[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits mcp.tool.called with isError=true when the call throws', async () => {
    const bus = createEventBus<McpEventMap>();
    const called: McpToolCalledEvent[] = [];
    bus.subscribe('mcp.tool.called', async (e) => {
      called.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);
    const state = stateOf('fake');
    state.tools = [toolDescriptor('do_thing')];
    state.callToolImpl = async () => {
      throw new Error('boom');
    };

    await registry.connect('fake');
    await registry.getAllTools();

    await expect(registry.callTool('do_thing', {})).rejects.toThrow('boom');
    await flushEvents();

    expect(called).toHaveLength(1);
    expect(called[0].isError).toBe(true);
    expect(called[0].toolName).toBe('do_thing');
  });

  it('emits mcp.tool.called with isError=true when the tool returns isError', async () => {
    const bus = createEventBus<McpEventMap>();
    const called: McpToolCalledEvent[] = [];
    bus.subscribe('mcp.tool.called', async (e) => {
      called.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);
    const state = stateOf('fake');
    state.tools = [toolDescriptor('do_thing')];
    state.callToolImpl = async () => ({ content: 'nope', isError: true });

    await registry.connect('fake');
    await registry.getAllTools();
    await registry.callTool('do_thing', {});
    await flushEvents();

    expect(called).toHaveLength(1);
    expect(called[0].isError).toBe(true);
  });

  it('does not double-emit mcp.tools.changed when the tool set is unchanged', async () => {
    const bus = createEventBus<McpEventMap>();
    const toolsChanged: McpToolsChangedEvent[] = [];
    bus.subscribe('mcp.tools.changed', async (e) => {
      toolsChanged.push(e);
    });

    const registry = new ConnectorRegistry({ eventBus: bus });
    registry.register(config);
    stateOf('fake').tools = [toolDescriptor('do_thing')];

    await registry.connect('fake');
    await flushEvents();
    const firstCount = toolsChanged.length;

    // Second getAllTools() call with identical fingerprint must not re-broadcast.
    await registry.getAllTools();
    await registry.getAllTools();
    await flushEvents();

    expect(toolsChanged.length).toBe(firstCount);
  });
});
