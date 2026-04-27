// ── @pipefx/skills/ui — class-name helper ────────────────────────────────
// Tiny no-dep clsx replacement so the UI surface doesn't pull in another
// transitive dependency. Treats falsy values as drop-out.

export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
