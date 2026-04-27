// ── @pipefx/skills/domain ────────────────────────────────────────────────
// Pure domain primitives — schema validation + Markdown parsing for the
// SKILL.md format. No I/O, no event-bus, no connector access. The
// capability matcher (12.4), three-mode runner (12.5), and signing port
// (12.13) layer reactive state on top of these primitives in later
// sub-phases.

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
  computeAvailability,
  createCapabilityMatcher,
  isToolSatisfied,
  type CapabilityMatcherDeps,
  type CapabilityMatcherHandle,
} from './capability-matcher.js';

export {
  buildMountInstruction,
  createSkillRunner,
  deriveAllowedTools,
  renderTemplate,
  runPromptMode,
  runScriptMode,
  type PromptModeRunInput,
  type PromptModeRunResult,
  type ScriptModeRunInput,
  type ScriptRunInput,
  type ScriptRunResult,
  type ScriptRunner,
  type SkillRunnerDeps,
  type TemplateValues,
} from './runner/index.js';

export {
  renderPromptTemplate,
  renderScaffoldTemplate,
  renderScriptTemplate,
  type ScaffoldedSkill,
  type SkillScaffoldMode,
  type SkillScaffoldOptions,
} from './scaffold-templates.js';

export {
  buildCanonicalPayload,
  bytesToHex,
  CANONICAL_PAYLOAD_VERSION,
  generateEd25519Keypair,
  hexToBytes,
  signCanonicalPayload,
  verifyCanonicalPayload,
  type CanonicalPayloadInput,
  type CanonicalPayloadResource,
  type SkillBundleSignature,
  type VerifySignatureResult,
} from './signing.js';
