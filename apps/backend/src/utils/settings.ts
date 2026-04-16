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
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      geminiApiKey: parsed.geminiApiKey || DEFAULTS.geminiApiKey,
      openaiApiKey: parsed.openaiApiKey || DEFAULTS.openaiApiKey,
      anthropicApiKey: parsed.anthropicApiKey || DEFAULTS.anthropicApiKey,
      activePalette: parsed.activePalette || DEFAULTS.activePalette,
      customPalettes: Array.isArray(parsed.customPalettes) ? parsed.customPalettes : [],
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
