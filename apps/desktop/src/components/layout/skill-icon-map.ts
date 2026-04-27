// ── Skill icon map (12.10.5) ─────────────────────────────────────────────
// Resolves a `frontmatter.icon` string (lucide name, PascalCase by
// convention) to a React component. Shared by `NavRail` and
// `SkillQuickFilter` so the same icon shows everywhere a skill surfaces.

import type { ComponentType } from 'react';
import {
  AudioWaveform,
  Beaker,
  BookOpen,
  Bot,
  Clapperboard,
  ImageIcon,
  Library,
  MessageSquare,
  Mic,
  Music,
  Network,
  Scissors,
  Settings,
  Smartphone,
  Sparkles,
  Subtitles,
  Video,
  Wand2,
  Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  audiowaveform: AudioWaveform,
  beaker: Beaker,
  bookopen: BookOpen,
  bot: Bot,
  clapperboard: Clapperboard,
  imageicon: ImageIcon,
  library: Library,
  messagesquare: MessageSquare,
  mic: Mic,
  music: Music,
  network: Network,
  scissors: Scissors,
  settings: Settings,
  smartphone: Smartphone,
  sparkles: Sparkles,
  subtitles: Subtitles,
  video: Video,
  wand2: Wand2,
  zap: Zap,
};

export function resolveSkillIcon(
  name: string | undefined
): ComponentType<{ className?: string }> {
  if (!name) return Bot;
  return ICON_MAP[name.toLowerCase()] ?? Bot;
}
