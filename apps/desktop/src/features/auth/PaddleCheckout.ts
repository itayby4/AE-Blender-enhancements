/**
 * PipeFX Desktop — Paddle.js Integration.
 *
 * Initializes the Paddle Billing SDK and exposes a React hook
 * for opening overlay checkouts. Uses the `@paddle/paddle-js`
 * npm package rather than a CDN script tag, since we're running
 * inside a Tauri webview with a Vite bundler.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';

const PADDLE_CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '';
const PADDLE_ENV = (import.meta.env.VITE_PADDLE_ENV || 'sandbox') as
  | 'sandbox'
  | 'production';

export interface CheckoutCallbacks {
  onComplete?: (data: Record<string, unknown>) => void;
  onClose?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Hook that lazily initializes Paddle.js on first use and
 * returns a function to open an overlay checkout.
 */
export function usePaddleCheckout(callbacks?: CheckoutCallbacks) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Initialize Paddle.js once
  useEffect(() => {
    if (!PADDLE_CLIENT_TOKEN) {
      console.warn(
        '[Paddle] Missing VITE_PADDLE_CLIENT_TOKEN — checkout will be disabled.'
      );
      return;
    }

    initializePaddle({
      token: PADDLE_CLIENT_TOKEN,
      environment: PADDLE_ENV,
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          setIsOpen(false);
          callbacksRef.current?.onComplete?.(
            event.data as unknown as Record<string, unknown>
          );
        }
        if (event.name === 'checkout.closed') {
          setIsOpen(false);
          callbacksRef.current?.onClose?.();
        }
        if (event.name === 'checkout.error') {
          callbacksRef.current?.onError?.(event.data);
        }
      },
    })
      .then((instance) => {
        if (instance) {
          setPaddle(instance);
          setIsReady(true);
        }
      })
      .catch((err) => {
        console.error('[Paddle] Failed to initialize:', err);
      });
  }, []);

  /**
   * Open the Paddle overlay checkout for a given price ID.
   *
   * @param priceId  - Paddle price ID (e.g. `pri_xxx`)
   * @param email    - Customer email to prefill (skips the email step)
   * @param userId   - Supabase user ID to pass as custom_data so webhooks can link the Paddle customer
   */
  const openCheckout = useCallback(
    (priceId: string, email?: string, userId?: string) => {
      if (!paddle) {
        console.error('[Paddle] SDK not initialized yet.');
        return;
      }

      setIsOpen(true);

      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        ...(email
          ? {
              customer: { email },
            }
          : {}),
        // Pass the Supabase user ID so the Cloud-API webhook can link
        // paddle_customer_id → profiles.id on first purchase.
        ...(userId ? { customData: { userId } } : {}),
        settings: {
          displayMode: 'overlay',
          theme: 'dark',
          locale: 'en',
        },
      });
    },
    [paddle]
  );

  return {
    /** Whether Paddle.js has finished loading */
    isReady,
    /** Whether a checkout overlay is currently open */
    isOpen,
    /** Open the overlay checkout */
    openCheckout,
    /** Whether Paddle credentials are configured */
    isConfigured: !!PADDLE_CLIENT_TOKEN,
  };
}
