import type {
  EventBus,
  EventHandler,
  EventMap,
  PublishOptions,
  Unsubscribe,
} from './types.js';

export interface CreateEventBusOptions {
  /**
   * Invoked when a handler throws or rejects during publish. Defaults to
   * console.error. Runs per failing handler; remaining handlers still run.
   */
  onError?: (error: unknown, event: string) => void;
}

export function createEventBus<M extends EventMap>(
  options: CreateEventBusOptions = {}
): EventBus<M> {
  const onError =
    options.onError ??
    ((error, event) => {
      // eslint-disable-next-line no-console
      console.error(`[event-bus] handler failed for "${event}":`, error);
    });

  const handlers = new Map<keyof M, Set<EventHandler<unknown>>>();

  const subscribe = <K extends keyof M>(
    event: K,
    handler: EventHandler<M[K]>
  ): Unsubscribe => {
    let set = handlers.get(event);
    if (!set) {
      set = new Set();
      handlers.set(event, set);
    }
    set.add(handler as EventHandler<unknown>);
    return () => {
      const current = handlers.get(event);
      if (!current) return;
      current.delete(handler as EventHandler<unknown>);
      if (current.size === 0) handlers.delete(event);
    };
  };

  const subscribeOnce = <K extends keyof M>(
    event: K,
    handler: EventHandler<M[K]>
  ): Unsubscribe => {
    const unsubscribe = subscribe(event, async (payload) => {
      unsubscribe();
      await handler(payload);
    });
    return unsubscribe;
  };

  const publish = async <K extends keyof M>(
    event: K,
    payload: M[K],
    publishOptions?: PublishOptions
  ): Promise<void> => {
    const set = handlers.get(event);
    if (!set || set.size === 0) return;
    // Snapshot so unsubscribes during dispatch don't mutate the iteration.
    const snapshot = [...set];
    const errors: unknown[] = [];
    for (const handler of snapshot) {
      try {
        await (handler as EventHandler<M[K]>)(payload);
      } catch (error) {
        if (publishOptions?.rethrow) {
          errors.push(error);
        } else {
          onError(error, String(event));
        }
      }
    }
    if (errors.length > 0) {
      throw errors.length === 1
        ? errors[0]
        : new AggregateError(errors, `[event-bus] ${String(event)} failed`);
    }
  };

  const listenerCount = <K extends keyof M>(event: K): number =>
    handlers.get(event)?.size ?? 0;

  const clear = (): void => {
    handlers.clear();
  };

  return { subscribe, subscribeOnce, publish, listenerCount, clear };
}
