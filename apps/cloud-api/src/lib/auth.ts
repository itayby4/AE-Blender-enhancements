/**
 * PipeFX Cloud-API — Device Token Authentication.
 *
 * Verifies device tokens by hashing the bearer token and looking up
 * the hash in the device_tokens table. Only active, non-expired,
 * non-revoked tokens are accepted.
 *
 * Security: Only the SHA-256 hash is stored — the plaintext is shown
 * to the user once at creation and never stored.
 */

import { hashToken } from '@pipefx/auth-tokens';
import { supabase } from './supabase.js';

export { hashToken };

export interface DeviceAuthResult {
  userId: string;
  tokenId: string;
  tokenName: string;
}

/**
 * Verify a device token from the Authorization header.
 * Returns the authenticated user info, or null if invalid.
 */
export async function verifyDeviceToken(
  bearerToken: string
): Promise<DeviceAuthResult | null> {
  const tokenHash = hashToken(bearerToken);

  const { data, error } = await supabase
    .from('device_tokens')
    .select('id, user_id, name, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (error || !data) return null;

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at (fire-and-forget, don't block the request)
  void supabase
    .from('device_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => { /* no-op */ }, () => { /* non-critical — swallow errors */ });

  return {
    userId: data.user_id,
    tokenId: data.id,
    tokenName: data.name,
  };
}
