// Public auth contracts — event names.
// TODO: phase-3+ — wire into event-bus once domain layer is implemented.

export const AUTH_SIGNED_IN = 'auth.signed-in' as const;
export const AUTH_SIGNED_OUT = 'auth.signed-out' as const;
export const AUTH_TOKEN_REFRESHED = 'auth.token-refreshed' as const;

export type AuthEventName =
  | typeof AUTH_SIGNED_IN
  | typeof AUTH_SIGNED_OUT
  | typeof AUTH_TOKEN_REFRESHED;
