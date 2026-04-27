// ── @pipefx/skills/marketplace — public surface ──────────────────────────
// Browser-safe parsing + assembly of `.pfxskill` v2 (zip) bundles. The
// renderer consumes these in the import dialog before sending bytes to
// the backend, so this module deliberately avoids Node-only APIs. The
// signing helpers (Phase 12.13) sit on top of `domain/signing.ts` and
// run wherever Web Crypto Ed25519 is available — Node 22+ and modern
// browsers both qualify.

export {
  parseSkillBundleV2,
  createSkillBundleV2,
  signSkillBundle,
  verifySkillBundle,
  SKILL_MD_FILENAME,
  SIGNING_MANIFEST_FILENAME,
  BUNDLE_V2_SCHEMA_VERSION,
  type ParsedSkillBundleV2,
  type ParsedSkillBundleResource,
  type ParsedSkillBundleSigning,
  type ParseSkillBundleV2Result,
  type CreateSkillBundleV2Input,
  type SkillBundleSignature,
  type VerifySignatureResult,
} from './bundle-v2.js';
