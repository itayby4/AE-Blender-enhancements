import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus.js';

type TestEvents = {
  'user.created': { id: string };
  'user.deleted': { id: string };
  'count.bumped': number;
};

describe('createEventBus', () => {
  it('delivers payloads to subscribers', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.subscribe('user.created', handler);

    await bus.publish('user.created', { id: 'u1' });

    expect(handler).toHaveBeenCalledExactlyOnceWith({ id: 'u1' });
  });

  it('invokes handlers in subscription order', async () => {
    const bus = createEventBus<TestEvents>();
    const order: string[] = [];
    bus.subscribe('count.bumped', () => {
      order.push('a');
    });
    bus.subscribe('count.bumped', () => {
      order.push('b');
    });
    bus.subscribe('count.bumped', () => {
      order.push('c');
    });

    await bus.publish('count.bumped', 1);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('awaits async handlers sequentially', async () => {
    const bus = createEventBus<TestEvents>();
    const order: string[] = [];
    bus.subscribe('count.bumped', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
    });
    bus.subscribe('count.bumped', () => {
      order.push('fast');
    });

    await bus.publish('count.bumped', 1);

    expect(order).toEqual(['slow', 'fast']);
  });

  it('unsubscribe stops future deliveries', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.subscribe('user.created', handler);

    await bus.publish('user.created', { id: 'u1' });
    off();
    await bus.publish('user.created', { id: 'u2' });

    expect(handler).toHaveBeenCalledExactlyOnceWith({ id: 'u1' });
  });

  it('subscribeOnce delivers exactly once', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.subscribeOnce('user.created', handler);

    await bus.publish('user.created', { id: 'u1' });
    await bus.publish('user.created', { id: 'u2' });

    expect(handler).toHaveBeenCalledExactlyOnceWith({ id: 'u1' });
    expect(bus.listenerCount('user.created')).toBe(0);
  });

  it('unsubscribing during dispatch does not skip the current publish', async () => {
    const bus = createEventBus<TestEvents>();
    const handlerB = vi.fn();
    const unsubs: Array<() => void> = [];
    bus.subscribe('user.created', () => {
      unsubs[0]?.();
    });
    unsubs.push(bus.subscribe('user.created', handlerB));

    await bus.publish('user.created', { id: 'u1' });
    expect(handlerB).toHaveBeenCalledExactlyOnceWith({ id: 'u1' });

    await bus.publish('user.created', { id: 'u2' });
    expect(handlerB).toHaveBeenCalledExactlyOnceWith({ id: 'u1' });
  });

  it('isolates handler errors and routes them to onError', async () => {
    const onError = vi.fn();
    const bus = createEventBus<TestEvents>({ onError });
    const survivor = vi.fn();
    bus.subscribe('user.created', () => {
      throw new Error('boom');
    });
    bus.subscribe('user.created', survivor);

    await expect(
      bus.publish('user.created', { id: 'u1' })
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][1]).toBe('user.created');
    expect(survivor).toHaveBeenCalledExactlyOnceWith({ id: 'u1' });
  });

  it('rethrows handler errors when publish rethrow=true', async () => {
    const bus = createEventBus<TestEvents>({ onError: vi.fn() });
    bus.subscribe('user.created', () => {
      throw new Error('boom');
    });

    await expect(
      bus.publish('user.created', { id: 'u1' }, { rethrow: true })
    ).rejects.toThrow('boom');
  });

  it('aggregates multiple rethrown handler errors', async () => {
    const bus = createEventBus<TestEvents>({ onError: vi.fn() });
    bus.subscribe('user.created', () => {
      throw new Error('first');
    });
    bus.subscribe('user.created', () => {
      throw new Error('second');
    });

    await expect(
      bus.publish('user.created', { id: 'u1' }, { rethrow: true })
    ).rejects.toBeInstanceOf(AggregateError);
  });

  it('publish is a no-op when no subscribers', async () => {
    const bus = createEventBus<TestEvents>();
    await expect(
      bus.publish('user.deleted', { id: 'gone' })
    ).resolves.toBeUndefined();
  });

  it('clear removes all subscriptions', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.subscribe('user.created', handler);
    bus.subscribe('user.deleted', handler);

    bus.clear();

    expect(bus.listenerCount('user.created')).toBe(0);
    expect(bus.listenerCount('user.deleted')).toBe(0);
    await bus.publish('user.created', { id: 'u1' });
    expect(handler).not.toHaveBeenCalled();
  });
});
