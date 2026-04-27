// Public auth contracts — types.
// TODO: phase-3+ — flesh out once domain layer is implemented.

export interface User {
  id: string;
  email: string;
}

export interface Session {
  userId: string;
  accessToken: string;
  expiresAt: string;
}

export interface AuthToken {
  id: string;
  userId: string;
  name: string;
  expiresAt: string | null;
}

export interface AuthError {
  code: string;
  message: string;
}
