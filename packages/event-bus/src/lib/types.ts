/**
 * Base shape for an event map. Consumers pass their own interface where keys
 * are dotted event names (e.g. `mcp.tools.changed`) and values are the payload
 * type for that event.
 */
export type EventMap = Record<string, unknown>;

export type EventHandler<TPayload> = (
  payload: TPayload
) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface PublishOptions {
  /**
   * When true, handler errors are re-thrown after all handlers have run instead
   * of being swallowed and reported via onError. Useful for tests and for
   * synchronous request/response gates where a failure must propagate.
   *
   * Default: false (fail-isolated).
   */
  rethrow?: boolean;
}

export interface EventBus<M extends EventMap> {
  /**
   * Subscribe to an event. Returns a function that removes the subscription.
   * Safe to call during dispatch — the unsubscribe only affects future
   * publishes, not the in-flight one.
   */
  subscribe<K extends keyof M>(
    event: K,
    handler: EventHandler<M[K]>
  ): Unsubscribe;

  /**
   * Subscribe for a single delivery. Auto-unsubscribes after the first
   * invocation completes (success or failure).
   */
  subscribeOnce<K extends keyof M>(
    event: K,
    handler: EventHandler<M[K]>
  ): Unsubscribe;

  /**
   * Publish an event. Handlers run sequentially in subscription order so that
   * events from a single producer are observed in order by every subscriber.
   * Handler errors are caught and reported via onError; they do not abort
   * remaining handlers and do not propagate to the publisher (unless
   * `options.rethrow` is set).
   */
  publish<K extends keyof M>(
    event: K,
    payload: M[K],
    options?: PublishOptions
  ): Promise<void>;

  /**
   * Number of active subscribers for an event. Test helper.
   */
  listenerCount<K extends keyof M>(event: K): number;

  /**
   * Remove every subscription. Primarily for teardown in tests.
   */
  clear(): void;
}
