// ── @pipefx/skills/domain ────────────────────────────────────────────────
// Pure domain primitives — schema validation + prompt rendering. No I/O,
// no event-bus, no connector access. Phases 7.3+ layer reactive state on
// top of this.

export {
  manifestSchema,
  parseManifest,
  parseManifestOrThrow,
  type ManifestParseResult,
} from './manifest-schema.js';

export {
  renderManifestPrompt,
  renderTemplate,
  type RenderOptions,
  type RenderResult,
  type SkillInputValue,
  type SkillInputValues,
} from './template-engine.js';

export {
  computeAvailability,
  createCapabilityMatcher,
  type CapabilityMatcherConfig,
  type CapabilityMatcherHandle,
} from './capability-matcher.js';

export {
  canonicalPayloadBytes,
  fingerprintPublicKey,
  generateSkillKeyPair,
  signSkill,
  verifySkill,
  type SignablePayload,
  type SignableResource,
  type SkillKeyPair,
} from './signing.js';
