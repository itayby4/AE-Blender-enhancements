// ── @pipefx/post-production/contracts — types ────────────────────────────
// Frozen shapes shared across the post-production workflows. These are the
// inputs/outputs of `WorkflowDescriptor.execute(...)` and the
// representations the UI / backend / engines all agree on.
//
// Semver-locked: adding a field is additive; removing or tightening is
// a bump. Implementation-specific shapes (autopod-only options, etc.)
// stay inside their own workflow folder rather than leaking up here.

// ── Identity ─────────────────────────────────────────────────────────────

/** Stable, kebab-case identifier for a workflow type
 *  ("autopod", "audio-sync", "subtitles", "understanding"). */
export type WorkflowId = string;

/** UUID minted by the orchestrator when a run starts. Used to correlate
 *  progress events back to the originating request and to look up the
 *  output manifest later. */
export type WorkflowRunId = string;

// ── Media primitives ─────────────────────────────────────────────────────

/**
 * A pointer to a media file on disk, decorated with whatever metadata the
 * caller already knows. Workflows that need richer probing (sample rate,
 * codec, frame count) call out to `@pipefx/video-kit` themselves — we
 * keep this descriptor cheap to construct from a directory listing.
 */
export interface MediaClip {
  /** Absolute path on the local filesystem. */
  path: string;
  /** File size in bytes — useful for the UI's pre-flight summary. */
  sizeBytes?: number;
  /** Duration in seconds when known up front. */
  durationSec?: number;
  /** "video" | "audio" | "image" — best-effort categorization, not
   *  authoritative. Workflows must verify before using. */
  kind?: 'video' | 'audio' | 'image';
  /** Free-form label shown in the picker UI. Defaults to the basename
   *  when the consumer renders the clip. */
  label?: string;
}

/**
 * A logical timeline of clips. Represents the OUTPUT side of a workflow
 * (e.g. autopod produces a multicam edit; audio-sync produces a synced
 * timeline). The shape stays minimal because each NLE / format has its
 * own canonical representation — when you need the editorial model,
 * round-trip through `@pipefx/video-kit/fcpxml`.
 */
export interface Timeline {
  /** Frame rate in fps. Required because most NLEs reject ambiguous
   *  timecode otherwise. */
  fps: number;
  /** Width × height of the timeline. */
  width: number;
  height: number;
  /** Tracks of clips. Tracks are ordered top-to-bottom in the NLE. */
  tracks: ReadonlyArray<TimelineTrack>;
}

export interface TimelineTrack {
  /** "video" | "audio" — separate-tracks NLE convention. */
  kind: 'video' | 'audio';
  /** Clip placements on this track. */
  items: ReadonlyArray<TimelineItem>;
}

export interface TimelineItem {
  clip: MediaClip;
  /** Start position on the timeline, in seconds. */
  startSec: number;
  /** Duration on the timeline, in seconds. May differ from
   *  `clip.durationSec` after trimming. */
  durationSec: number;
  /** Optional in-point inside the source clip. */
  sourceInSec?: number;
}

// ── Workflow descriptor ──────────────────────────────────────────────────

/**
 * The contract every workflow implementation satisfies. The orchestrator
 * picks the descriptor by `id`, validates `input` against the descriptor's
 * own shape (each workflow declares its input type), then calls
 * `execute()` to produce a `WorkflowResult`.
 *
 * Why the per-workflow input is `unknown` here: each workflow's input
 * shape is too different to capture in a single union (autopod needs a
 * folder of clips + an FCPXML; subtitles needs a single video; image
 * understanding needs a list of images). Each workflow exports its own
 * typed wrapper that calls into this generic shape.
 */
export interface WorkflowDescriptor<TInput = unknown, TOutput = WorkflowResult> {
  id: WorkflowId;
  /** Human-readable name shown in the UI panel header. */
  name: string;
  /** One-line description for tooltips + skill-library cards. */
  description: string;
  /** Whether the workflow runs locally (no provider calls) or fans out
   *  to a billed capability (LLM / STT / image / video gen). The runner
   *  uses this hint to decide whether a quota check is needed. */
  metered: boolean;
  /** Run the workflow with the given input. Streams progress via
   *  `onProgress` — the consumer is responsible for piping that into
   *  whatever transport (SSE, WebSocket, in-process subscriber) it
   *  uses. */
  execute(input: TInput, ctx: WorkflowContext): Promise<TOutput>;
}

/**
 * Per-run context handed to `execute()`. Implementations destructure what
 * they need; we add fields here rather than overloading the input shape
 * because every workflow gets the same context regardless of input.
 */
export interface WorkflowContext {
  /** Ambient output directory for intermediate + final files. The
   *  orchestrator picks an OS-temp-prefixed path and cleans it up after
   *  the run unless the caller opts in to persistence. */
  outputDir: string;
  /** Run id — included on every progress event so listeners can
   *  correlate across runs. */
  runId: WorkflowRunId;
  /** Progress callback. Workflows MAY call this 0+ times before
   *  resolving; the orchestrator de-dupes identical messages itself. */
  onProgress?: (event: WorkflowProgressEvent) => void;
  /**
   * Optional quota gate. When provided, the workflow MUST call this
   * before kicking off any metered sub-step (LLM, STT, image gen, video
   * gen) and MUST abort with `WorkflowQuotaError` if the gate denies.
   *
   * Phase 9 ships with this hook stubbed; Phase 8 (Billing) wires the
   * real registry in. Stubbing now means Phase 8 is one-line per call
   * site rather than a refactor.
   */
  quota?: QuotaChecker;
}

// ── Quota seam ───────────────────────────────────────────────────────────
// Mirrors the shape used by `@pipefx/skills/runner.ts` so a single billing
// adapter (Phase 8) can serve both surfaces. The decision shape is
// intentionally minimal — workflows don't need to know about pricing
// internals; they just need a yes/no.

export interface QuotaCheckRequest {
  /** Capability the workflow is about to consume — e.g.
   *  "stt.whisper", "llm.gemini-2.5-flash", "image.gen.seeddream". */
  capability: string;
  /** Best-effort estimate of the unit cost (tokens, seconds, characters,
   *  images, …) the call will incur. Used by the gate for both display
   *  and pre-authorization. */
  estimatedUnits?: number;
  /** Free-form metadata the gate may surface back to the user. */
  context?: Record<string, unknown>;
}

export type QuotaDecision =
  | { allowed: true; holdId?: string }
  | { allowed: false; reason: string };

export type QuotaChecker = (req: QuotaCheckRequest) => Promise<QuotaDecision>;

// ── Run lifecycle ────────────────────────────────────────────────────────

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface WorkflowProgressEvent {
  runId: WorkflowRunId;
  /** "discover", "transcode", "analyze", … — workflow-defined. The UI
   *  treats it as a label only; no enum because it would have to grow
   *  every time a workflow adds a step. */
  step: string;
  /** Optional 0–1 progress fraction. Omitted when the workflow can't
   *  report a percentage (open-ended LLM call, etc.). */
  fraction?: number;
  /** Free-form human message — shown verbatim in the UI's progress log. */
  message?: string;
}

/**
 * Common envelope every workflow returns. Implementations attach
 * workflow-specific output via `data` and report any human-readable
 * artifacts (XML files, SRT, JPEG manifests) under `artifacts`.
 */
export interface WorkflowResult<T = unknown> {
  runId: WorkflowRunId;
  status: WorkflowStatus;
  data: T;
  /** Files the workflow produced that the user can download. The path
   *  is absolute on the orchestrator host. The UI typically presents
   *  these as a list of links + a "save as…" action. */
  artifacts: ReadonlyArray<WorkflowArtifact>;
  /** When `status === 'failed'`, a structured error description. */
  error?: WorkflowError;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface WorkflowArtifact {
  /** Absolute path on disk. */
  path: string;
  /** MIME-ish hint for the renderer ("application/xml", "text/srt",
   *  "image/jpeg"). */
  mediaType?: string;
  /** Display label for the UI. */
  label?: string;
  /** Approximate size in bytes. Omitted when unknown to avoid a costly
   *  stat() per artifact. */
  sizeBytes?: number;
}

export interface WorkflowError {
  /** Stable code so the UI can pattern-match on classes of failure
   *  ("python_engine_failed", "quota_denied", "input_invalid"). */
  code: string;
  message: string;
  /** Workflow-specific extra payload (stderr lines from a Python
   *  engine, the offending input field path, …). */
  details?: Record<string, unknown>;
}

// ── Errors ───────────────────────────────────────────────────────────────

/**
 * Thrown by `WorkflowContext.quota?.()` consumers when the gate denies.
 * Distinct from a generic `Error` so the orchestrator can map it to a
 * specific HTTP status and the UI can surface a "you're out of credits"
 * dialog instead of a generic failure card.
 */
export class WorkflowQuotaError extends Error {
  readonly code = 'quota_denied';
  constructor(
    message: string,
    readonly capability: string,
    readonly reason: string
  ) {
    super(message);
    this.name = 'WorkflowQuotaError';
  }
}

/**
 * Thrown when a Python engine (autopod, audio-sync, xml-inject) exits
 * non-zero. Carries the captured stderr so the UI can show what went
 * wrong without forcing the user to find log files.
 */
export class WorkflowEngineError extends Error {
  readonly code = 'engine_failed';
  constructor(
    message: string,
    readonly engine: string,
    readonly exitCode: number,
    readonly stderr: string
  ) {
    super(message);
    this.name = 'WorkflowEngineError';
  }
}
