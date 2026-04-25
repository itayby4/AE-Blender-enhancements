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

// ── v2 (Phase 12) — SKILL.md frontmatter ────────────────────────────────

export {
  frontmatterSchema,
  parseFrontmatter,
  parseFrontmatterOrThrow,
  type FrontmatterParseResult,
} from './skill-md-schema.js';

export {
  parseSkillMd,
  parseSkillMdOrThrow,
  type ParseSkillMdOptions,
  type SkillMdParseError,
  type SkillMdParseResult,
} from './skill-md-parser.js';

export {
  createSkillRunner,
  deriveAllowedTools,
  SkillNotFoundError,
  SkillRunQuotaError,
  SkillUnavailableError,
  type QuotaChecker,
  type QuotaDecision,
  type SkillRunner,
  type SkillRunnerConfig,
} from './runner.js';
