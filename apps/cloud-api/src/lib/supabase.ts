/**
 * PipeFX Cloud-API — Supabase Admin Client.
 *
 * Service-role client for billing operations:
 * - Device token verification
 * - Credit reservation / settlement / release
 * - Usage log insertion
 * - Pricing table reads
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
