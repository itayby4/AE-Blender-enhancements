import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import * as dotenv from 'dotenv';

dotenv.config();

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
}

const SETTINGS_DIR = path.join(os.homedir(), '.pipefx');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Ensure directory exists synchronously
if (!existsSync(SETTINGS_DIR)) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      geminiApiKey: parsed.geminiApiKey || process.env.GEMINI_API_KEY || '',
      openaiApiKey: parsed.openaiApiKey || process.env.OPENAI_API_KEY || '',
      anthropicApiKey: parsed.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, fallback to ENV default
      const defaultSettings: AppSettings = {
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      };
      
      try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf-8');
      } catch(e) {
        console.warn('[Settings] Failed to create default settings file', e);
      }
      return defaultSettings;
    }
    
    // Some other error
    console.error('[Settings] Failed to load settings:', error);
    return {
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      openaiApiKey: process.env.OPENAI_API_KEY || '',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // Avoid re-reading via loadSettings to prevent loops.
  let currentSettings: AppSettings;
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    currentSettings = JSON.parse(data);
  } catch (e: any) {
    currentSettings = { geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' };
  }

  const newSettings = { ...currentSettings, ...settings };
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Settings] Failed to save settings:', error);
    throw error;
  }
}
