/**
 * System-prompt section primitives, ported from
 * https://github.com/yasasbanukaofficial/claude-code (MIT) —
 * `src/constants/systemPromptSections.ts` + the tiny slice of
 * `src/bootstrap/state.ts` that backs it.
 *
 * A section is just `{ name, compute, cacheBreak }`. The resolver
 * memoizes compute() results in a process-local Map keyed by `name`,
 * so unchanged sections (identity, tone, planning discipline) pay their
 * cost once per process. Volatile sections opt out via cacheBreak.
 *
 * `null` is a valid cached value — it means "this section is
 * intentionally empty in this context", which is cheaper than
 * recomputing it every turn.
 */

type ComputeFn = () => string | null | Promise<string | null>;

export type SystemPromptSection = {
  name: string;
  compute: ComputeFn;
  cacheBreak: boolean;
};

const cache = new Map<string, string | null>();

/** Memoized section — computed once, cached until clearSystemPromptSections(). */
export function systemPromptSection(
  name: string,
  compute: ComputeFn
): SystemPromptSection {
  return { name, compute, cacheBreak: false };
}

/**
 * Volatile section that recomputes every turn. Use sparingly — every
 * cache-break invalidates the prompt cache downstream.
 */
export function DANGEROUS_uncachedSystemPromptSection(
  name: string,
  compute: ComputeFn,
  _reason: string
): SystemPromptSection {
  return { name, compute, cacheBreak: true };
}

/**
 * Resolve sections in order, returning the non-null prompt strings.
 * Caller is responsible for joining them.
 */
export async function resolveSystemPromptSections(
  sections: SystemPromptSection[]
): Promise<string[]> {
  const resolved = await Promise.all(
    sections.map(async (s) => {
      if (!s.cacheBreak && cache.has(s.name)) {
        return cache.get(s.name) ?? null;
      }
      const value = await s.compute();
      cache.set(s.name, value);
      return value;
    })
  );
  return resolved.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/** Drop all cached sections. Call on session boundary or active-app change. */
export function clearSystemPromptSections(): void {
  cache.clear();
}
