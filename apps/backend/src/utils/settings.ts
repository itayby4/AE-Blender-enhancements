import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import * as dotenv from 'dotenv';

dotenv.config();

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface CustomPalette {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  accentHue: number;
  overrides?: Record<string, string>;
}

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  activePalette: string;
  customPalettes: CustomPalette[];
  /** 'byok' = user's own API keys, 'cloud' = PipeFX credits via cloud-api. */
  apiMode: 'byok' | 'cloud';
  /** Cloud-API URL (defaults to production). */
  cloudApiUrl: string;
  /** Device token for cloud-api authentication. */
  deviceToken: string;

  // ── Media Gen Provider Keys (BYOK mode) ──
  /** ElevenLabs API key for sound generation. */
  elevenlabsApiKey: string;
  /** Kling API key for video generation. */
  klingApiKey: string;
  /** Kling API secret for JWT signing. */
  klingApiSecret: string;
  /** BytePlus API key for SeedDream image generation. */
  byteplusApiKey: string;
  /** BytePlus SeedDream endpoint ID. */
  byteplusSeedDreamEndpoint: string;
  /** BytePlus ARK API key for SeedDance video generation. */
  byteplusArkApiKey: string;
}

// ────────────────────────────────────────────────────────
// Storage
// ────────────────────────────────────────────────────────

const SETTINGS_DIR = path.join(os.homedir(), '.pipefx');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Ensure directory exists synchronously
if (!existsSync(SETTINGS_DIR)) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
}

const DEFAULTS: AppSettings = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  activePalette: 'cool-teal',
  customPalettes: [],
  apiMode: 'byok',
  cloudApiUrl: process.env.CLOUD_API_URL || 'https://pipefx-cloud-api-production.up.railway.app',
  deviceToken: '',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  klingApiKey: process.env.KLING_API_KEY || '',
  klingApiSecret: process.env.KLING_API_SECRET || '',
  byteplusApiKey: process.env.BYTEPLUS_API_KEY || '',
  byteplusSeedDreamEndpoint: process.env.BYTEPLUS_SEEDDREAM_ENDPOINT || '',
  byteplusArkApiKey: process.env.BYTEPLUS_ARK_API_KEY || '',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    // Strip UTF-8 BOM if present (PowerShell Set-Content can write one)
    const clean = data.charCodeAt(0) === 0xFEFF ? data.slice(1) : data;
    const parsed = JSON.parse(clean);
    return {
      geminiApiKey: parsed.geminiApiKey || DEFAULTS.geminiApiKey,
      openaiApiKey: parsed.openaiApiKey || DEFAULTS.openaiApiKey,
      anthropicApiKey: parsed.anthropicApiKey || DEFAULTS.anthropicApiKey,
      activePalette: parsed.activePalette || DEFAULTS.activePalette,
      customPalettes: Array.isArray(parsed.customPalettes) ? parsed.customPalettes : [],
      apiMode: parsed.apiMode === 'cloud' ? 'cloud' : 'byok',
      cloudApiUrl: parsed.cloudApiUrl || DEFAULTS.cloudApiUrl,
      deviceToken: parsed.deviceToken || '',
      elevenlabsApiKey: parsed.elevenlabsApiKey || DEFAULTS.elevenlabsApiKey,
      klingApiKey: parsed.klingApiKey || DEFAULTS.klingApiKey,
      klingApiSecret: parsed.klingApiSecret || DEFAULTS.klingApiSecret,
      byteplusApiKey: parsed.byteplusApiKey || DEFAULTS.byteplusApiKey,
      byteplusSeedDreamEndpoint: parsed.byteplusSeedDreamEndpoint || DEFAULTS.byteplusSeedDreamEndpoint,
      byteplusArkApiKey: parsed.byteplusArkApiKey || DEFAULTS.byteplusArkApiKey,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(DEFAULTS, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[Settings] Failed to create default settings file', e);
      }
      return { ...DEFAULTS };
    }

    console.error('[Settings] Failed to load settings:', error);
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  let current: AppSettings;
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    current = JSON.parse(data);
  } catch {
    current = { ...DEFAULTS };
  }

  const merged = { ...current, ...settings };
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Settings] Failed to save settings:', error);
    throw error;
  }
}
