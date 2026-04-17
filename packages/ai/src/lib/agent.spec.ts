import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Provider,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
} from '@pipefx/providers';

// ── Hoisted test state ──
// We use vi.hoisted() because vi.mock() is hoisted above imports: the factory
// needs access to FakeProvider / script / calls BEFORE the module body runs.
const state = vi.hoisted(() => {
  const providerScript: {
    chat: any[];
    continueChat: any[];
    chatStream: any[][];
    continueStream: any[][];
  } = { chat: [], continueChat: [], chatStream: [], continueStream: [] };

  const providerCalls: {
    chat: any[];
    continueChat: any[];
    chatStream: any[];
    continueStream: any[];
  } = { chat: [], continueChat: [], chatStream: [], continueStream: [] };

  class FakeProvider {
    readonly name = 'fake';

    async chat(params: any) {
      providerCalls.chat.push(params);
      const next = providerScript.chat.shift();
      if (!next) throw new Error('FakeProvider.chat: no scripted response');
      return next;
    }

    async continueWithToolResults(params: any) {
      providerCalls.continueChat.push(params);
      const next = providerScript.continueChat.shift();
      if (!next)
        throw new Error(
          'FakeProvider.continueWithToolResults: no scripted response'
        );
      return next;
    }

    async *chatStream(params: any) {
      providerCalls.chatStream.push(params);
      const events = providerScript.chatStream.shift();
      if (!events)
        throw new Error('FakeProvider.chatStream: no scripted events');
      for (const e of events) yield e;
    }

    async *continueWithToolResultsStream(params: any) {
      providerCalls.continueStream.push(params);
      const events = providerScript.continueStream.shift();
      if (!events)
        throw new Error(
          'FakeProvider.continueWithToolResultsStream: no scripted events'
        );
      for (const e of events) yield e;
    }
  }

  return { providerScript, providerCalls, FakeProvider };
});

vi.mock('@pipefx/providers', async () => {
  const actual = await vi.importActual<typeof import('@pipefx/providers')>(
    '@pipefx/providers'
  );
  return {
    ...actual,
    GeminiProvider: vi.fn(() => new state.FakeProvider()),
    OpenAIProvider: vi.fn(() => new state.FakeProvider()),
    AnthropicProvider: vi.fn(() => new state.FakeProvider()),
  };
});

// Import after mocks are registered.
import { createAgent } from './agent.js';
import type { AgentConfig } from './types.js';

/** Shorthands for readability. */
const providerScript = state.providerScript as unknown as {
  chat: ProviderResponse[];
  continueChat: ProviderResponse[];
  chatStream: StreamEvent[][];
  continueStream: StreamEvent[][];
};
const providerCalls = state.providerCalls as unknown as {
  chat: ChatParams[];
  continueChat: ContinueParams[];
  chatStream: ChatParams[];
  continueStream: ContinueParams[];
};

/**
 * Minimal registry with just enough surface area for the agent.
 */
function makeRegistry(
  overrides: Partial<{
    tools: any[];
    callTool: (name: string, args: Record<string, unknown>) => Promise<any>;
  }> = {}
) {
  const tools = overrides.tools ?? [];
  const callTool =
    overrides.callTool ??
    (async (name: string, args: Record<string, unknown>) => ({
      content: `tool:${name}:${JSON.stringify(args)}`,
    }));
  return {
    getAllTools: vi.fn(async () => tools),
    callTool: vi.fn(callTool),
  } as any;
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    apiKey: 'test-gemini-key',
    model: 'gemini-test',
    systemPrompt: 'You are a test agent',
    registry: makeRegistry(),
    ...overrides,
  };
}

function resetScript() {
  providerScript.chat.length = 0;
  providerScript.continueChat.length = 0;
  providerScript.chatStream.length = 0;
  providerScript.continueStream.length = 0;
  providerCalls.chat.length = 0;
  providerCalls.continueChat.length = 0;
  providerCalls.chatStream.length = 0;
  providerCalls.continueStream.length = 0;
}

describe('createAgent', () => {
  beforeEach(() => {
    resetScript();
  });

  describe('non-streaming chat', () => {
    it('returns text directly when the provider emits no tool calls', async () => {
      providerScript.chat.push({ text: 'hello back', toolCalls: [] });

      const agent = createAgent(makeConfig());
      const result = await agent.chat('hi');

      expect(result).toBe('hello back');
      expect(providerCalls.chat).toHaveLength(1);
      expect(providerCalls.chat[0].messages.at(-1)).toEqual({
        role: 'user',
        content: 'hi',
      });
    });

    it('runs the tool loop: tool_call → registry → continue → final text', async () => {
      const registry = makeRegistry();
      providerScript.chat.push({
        text: null,
        toolCalls: [{ id: 'call-1', name: 'add', args: { a: 1, b: 2 } }],
      });
      providerScript.continueChat.push({
        text: 'the answer is 3',
        toolCalls: [],
      });

      const agent = createAgent(makeConfig({ registry }));
      const result = await agent.chat('add 1 and 2');

      expect(result).toBe('the answer is 3');
      expect(registry.callTool).toHaveBeenCalledWith('add', { a: 1, b: 2 });
      expect(providerCalls.continueChat).toHaveLength(1);
      expect(providerCalls.continueChat[0].toolResults[0]).toMatchObject({
        callId: 'call-1',
        name: 'add',
      });
    });

    it('wraps a thrown registry error into an isError tool result', async () => {
      const registry = makeRegistry({
        callTool: async () => {
          throw new Error('tool crashed');
        },
      });
      providerScript.chat.push({
        text: null,
        toolCalls: [{ id: 'c1', name: 'broken', args: {} }],
      });
      providerScript.continueChat.push({
        text: 'saw the error',
        toolCalls: [],
      });

      const agent = createAgent(makeConfig({ registry }));
      const result = await agent.chat('use broken');

      expect(result).toBe('saw the error');
      const tr = providerCalls.continueChat[0].toolResults[0];
      expect(tr.isError).toBe(true);
      expect(tr.content).toContain('tool crashed');
    });

    it('fires onToolCallStart / onToolCallComplete callbacks', async () => {
      providerScript.chat.push({
        text: null,
        toolCalls: [{ id: 'c1', name: 'ping', args: { n: 1 } }],
      });
      providerScript.continueChat.push({ text: 'done', toolCalls: [] });

      const onStart = vi.fn();
      const onComplete = vi.fn();

      const agent = createAgent(makeConfig());
      await agent.chat('go', {
        onToolCallStart: onStart,
        onToolCallComplete: onComplete,
      });

      expect(onStart).toHaveBeenCalledWith('ping', { n: 1 });
      expect(onComplete).toHaveBeenCalled();
    });

    it('falls back to a default message when the provider returns no text', async () => {
      providerScript.chat.push({ text: null, toolCalls: [] });
      const agent = createAgent(makeConfig());
      const result = await agent.chat('hi');
      expect(result).toMatch(/no text response/i);
    });

    it('filters tools via allowedTools before passing them to the provider', async () => {
      const registry = makeRegistry({
        tools: [
          { name: 'allowed', inputSchema: {}, connectorId: 'x' },
          { name: 'blocked', inputSchema: {}, connectorId: 'x' },
        ],
      });
      providerScript.chat.push({ text: 'ok', toolCalls: [] });

      const agent = createAgent(makeConfig({ registry }));
      await agent.chat('go', { allowedTools: ['allowed'] });

      const toolNames = providerCalls.chat[0].tools.map((t: any) => t.name);
      expect(toolNames).toEqual(['allowed']);
    });

    it('respects an already-aborted signal before calling continueWithToolResults', async () => {
      providerScript.chat.push({
        text: null,
        toolCalls: [{ id: 'c1', name: 'slow', args: {} }],
      });

      const controller = new AbortController();
      controller.abort();

      const agent = createAgent(makeConfig());
      await expect(
        agent.chat('x', { signal: controller.signal })
      ).rejects.toThrow(/AbortError/);
    });
  });

  describe('streaming chat', () => {
    it('emits text chunks through onStreamChunk and returns the joined text', async () => {
      providerScript.chatStream.push([
        { type: 'text', text: 'hel' },
        { type: 'text', text: 'lo' },
        {
          type: 'done',
          response: { text: 'hello', toolCalls: [] },
        },
      ]);

      const chunks: string[] = [];
      const agent = createAgent(makeConfig());
      const result = await agent.chat('hi', {
        onStreamChunk: (c) => chunks.push(c),
      });

      expect(chunks.join('')).toBe('hello');
      expect(result).toBe('hello');
    });

    it('runs the streaming tool loop and continues after tool execution', async () => {
      const registry = makeRegistry();
      providerScript.chatStream.push([
        {
          type: 'done',
          response: {
            text: null,
            toolCalls: [{ id: 'c1', name: 'add', args: { a: 1 } }],
          },
        },
      ]);
      providerScript.continueStream.push([
        { type: 'text', text: 'final' },
        {
          type: 'done',
          response: { text: 'final', toolCalls: [] },
        },
      ]);

      const agent = createAgent(makeConfig({ registry }));
      const result = await agent.chat('go', {
        onStreamChunk: () => undefined,
      });

      expect(result).toBe('final');
      expect(registry.callTool).toHaveBeenCalledWith('add', { a: 1 });
    });

    it('throws if stream ends without a done event', async () => {
      providerScript.chatStream.push([{ type: 'text', text: 'partial' }]);

      const agent = createAgent(makeConfig());
      await expect(
        agent.chat('hi', { onStreamChunk: () => undefined })
      ).rejects.toThrow(/Stream ended without done/i);
    });
  });

  describe('context compaction', () => {
    it('fires onCompaction when history is large enough to compact', async () => {
      providerScript.chat.push({ text: 'ok', toolCalls: [] });

      // Build a history big enough to exceed the 8000-token default budget.
      // Each message has ~2500 tokens worth of content.
      const bigText = 'x'.repeat(10_000); // ~2500 tokens
      const history = Array.from({ length: 6 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'model',
        parts: [{ text: bigText }],
      }));

      const onCompaction = vi.fn();
      const agent = createAgent(makeConfig());

      await agent.chat('follow up', { history, onCompaction });

      expect(onCompaction).toHaveBeenCalled();
      const [removedCount, summary] = onCompaction.mock.calls[0];
      expect(removedCount).toBeGreaterThan(0);
      expect(typeof summary).toBe('string');
    });

    it('does NOT compact when history is small', async () => {
      providerScript.chat.push({ text: 'ok', toolCalls: [] });
      const onCompaction = vi.fn();
      const agent = createAgent(makeConfig());

      await agent.chat('hi', {
        history: [{ role: 'user', parts: [{ text: 'earlier' }] }],
        onCompaction,
      });

      expect(onCompaction).not.toHaveBeenCalled();
    });
  });
});
