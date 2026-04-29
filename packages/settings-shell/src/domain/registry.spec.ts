// ── @pipefx/settings-shell — registry behaviour ──────────────────────────
// Covers register / replace / unregister, duplicate-id handling, sort
// order (by `order` then by `title`), subscribe/notify semantics, and
// snapshot identity stability.

import { describe, it, expect, vi, afterEach } from 'vitest';

import type { SettingsPanel } from '../contracts/types.js';
import { createSettingsRegistry } from './registry.js';

const Noop = (): null => null;

function makePanel(
  overrides: Partial<SettingsPanel> & { id: string }
): SettingsPanel {
  return {
    title: overrides.title ?? overrides.id,
    category: overrides.category ?? 'about',
    component: overrides.component ?? Noop,
    ...overrides,
  };
}

const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

afterEach(() => {
  consoleSpy.mockClear();
});

describe('createSettingsRegistry', () => {
  it('starts empty', () => {
    const r = createSettingsRegistry();
    expect(r.getRegisteredPanels()).toEqual([]);
  });

  it('register adds the panel and notifies subscribers', () => {
    const r = createSettingsRegistry();
    const listener = vi.fn();
    const off = r.subscribe(listener);

    r.registerSettingsPanel(makePanel({ id: 'a' }));

    expect(r.getRegisteredPanels()).toHaveLength(1);
    expect(r.getRegisteredPanels()[0]?.id).toBe('a');
    expect(listener).toHaveBeenCalledTimes(1);

    off();
  });

  it('register returns an unregister callback that removes the panel', () => {
    const r = createSettingsRegistry();
    const listener = vi.fn();
    r.subscribe(listener);

    const off = r.registerSettingsPanel(makePanel({ id: 'a' }));
    expect(r.getRegisteredPanels()).toHaveLength(1);

    off();
    expect(r.getRegisteredPanels()).toHaveLength(0);
    // 1 for register, 1 for unregister
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unregister callback is idempotent and only removes its own panel', () => {
    const r = createSettingsRegistry();
    const off = r.registerSettingsPanel(makePanel({ id: 'a' }));
    r.replaceSettingsPanel(makePanel({ id: 'a', title: 'replaced' }));

    // The original off() should not remove the now-replaced panel.
    off();
    const panels = r.getRegisteredPanels();
    expect(panels).toHaveLength(1);
    expect(panels[0]?.title).toBe('replaced');
  });

  it('register on duplicate id warns and is a no-op', () => {
    const r = createSettingsRegistry();
    const original = makePanel({ id: 'a', title: 'first' });
    r.registerSettingsPanel(original);

    const off = r.registerSettingsPanel(makePanel({ id: 'a', title: 'second' }));

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(r.getRegisteredPanels()[0]?.title).toBe('first');

    // The returned unregister is a no-op and must not remove the
    // original panel.
    off();
    expect(r.getRegisteredPanels()).toHaveLength(1);
    expect(r.getRegisteredPanels()[0]?.title).toBe('first');
  });

  it('replace overwrites the panel for the same id', () => {
    const r = createSettingsRegistry();
    r.registerSettingsPanel(makePanel({ id: 'a', title: 'v1' }));
    r.replaceSettingsPanel(makePanel({ id: 'a', title: 'v2' }));

    expect(r.getRegisteredPanels()).toHaveLength(1);
    expect(r.getRegisteredPanels()[0]?.title).toBe('v2');
  });

  it('replace registers when the id is new', () => {
    const r = createSettingsRegistry();
    r.replaceSettingsPanel(makePanel({ id: 'a', title: 'fresh' }));
    expect(r.getRegisteredPanels()).toHaveLength(1);
  });

  it('sorts by order ascending, then by title', () => {
    const r = createSettingsRegistry();
    r.registerSettingsPanel(makePanel({ id: 'd', title: 'D', order: 50 }));
    r.registerSettingsPanel(makePanel({ id: 'a', title: 'A' })); // default 100
    r.registerSettingsPanel(makePanel({ id: 'c', title: 'C', order: 25 }));
    r.registerSettingsPanel(makePanel({ id: 'b', title: 'B' })); // default 100

    const ids = r.getRegisteredPanels().map((p) => p.id);
    // c (25) → d (50) → a, b alphabetical at order 100
    expect(ids).toEqual(['c', 'd', 'a', 'b']);
  });

  it('snapshot identity is stable across reads when nothing changed', () => {
    const r = createSettingsRegistry();
    r.registerSettingsPanel(makePanel({ id: 'a' }));

    const snap1 = r.getRegisteredPanels();
    const snap2 = r.getRegisteredPanels();
    expect(snap1).toBe(snap2);
  });

  it('snapshot identity changes on register / replace / live unregister', () => {
    const r = createSettingsRegistry();
    r.registerSettingsPanel(makePanel({ id: 'a' }));
    const snap1 = r.getRegisteredPanels();

    const offB = r.registerSettingsPanel(makePanel({ id: 'b' }));
    const snap2 = r.getRegisteredPanels();
    expect(snap2).not.toBe(snap1);

    r.replaceSettingsPanel(makePanel({ id: 'a', title: 'replaced' }));
    const snap3 = r.getRegisteredPanels();
    expect(snap3).not.toBe(snap2);

    offB();
    const snap4 = r.getRegisteredPanels();
    expect(snap4).not.toBe(snap3);
  });

  it('snapshot is frozen — feature consumers cannot mutate it', () => {
    const r = createSettingsRegistry();
    r.registerSettingsPanel(makePanel({ id: 'a' }));
    const snap = r.getRegisteredPanels();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('subscribe + unsubscribe wire correctly', () => {
    const r = createSettingsRegistry();
    const listener = vi.fn();
    const off = r.subscribe(listener);

    r.registerSettingsPanel(makePanel({ id: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    r.registerSettingsPanel(makePanel({ id: 'b' }));
    // Listener was unsubscribed before the second register.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reset clears all panels and notifies', () => {
    const r = createSettingsRegistry();
    const listener = vi.fn();
    r.subscribe(listener);

    r.registerSettingsPanel(makePanel({ id: 'a' }));
    r.registerSettingsPanel(makePanel({ id: 'b' }));
    listener.mockClear();

    r.reset();

    expect(r.getRegisteredPanels()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
