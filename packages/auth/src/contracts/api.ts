// Public auth contracts — API surface.
// TODO: phase-3+ — implementations land in domain/ui/backend layers.

import type { Session, User } from './types.js';

export interface AuthApi {
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  subscribeAuth(listener: (user: User | null) => void): () => void;
}
