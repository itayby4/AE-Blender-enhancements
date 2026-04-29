import { describe, it, expect } from 'vitest';
import {
  createLoopGuard,
  DEFAULT_LOOP_GUARD_CONFIG,
} from './loop-guard.js';

function call(name: string, args: Record<string, unknown> = {}) {
  return { name, args };
}

describe('loop-guard', () => {
  it('stays silent below the warn threshold', () => {
    const guard = createLoopGuard();
    const out = guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    expect(out.reminder).toBeNull();
    expect(out.abortedOn).toBeNull();
  });

  it('emits a reminder once a (tool, args) pair fires warnAt times', () => {
    const guard = createLoopGuard({ warnAt: 3, abortAt: 5 });
    guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    const out = guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    expect(out.reminder).toMatch(/Foo/);
    expect(out.reminder).toMatch(/3 times/);
    expect(out.abortedOn).toBeNull();
  });

  it('aborts once a (tool, args) pair fires abortAt times', () => {
    const guard = createLoopGuard({ warnAt: 3, abortAt: 5 });
    for (let i = 0; i < 4; i++) {
      guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    }
    const out = guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    expect(out.abortedOn).toEqual({ name: 'Foo', count: 5 });
    expect(out.reminder).toBeNull();
  });

  it('treats key-reordered args as the same call', () => {
    const guard = createLoopGuard({ warnAt: 2, abortAt: 5 });
    guard.observe({ toolCalls: [call('Foo', { a: 1, b: 2 })] });
    const out = guard.observe({ toolCalls: [call('Foo', { b: 2, a: 1 })] });
    expect(out.reminder).toMatch(/Foo/);
  });

  it('treats different args as different calls', () => {
    const guard = createLoopGuard({ warnAt: 2, abortAt: 5 });
    guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    const out = guard.observe({ toolCalls: [call('Foo', { a: 2 })] });
    expect(out.reminder).toBeNull();
    expect(out.abortedOn).toBeNull();
  });

  it('treats different tool names as separate counters', () => {
    const guard = createLoopGuard({ warnAt: 2, abortAt: 5 });
    guard.observe({ toolCalls: [call('Foo', { a: 1 })] });
    const out = guard.observe({ toolCalls: [call('Bar', { a: 1 })] });
    expect(out.reminder).toBeNull();
  });

  it('handles a batch of identical calls in a single round', () => {
    const guard = createLoopGuard({ warnAt: 3, abortAt: 5 });
    const out = guard.observe({
      toolCalls: [
        call('Foo', { a: 1 }),
        call('Foo', { a: 1 }),
        call('Foo', { a: 1 }),
      ],
    });
    expect(out.reminder).toMatch(/3 times/);
    expect(out.abortedOn).toBeNull();
  });

  it('aborts on the call that crosses abortAt within a batched round', () => {
    const guard = createLoopGuard({ warnAt: 3, abortAt: 5 });
    const out = guard.observe({
      toolCalls: [
        call('Foo', { a: 1 }),
        call('Foo', { a: 1 }),
        call('Foo', { a: 1 }),
        call('Foo', { a: 1 }),
        call('Foo', { a: 1 }),
      ],
    });
    expect(out.abortedOn).toEqual({ name: 'Foo', count: 5 });
  });

  it('falls back gracefully on non-serializable args', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const guard = createLoopGuard({ warnAt: 2, abortAt: 5 });
    expect(() =>
      guard.observe({ toolCalls: [call('Foo', cyclic), call('Foo', cyclic)] })
    ).not.toThrow();
  });

  it('uses the default config when none is provided', () => {
    expect(DEFAULT_LOOP_GUARD_CONFIG.warnAt).toBe(3);
    expect(DEFAULT_LOOP_GUARD_CONFIG.abortAt).toBe(5);
  });
});
