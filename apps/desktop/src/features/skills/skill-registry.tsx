import type { ComponentType } from 'react';
import { SubtitlesDashboard } from '../subtitles/SubtitlesDashboard';
import { AnimatedSubtitlesUI } from './AnimatedSubtitlesUI';
import { AutopodDashboard } from '../autopod/AutopodDashboard';

/**
 * Registry mapping skill IDs to their React UI components.
 * Only Tier 1 (React component) skills are registered here.
 * Tier 2 (HTML-in-MD) and Tier 3 (Chat cards) are handled elsewhere.
 */
export const SKILL_UI_REGISTRY: Record<string, ComponentType> = {
  'auto-subtitles': SubtitlesDashboard,
  'animated-subtitles': AnimatedSubtitlesUI,
  'autopod': AutopodDashboard,
};
