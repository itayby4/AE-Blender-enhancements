// ── @pipefx/command-palette/ui — cn helper ───────────────────────────────
// Tiny clsx replacement to avoid a runtime dep.

export function cn(
  ...parts: ReadonlyArray<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}
