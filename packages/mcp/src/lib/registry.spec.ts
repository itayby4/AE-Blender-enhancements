import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectorRegistry } from './registry.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

// We stub out the factory so register() doesn't try to open a real stdio
// transport. The tests then manually put fake connectors into the internal
// map for routing checks.
vi.mock('./connector.js', () => ({
  createConnector: (config: ConnectorConfig): Connector => makeFakeConnector(config),
}));

/**
 * Build a minimal fake Connector that we can configure per test.
 */
function makeFakeConnector(
  config: ConnectorConfig,
  opts: {
    tools?: Tool[];
    connected?: boolean;
    callToolImpl?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  } = {}
): Connector {
  let connected = opts.connected ?? false;
  const tools = opts.tools ?? [];

  return {
    config,
    async connect() {
      connected = true;
    },
    async disconnect() {
      connected = false;
    },
    async reconnect() {
      connected = true;
    },
    async listTools() {
      return tools.map((t) => ({ ...t, connectorId: config.id }));
    },
    async callTool(name, args) {
      if (opts.callToolImpl) return opts.callToolImpl(name, args);
      return { content: `called:${config.id}:${name}:${JSON.stringify(args)}` };
    },
    isConnected() {
      return connected;
    },
  };
}

function makeConfig(id: string): ConnectorConfig {
  return {
    id,
    name: `fake-${id}`,
    transport: { type: 'stdio', command: 'true' },
  };
}

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  describe('register', () => {
    it('registers a connector successfully', () => {
      registry.register(makeConfig('resolve'));
      expect(registry.getConnector('resolve')).toBeDefined();
    });

    it('throws when registering the same id twice', () => {
      registry.register(makeConfig('resolve'));
      expect(() => registry.register(makeConfig('resolve'))).toThrow(
        /already registered/i
      );
    });

    it('getConnector throws for an unknown id', () => {
      expect(() => registry.getConnector('missing')).toThrow(/not registered/i);
    });
  });

  describe('registerLocalTool', () => {
    it('registers a local tool', async () => {
      registry.registerLocalTool(
        'echo',
        'Echo back the args',
        { type: 'object', properties: {} },
        async (args) => `echo:${JSON.stringify(args)}`
      );

      const tools = await registry.getAllTools();
      const echo = tools.find((t) => t.name === 'echo');
      expect(echo).toBeDefined();
      expect(echo?.connectorId).toBe('local');
    });

    it('throws when the same local tool is registered twice', () => {
      registry.registerLocalTool(
        'echo',
        'first',
        {},
        async () => 'first'
      );
      expect(() =>
        registry.registerLocalTool('echo', 'second', {}, async () => 'second')
      ).toThrow(/already registered/i);
    });
  });

  describe('getAllTools', () => {
    it('returns only tools from connected connectors', async () => {
      // Swap in a manually-configured fake so we can control `connected`
      const connected = makeFakeConnector(makeConfig('a'), {
        connected: true,
        tools: [{ name: 'a_tool', inputSchema: {}, connectorId: 'a' }],
      });
      const disconnected = makeFakeConnector(makeConfig('b'), {
        connected: false,
        tools: [{ name: 'b_tool', inputSchema: {}, connectorId: 'b' }],
      });

      // Reach into the registry to inject pre-built connectors.
      (registry as any).connectors.set('a', connected);
      (registry as any).connectors.set('b', disconnected);

      const tools = await registry.getAllTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('a_tool');
      expect(names).not.toContain('b_tool');
    });

    it('includes local tools alongside connector tools', async () => {
      const c = makeFakeConnector(makeConfig('a'), {
        connected: true,
        tools: [{ name: 'remote', inputSchema: {}, connectorId: 'a' }],
      });
      (registry as any).connectors.set('a', c);
      registry.registerLocalTool(
        'local_echo',
        'echo locally',
        {},
        async () => 'ok'
      );

      const tools = await registry.getAllTools();
      const names = tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['remote', 'local_echo']));
    });

    it('local tool wins when name collides with a connector tool', async () => {
      const c = makeFakeConnector(makeConfig('a'), {
        connected: true,
        tools: [{ name: 'collision', inputSchema: {}, connectorId: 'a' }],
      });
      (registry as any).connectors.set('a', c);
      registry.registerLocalTool(
        'collision',
        'local version',
        {},
        async () => 'local-result'
      );

      await registry.getAllTools();
      const result = await registry.callTool('collision', {});
      // Local tools register after connector tools in getAllTools() so the
      // local handler wins — this pins that behavior as intentional.
      expect(result.content).toBe('local-result');
    });
  });

  describe('callTool', () => {
    it('routes to the correct connector based on the index', async () => {
      const a = makeFakeConnector(makeConfig('a'), {
        connected: true,
        tools: [{ name: 'a_tool', inputSchema: {}, connectorId: 'a' }],
      });
      const b = makeFakeConnector(makeConfig('b'), {
        connected: true,
        tools: [{ name: 'b_tool', inputSchema: {}, connectorId: 'b' }],
      });
      (registry as any).connectors.set('a', a);
      (registry as any).connectors.set('b', b);

      await registry.getAllTools();

      const ra = await registry.callTool('a_tool', { x: 1 });
      const rb = await registry.callTool('b_tool', { y: 2 });
      expect(String(ra.content)).toContain('called:a:a_tool');
      expect(String(rb.content)).toContain('called:b:b_tool');
    });

    it('throws when called before getAllTools populates the index', async () => {
      const c = makeFakeConnector(makeConfig('a'), {
        connected: true,
        tools: [{ name: 'a_tool', inputSchema: {}, connectorId: 'a' }],
      });
      (registry as any).connectors.set('a', c);

      await expect(registry.callTool('a_tool', {})).rejects.toThrow(
        /Unknown tool/i
      );
    });

    it('invokes the local handler for local tools', async () => {
      registry.registerLocalTool(
        'greet',
        'say hi',
        { type: 'object' },
        async (args) => `hi ${(args as any).name}`
      );
      await registry.getAllTools();

      const result = await registry.callTool('greet', { name: 'itay' });
      expect(result.content).toBe('hi itay');
    });

    it('wraps a thrown error from a local tool into an error result', async () => {
      registry.registerLocalTool('boom', 'boom', {}, async () => {
        throw new Error('kaboom');
      });
      await registry.getAllTools();

      const result = await registry.callTool('boom', {});
      expect(result.isError).toBe(true);
      expect(String(result.content)).toContain('kaboom');
    });

    it('passes through a ToolResult returned directly from a local tool', async () => {
      registry.registerLocalTool(
        'structured',
        '',
        {},
        async () => ({ content: 'payload', isError: false })
      );
      await registry.getAllTools();

      const result = await registry.callTool('structured', {});
      expect(result).toEqual({ content: 'payload', isError: false });
    });
  });

  describe('connectAll / disconnectAll / switchActiveConnector', () => {
    it('connects all registered connectors (failures are swallowed)', async () => {
      const okConnect = vi.fn().mockResolvedValue(undefined);
      const badConnect = vi.fn().mockRejectedValue(new Error('dead'));

      const good = makeFakeConnector(makeConfig('good'));
      good.connect = okConnect;
      const bad = makeFakeConnector(makeConfig('bad'));
      bad.connect = badConnect;

      (registry as any).connectors.set('good', good);
      (registry as any).connectors.set('bad', bad);

      await expect(registry.connectAll()).resolves.toBeUndefined();
      expect(okConnect).toHaveBeenCalledOnce();
      expect(badConnect).toHaveBeenCalledOnce();
    });

    it('disconnects all registered connectors', async () => {
      const d1 = vi.fn().mockResolvedValue(undefined);
      const d2 = vi.fn().mockResolvedValue(undefined);

      const c1 = makeFakeConnector(makeConfig('a'), { connected: true });
      c1.disconnect = d1;
      const c2 = makeFakeConnector(makeConfig('b'), { connected: true });
      c2.disconnect = d2;

      (registry as any).connectors.set('a', c1);
      (registry as any).connectors.set('b', c2);

      await registry.disconnectAll();
      expect(d1).toHaveBeenCalledOnce();
      expect(d2).toHaveBeenCalledOnce();
    });

    it('switches so only the active connector stays connected', async () => {
      const a = makeFakeConnector(makeConfig('a'), { connected: false });
      const b = makeFakeConnector(makeConfig('b'), { connected: true });
      const connectA = vi.fn(async () => {
        (a as any).isConnected = () => true;
      });
      const disconnectB = vi.fn(async () => {
        (b as any).isConnected = () => false;
      });
      a.connect = connectA;
      b.disconnect = disconnectB;

      (registry as any).connectors.set('a', a);
      (registry as any).connectors.set('b', b);

      await registry.switchActiveConnector('a');

      expect(connectA).toHaveBeenCalledOnce();
      expect(disconnectB).toHaveBeenCalledOnce();
    });
  });
});
