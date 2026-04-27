import { readFile } from 'node:fs/promises';

import type {
  ConnectorCapabilityManifest,
  ConnectorId,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';

/**
 * Common imperative verb prefixes found in MCP tool names. Stripped when
 * deriving capability namespaces so `add_timeline_marker` yields
 * `timeline.*` rather than `add.*`. Intentionally conservative: unknown
 * prefixes are kept so we do not flatten real nouns ("render", "export"
 * can double as verbs and nouns depending on the MCP's style).
 */
const TOOL_NAME_VERBS: ReadonlySet<string> = new Set([
  'add',
  'call',
  'clear',
  'create',
  'delete',
  'fetch',
  'find',
  'get',
  'list',
  'load',
  'open',
  'read',
  'remove',
  'reset',
  'run',
  'save',
  'set',
  'start',
  'stop',
  'update',
  'write',
]);

/**
 * Split an MCP tool name on the separators commonly found in the wild
 * (`_`, `.`, `:`, `-`) and return the lower-cased non-empty segments.
 */
function splitToolName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[_:.-]+/)
    .filter((segment) => segment.length > 0);
}

/**
 * Derive a single capability identifier for `tool` owned by `connectorId`.
 * Returns `null` if the tool name has no usable segment (e.g. empty after
 * verb stripping) — the caller should skip it rather than emit a bare
 * `connectorId.*`, which would swallow every tool into one bucket.
 */
function deriveToolCapability(
  connectorId: ConnectorId,
  tool: ToolDescriptor
): string | null {
  const segments = splitToolName(tool.name);
  if (segments.length === 0) return null;
  const meaningful = segments.filter((s) => !TOOL_NAME_VERBS.has(s));
  const root = meaningful[0] ?? segments[0];
  return root ? `${connectorId}.${root}.*` : null;
}

export interface DeriveCapabilitiesOptions {
  /**
   * Explicit manifest override — when present, its `capabilities` and
   * `toolCapabilities` are merged and the heuristic below is skipped for
   * any tool covered by `toolCapabilities`.
   */
  manifest?: ConnectorCapabilityManifest;
}

/**
 * Compute the capability set a connector exposes, given its tool list.
 *
 * Order of precedence:
 *   1. `manifest.toolCapabilities[toolName]` — per-tool explicit mapping.
 *   2. `manifest.capabilities` — static list merged as-is.
 *   3. Heuristic: `${connectorId}.${firstMeaningfulSegment}.*` per tool,
 *      deduplicated.
 *
 * Result is stable-sorted so downstream fingerprints (skills matcher,
 * `mcp.tools.changed` dedup) do not flap on insertion order.
 */
export function deriveCapabilities(
  connectorId: ConnectorId,
  tools: ToolDescriptor[],
  options: DeriveCapabilitiesOptions = {}
): string[] {
  const out = new Set<string>();
  const manifest = options.manifest;
  const covered = new Set<string>();

  if (manifest) {
    for (const cap of manifest.capabilities) out.add(cap);
    if (manifest.toolCapabilities) {
      for (const [toolName, caps] of Object.entries(manifest.toolCapabilities)) {
        covered.add(toolName);
        for (const cap of caps) out.add(cap);
      }
    }
  }

  for (const tool of tools) {
    if (covered.has(tool.name)) continue;
    const derived = deriveToolCapability(connectorId, tool);
    if (derived) out.add(derived);
  }

  return [...out].sort();
}

/**
 * Minimal shape validation for an on-disk `capabilities.json`. Rejects
 * anything that would break `deriveCapabilities` at runtime — the loader
 * never has to guess what a malformed manifest meant.
 */
function isValidManifest(
  value: unknown
): value is ConnectorCapabilityManifest {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['connectorId'] !== 'string') return false;
  if (!Array.isArray(obj['capabilities'])) return false;
  if (!obj['capabilities'].every((c) => typeof c === 'string')) return false;
  if (obj['toolCapabilities'] !== undefined) {
    const tc = obj['toolCapabilities'];
    if (typeof tc !== 'object' || tc === null) return false;
    for (const v of Object.values(tc)) {
      if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Load a `capabilities.json` manifest from disk. Returns `null` when the
 * file is missing (ENOENT) — that's the expected path for MCPs that have
 * not opted in yet. Throws on read errors and malformed JSON so genuine
 * misconfigurations surface loudly at startup.
 */
export async function loadCapabilityManifest(
  path: string
): Promise<ConnectorCapabilityManifest | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isValidManifest(parsed)) {
    throw new Error(
      `Invalid capability manifest at ${path}: expected { connectorId: string, capabilities: string[], toolCapabilities?: Record<string, string[]> }`
    );
  }
  return parsed;
}
