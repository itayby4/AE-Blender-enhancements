// ── @pipefx/skills/domain — prompt-mode template engine ──────────────────
// Handlebars-flavored `{{ name }}` substitution over the SKILL.md body.
// Pure — used by `runPromptMode` to inline form values into the message
// the brain sees. Unknown variables are left as-is (no silent erasure)
// so authors notice typos in their bodies during smoke runs.

const VAR_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export type TemplateValues = Readonly<
  Record<string, string | number | boolean>
>;

export function renderTemplate(
  body: string,
  values: TemplateValues
): string {
  return body.replace(VAR_PATTERN, (whole, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
    return String(values[name]);
  });
}
