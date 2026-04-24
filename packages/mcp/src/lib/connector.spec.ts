import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ConnectorConfig } from './types.js';

// ── Shared test state ──
// The mocked Client module below talks to this fixture so each test can
// configure what the fake Client does.
interface ClientFixture {
  connectImpl: () => Promise<void>;
  closeImpl: () => Promise<void>;
  listToolsImpl: () => Promise<{ tools: any[] }>;
  callToolImpl: (args: any) => Promise<any>;
  /** Instances the mock creates, so tests can assert construction counts. */
  instances: any[];
}

const fixture: ClientFixture = {
  connectImpl: async () => undefined,
  closeImpl: async () => undefined,
  listToolsImpl: async () => ({ tools: [] }),
  callToolImpl: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  instances: [],
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class FakeClient {
    onerror: ((err: Error) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() {
      fixture.instances.push(this);
    }
    connect(_transport: any) {
      return fixture.connectImpl();
    }
    close() {
      return fixture.closeImpl();
    }
    listTools() {
      return fixture.listToolsImpl();
    }
    callTool(_args: any, _schema: any, _opts: any) {
      return fixture.callToolImpl(_args);
    }
  }
  return { Client: FakeClient };
});

vi.mock('@pipefx/mcp-transport', () => ({
  createTransport: () => ({ close: async () => undefined }),
}));

// Import after mocks so the factory picks up the mocked Client.
import { createConnector } from './connector.js';

function makeConfig(): ConnectorConfig {
  return {
    id: 'test',
    name: 'test-connector',
    transport: { type: 'stdio', command: 'true' },
  };
}

function resetFixture() {
  fixture.connectImpl = async () => undefined;
  fixture.closeImpl = async () => undefined;
  fixture.listToolsImpl = async () => ({ tools: [] });
  fixture.callToolImpl = async () => ({
    content: [{ type: 'text', text: 'ok' }],
  });
  fixture.instances.length = 0;
}

describe('createConnector', () => {
  beforeEach(() => {
    resetFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect / disconnect / isConnected', () => {
    it('starts disconnected, becomes connected after connect()', async () => {
      const c = createConnector(makeConfig());
      expect(c.isConnected()).toBe(false);
      await c.connect();
      expect(c.isConnected()).toBe(true);
    });

    it('disconnect() clears the connected state even when close() throws', async () => {
      const c = createConnector(makeConfig());
      await c.connect();

      fixture.closeImpl = async () => {
        throw new Error('already closed');
      };
      await c.disconnect();
      expect(c.isConnected()).toBe(false);
    });

    it('propagates failures from connect()', async () => {
      fixture.connectImpl = async () => {
        throw new Error('stdio refused');
      };
      const c = createConnector(makeConfig());
      await expect(c.connect()).rejects.toThrow(/stdio refused/);
      expect(c.isConnected()).toBe(false);
    });
  });

  describe('reconnect', () => {
    it('creates a fresh Client instance on reconnect', async () => {
      const c = createConnector(makeConfig());
      await c.connect();
      expect(fixture.instances).toHaveLength(1);

      await c.reconnect();

      // reconnect() allocates a new client. So we now have 2 Clients.
      expect(fixture.instances).toHaveLength(2);
      expect(c.isConnected()).toBe(true);
    });

    it('stays disconnected if the reconnect connect() call throws', async () => {
      const c = createConnector(makeConfig());
      await c.connect();

      fixture.connectImpl = async () => {
        throw new Error('resolve not running');
      };

      await expect(c.reconnect()).rejects.toThrow(/resolve not running/);
      expect(c.isConnected()).toBe(false);
    });
  });

  describe('listTools', () => {
    it('maps raw tool descriptors into the pipefx Tool shape', async () => {
      fixture.listToolsImpl = async () => ({
        tools: [
          {
            name: 'project_info',
            description: 'Get project info',
            inputSchema: { type: 'object' },
          },
        ],
      });

      const c = createConnector(makeConfig());
      await c.connect();
      const tools = await c.listTools();

      expect(tools).toEqual([
        {
          name: 'project_info',
          description: 'Get project info',
          inputSchema: { type: 'object' },
          connectorId: 'test',
        },
      ]);
    });
  });

  describe('callTool', () => {
    it('returns content and error flag from the underlying Client result', async () => {
      fixture.callToolImpl = async () => ({
        content: [{ type: 'text', text: 'result' }],
        isError: false,
      });

      const c = createConnector(makeConfig());
      await c.connect();

      const result = await c.callTool('x', {});
      expect(result.isError).toBe(false);
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('reconnects and retries once on first failure', async () => {
      const c = createConnector(makeConfig());
      await c.connect();

      let call = 0;
      fixture.callToolImpl = async () => {
        call++;
        if (call === 1) throw new Error('connection dropped');
        return { content: [{ type: 'text', text: 'after-retry' }] };
      };

      const result = await c.callTool('x', {});
      expect(call).toBe(2);
      expect(result.content).toEqual([
        { type: 'text', text: 'after-retry' },
      ]);
      // A new Client was allocated for the reconnect.
      expect(fixture.instances.length).toBeGreaterThanOrEqual(2);
    });

    it('surfaces a friendly error when reconnect also fails', async () => {
      const c = createConnector(makeConfig());
      await c.connect();

      // First call fails → triggers reconnect → reconnect's connect fails too.
      fixture.callToolImpl = async () => {
        throw new Error('dropped');
      };
      fixture.connectImpl = async () => {
        throw new Error('still dead');
      };

      await expect(c.callTool('x', {})).rejects.toThrow(
        /failed after reconnect attempt/i
      );
    });

    it('respects the reconnect cooldown: second failure does not reconnect again', async () => {
      const c = createConnector(makeConfig());
      await c.connect();

      fixture.callToolImpl = async () => {
        throw new Error('dropped');
      };

      // First call: triggers a reconnect attempt (and fails during retry).
      await expect(c.callTool('x', {})).rejects.toThrow();
      const clientsAfterFirstFailure = fixture.instances.length;

      // Second call immediately after: cooldown should skip the reconnect.
      await expect(c.callTool('y', {})).rejects.toThrow(/cooldown/i);

      // No new Client instances were allocated during the second attempt.
      expect(fixture.instances.length).toBe(clientsAfterFirstFailure);
    });
  });
});
