// ── @pipefx/skills/marketplace — public surface ──────────────────────────
// Browser-safe import/export for `.pfxskill` bundles. Intentionally
// excludes signing operations (Node-only — see `domain/signing.ts`) so
// the desktop's import dialog can run this in the renderer without a
// crypto polyfill.

export {
  exportSkillBundle,
  buildSkillBundleEnvelope,
  type ExportableResource,
  type ExportSkillBundleInput,
} from './export.js';

export {
  parseSkillBundle,
  bundleToInstallRequest,
  type ParsedBundle,
  type ParsedResource,
  type ImportBundleResult,
} from './import.js';

export {
  bundleEnvelopeSchema,
  BUNDLE_SCHEMA_VERSION,
  type BundleEnvelopeWire,
  type BundleResourceWire,
} from './bundle-format.js';

// ── v2 (Phase 12) — zip-based .pfxskill ─────────────────────────────────

export {
  parseSkillBundleV2,
  createSkillBundleV2,
  SKILL_MD_FILENAME,
  SIGNING_MANIFEST_FILENAME,
  BUNDLE_V2_SCHEMA_VERSION,
  type ParsedSkillBundleV2,
  type ParsedSkillBundleResource,
  type ParsedSkillBundleSigning,
  type ParseSkillBundleV2Result,
  type CreateSkillBundleV2Input,
} from './bundle-v2.js';
