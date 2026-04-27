import { createHash } from 'node:crypto';

/**
 * Hash a plaintext device token to its stored form.
 *
 * Security: only the SHA-256 hash is stored — the plaintext is shown to the
 * user once at creation and never persisted.
 */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
