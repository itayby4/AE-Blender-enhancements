// ── @pipefx/command-palette/ui — fuzzy ranking ───────────────────────────
// Lightweight scoring used to order items by query relevance. Not a true
// fuzzy matcher (no character-skip scoring) — substring matches across
// label / description / group / keywords are enough for a 200-item
// palette. Returns null when no field matches the query.

import type { CommandItem } from '../../contracts/command-source.js';

export function scoreCommand(
  item: CommandItem,
  query: string
): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const label = item.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;

  const keywords = item.keywords ?? [];
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (k === q) return 70;
    if (k.startsWith(q)) return 55;
    if (k.includes(q)) return 40;
  }

  if (item.description && item.description.toLowerCase().includes(q)) {
    return 30;
  }
  if (item.group && item.group.toLowerCase().includes(q)) return 20;
  return null;
}
