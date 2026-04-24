import { describe, it, expect } from 'vitest';
import type { StreamEvent } from '../contracts/types.js';
import {
  applyStreamEvent,
  finishTurn,
  initialStreamState,
  startTurn,
  type StreamState,
} from './streaming-reducer.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function run(state: StreamState, events: StreamEvent[]): StreamState {
  return events.reduce(applyStreamEvent, state);
}

function primed(): StreamState {
  return startTurn(initialStreamState(), {
    userId: 'u1',
    userText: 'hi',
    assistantId: 'a1',
    taskId: 'chat-1',
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('streaming-reducer / startTurn', () => {
  it('appends user + streaming assistant placeholder', () => {
    const s = primed();
    expect(s.messages).toEqual([
      { id: 'u1', role: 'user', text: 'hi' },
      {
        id: 'a1',
        role: 'assistant',
        text: '',
        taskId: 'chat-1',
        isStreaming: true,
      },
    ]);
    expect(s.activeAssistantId).toBe('a1');
    expect(s.isStreaming).toBe(true);
  });

  it('clears lastError and previous actions', () => {
    const dirty: StreamState = {
      ...initialStreamState(),
      lastError: 'boom',
      actions: [{ type: 'old' }],
    };
    const s = startTurn(dirty, {
      userId: 'u',
      userText: 'x',
      assistantId: 'a',
      taskId: 't',
    });
    expect(s.lastError).toBeNull();
    expect(s.actions).toEqual([]);
  });
});

describe('streaming-reducer / chunks', () => {
  it('concatenates chunk text onto the active assistant message', () => {
    const s = run(primed(), [
      { type: 'chunk', text: 'Hel' },
      { type: 'chunk', text: 'lo ' },
      { type: 'chunk', text: 'world' },
    ]);
    const ai = s.messages.find((m) => m.id === 'a1');
    expect(ai?.text).toBe('Hello world');
    expect(ai?.isStreaming).toBe(true);
  });

  it('ignores chunks when no turn is active', () => {
    const s = applyStreamEvent(initialStreamState(), {
      type: 'chunk',
      text: 'stray',
    });
    expect(s.messages).toEqual([]);
    expect(s.activeAssistantId).toBeNull();
  });
});

describe('streaming-reducer / done', () => {
  it('replaces placeholder text when done carries a final text', () => {
    const s = run(primed(), [
      { type: 'chunk', text: 'partial' },
      { type: 'done', text: 'full answer', sessionId: 's-42' },
    ]);
    const ai = s.messages.find((m) => m.id === 'a1');
    expect(ai?.text).toBe('full answer');
    expect(ai?.isStreaming).toBe(false);
    expect(s.sessionId).toBe('s-42');
    expect(s.activeAssistantId).toBeNull();
    expect(s.isStreaming).toBe(false);
  });

  it('keeps streamed text when done carries no text', () => {
    const s = run(primed(), [
      { type: 'chunk', text: 'streamed-only' },
      { type: 'done' },
    ]);
    expect(s.messages.find((m) => m.id === 'a1')?.text).toBe('streamed-only');
  });

  it('falls back to "Done." when nothing streamed and no final text', () => {
    const s = run(primed(), [{ type: 'done' }]);
    expect(s.messages.find((m) => m.id === 'a1')?.text).toBe('Done.');
  });

  it('captures pipeline actions from the done payload', () => {
    const actions = [{ type: 'addNode', id: 'n1' }];
    const s = run(primed(), [{ type: 'done', text: 'ok', actions }]);
    expect(s.actions).toBe(actions);
  });
});

describe('streaming-reducer / error', () => {
  it('replaces placeholder with error text and marks stream ended', () => {
    const s = run(primed(), [
      { type: 'chunk', text: 'half-' },
      { type: 'error', error: 'network dropped' },
    ]);
    expect(s.messages.find((m) => m.id === 'a1')?.text).toBe(
      'network dropped'
    );
    expect(s.lastError).toBe('network dropped');
    expect(s.isStreaming).toBe(false);
    expect(s.activeAssistantId).toBeNull();
  });
});

describe('streaming-reducer / session event', () => {
  it('stores the resolved sessionId so plan_proposed without one can land', () => {
    const s = run(primed(), [
      { type: 'session', sessionId: 's-99' },
      { type: 'plan_proposed', taskId: 't1', plan: 'step 1\nstep 2' },
    ]);
    expect(s.sessionId).toBe('s-99');
    expect(s.pendingPlan).toEqual({
      sessionId: 's-99',
      taskId: 't1',
      plan: 'step 1\nstep 2',
    });
  });
});

describe('streaming-reducer / plan flow', () => {
  it('drops plan_proposed that has no sessionId and no prior session', () => {
    const s = applyStreamEvent(primed(), {
      type: 'plan_proposed',
      taskId: 't1',
      plan: 'p',
    });
    expect(s.pendingPlan).toBeNull();
  });

  it('clears pendingPlan on plan_resolved for the matching task', () => {
    let s = run(primed(), [
      { type: 'session', sessionId: 's' },
      { type: 'plan_proposed', taskId: 't1', plan: 'p' },
    ]);
    expect(s.pendingPlan?.taskId).toBe('t1');
    s = applyStreamEvent(s, {
      type: 'plan_resolved',
      taskId: 't1',
      approved: true,
    });
    expect(s.pendingPlan).toBeNull();
  });

  it('keeps pendingPlan when plan_resolved targets a different task', () => {
    const seeded = run(primed(), [
      { type: 'session', sessionId: 's' },
      { type: 'plan_proposed', taskId: 't1', plan: 'p' },
    ]);
    const s = applyStreamEvent(seeded, {
      type: 'plan_resolved',
      taskId: 't-other',
      approved: true,
    });
    expect(s.pendingPlan?.taskId).toBe('t1');
  });
});

describe('streaming-reducer / sub-agents', () => {
  it('tracks start → chunk → tool_start → done across multiple workers', () => {
    const s = run(primed(), [
      { type: 'subagent_start', taskId: 'sa-1', description: 'worker A' },
      { type: 'subagent_start', taskId: 'sa-2', description: 'worker B' },
      { type: 'subagent_chunk', taskId: 'sa-1', text: 'hello' },
      { type: 'subagent_chunk', taskId: 'sa-1', text: 'world' },
      { type: 'subagent_tool_start', taskId: 'sa-1', name: 'readFile' },
      { type: 'subagent_done', taskId: 'sa-1' },
      {
        type: 'subagent_error',
        taskId: 'sa-2',
        message: 'worker crashed',
      },
    ]);
    const a = s.subAgents.find((w) => w.taskId === 'sa-1');
    const b = s.subAgents.find((w) => w.taskId === 'sa-2');
    expect(a).toMatchObject({
      status: 'done',
      lastChunk: 'world',
      chunkCount: 2,
      lastTool: 'readFile',
    });
    expect(b).toMatchObject({ status: 'error', error: 'worker crashed' });
  });

  it('ignores duplicate subagent_start for the same taskId', () => {
    const s = run(primed(), [
      { type: 'subagent_start', taskId: 'sa', description: 'w' },
      { type: 'subagent_start', taskId: 'sa', description: 'w-again' },
    ]);
    expect(s.subAgents).toHaveLength(1);
    expect(s.subAgents[0].description).toBe('w');
  });
});

describe('streaming-reducer / todos + compaction', () => {
  it('replaces todos on every todo_updated event', () => {
    const s = run(primed(), [
      {
        type: 'todo_updated',
        todos: [
          { content: 'a', activeForm: 'doing a', status: 'pending' },
        ],
      },
      {
        type: 'todo_updated',
        todos: [
          { content: 'a', activeForm: 'doing a', status: 'completed' },
          { content: 'b', activeForm: 'doing b', status: 'in_progress' },
        ],
      },
    ]);
    expect(s.todos).toHaveLength(2);
    expect(s.todos[0].status).toBe('completed');
  });

  it('records the latest compaction info', () => {
    const s = run(primed(), [
      { type: 'compaction', removedCount: 12, summary: 'older turns' },
    ]);
    expect(s.lastCompaction).toEqual({
      removedCount: 12,
      summary: 'older turns',
    });
  });
});

describe('streaming-reducer / finishTurn', () => {
  it('finalizes the placeholder on abort with a fallback when nothing streamed', () => {
    const s = finishTurn(primed(), 'abort', { fallbackText: 'Stopped.' });
    expect(s.messages.find((m) => m.id === 'a1')?.text).toBe('Stopped.');
    expect(s.isStreaming).toBe(false);
    expect(s.activeAssistantId).toBeNull();
  });

  it('preserves streamed text on abort when some text was received', () => {
    const mid = applyStreamEvent(primed(), { type: 'chunk', text: 'half' });
    const s = finishTurn(mid, 'abort', { fallbackText: 'Stopped.' });
    expect(s.messages.find((m) => m.id === 'a1')?.text).toBe('half');
  });

  it('applies an error message on outcome="error"', () => {
    const s = finishTurn(primed(), 'error', { errorText: 'boom' });
    expect(s.messages.find((m) => m.id === 'a1')?.text).toBe('boom');
  });

  it('is a no-op when no turn is active', () => {
    const s = finishTurn(initialStreamState(), 'abort');
    expect(s.messages).toEqual([]);
    expect(s.isStreaming).toBe(false);
  });
});

describe('streaming-reducer / full fixture', () => {
  it('drives a realistic turn end-to-end', () => {
    let s = primed();
    const events: StreamEvent[] = [
      { type: 'session', sessionId: 'sess-1' },
      {
        type: 'todo_updated',
        todos: [
          { content: 'plan', activeForm: 'planning', status: 'in_progress' },
        ],
      },
      { type: 'chunk', text: 'Let me ' },
      { type: 'chunk', text: 'help.' },
      { type: 'tool_start', name: 'search' },
      { type: 'tool_done', name: 'search' },
      {
        type: 'todo_updated',
        todos: [
          { content: 'plan', activeForm: 'planning', status: 'completed' },
        ],
      },
      { type: 'done', text: 'Let me help you with that.' },
    ];
    s = run(s, events);

    const ai = s.messages.find((m) => m.id === 'a1');
    expect(ai?.text).toBe('Let me help you with that.');
    expect(ai?.isStreaming).toBe(false);
    expect(s.sessionId).toBe('sess-1');
    expect(s.todos[0].status).toBe('completed');
    expect(s.isStreaming).toBe(false);
    expect(s.activeAssistantId).toBeNull();
  });
});
