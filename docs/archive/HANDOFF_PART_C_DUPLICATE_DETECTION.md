# PipeFX — Part C: Duplicate-Call Detection Handoff

Start-here doc for a fresh chat that will debug / extend the duplicate-call
reminder added to the self-check system.

> Read this, then [`CLAUDE.md`](CLAUDE.md) for architecture, then
> [`HANDOFF_AE_AGENT.md`](HANDOFF_AE_AGENT.md) for prior AE context.

---

## Why this exists

Gemini was observed looping for 25 rounds calling the AE bridge with identical
args and getting identical errors — classic "shape-rotation" failure mode.
Parts A (plan-mode strip) and B (typed tools instead of `run-script`) addressed
the structural causes. **Part C** is the safety net: when the model *does* hit
a stuck state, a `<system-reminder>` tells it — by name, with counts — to stop
and surface what's missing.

Reference behavior ported from the upstream Claude-Code replica
`yasasbanukaofficial/claude-code` (selfCheck pattern, tool-use-error wrapping).

---

## What changed in this session

Three files. Diff is ~60 lines total.

### 1. `packages/ai/src/lib/types.ts`
Extended `PostRoundReminderContext` so the reminder hook sees full per-call
detail, not just tool names.

```ts
export interface PostRoundToolCall {
  name: string;
  args: Record<string, unknown>;
  isError: boolean;
}

export interface PostRoundReminderContext {
  toolNames: string[];
  toolCalls: PostRoundToolCall[];   // NEW
  roundNumber: number;
}
```

### 2. `packages/ai/src/lib/agent.ts`
Both loops (streaming + non-streaming) now build a `callId → args` map from
`response.toolCalls` and pair each `toolResult` with its original args +
`isError` flag before handing context to `getPostRoundReminder`.

Search for `argsByCallId` — two identical blocks.

### 3. `packages/agents/src/lib/selfCheck.ts`
- `SelfCheckState` now holds a bounded ring buffer:
  ```ts
  interface CallFingerprint { round: number; key: string; isError: boolean; }
  recentCalls: CallFingerprint[]
  ```
- `fingerprintArgs()` deep-sorts object keys so `{a,b}` and `{b,a}` match.
- New section 0 (runs before every other reminder): when a tool call in the
  current round has `isError: true` and its fingerprint already appears in
  `recentCalls` with `isError: true`, emit:

  > You called \`<tool>\` with identical args N times now (first seen in round
  > X, latest in round Y) and got the same error each time. Stop retrying with
  > the same arguments. Read the error message, then either (a) call an
  > inspection tool to discover the missing parameter, or (b) tell the user
  > exactly what information you need.

- History window: last **8 rounds × ~4 calls** (`CALL_HISTORY_WINDOW * 4 = 32`
  entries max). Cheap to scan linearly.
- Exported type: `PostRoundToolCall` added to [`packages/ai/src/index.ts`](packages/ai/src/index.ts).

---

## Design notes / decisions

- **Only error-on-error repeats trigger.** Successful repeated calls (e.g. the
  user asking for five similar shapes) are legal — don't scold. The loop is
  defined by *repeated failure*, not repeated invocation.
- **Fires at repeat ≥ 2**, i.e. the 2nd erroring call gets the reminder. Waiting
  for 3rd lets the model waste one more round; waiting for 1st false-positives
  on first-time errors the model is about to self-correct.
- **Stable args key.** `JSON.stringify` on sorted keys. Arrays preserve order
  (positions like `[x, y]` matter). Nested objects are recursed.
- **Per-chat lifecycle.** `freshSelfCheckState()` is called once per HTTP turn
  at [`apps/backend/src/routes/chat.ts:347`](apps/backend/src/routes/chat.ts:347);
  history is scoped to a single `/chat` request (25-round cap limits it
  naturally). History does NOT carry across user turns.
- **No LLM-visible history dump.** The reminder names the tool and round
  numbers but does not echo the args back — keeps reminder short; the model
  already has the prior tool_use blocks in context.

---

## How to verify it works

### Unit-test style (no AE needed)
Simulate a post-round context and call `buildPostRoundReminder` twice:

```ts
import { freshSelfCheckState, buildPostRoundReminder } from '@pipefx/agents';

const st = freshSelfCheckState();

const ctx1 = {
  toolNames: ['create-shape-layer'],
  toolCalls: [{ name: 'create-shape-layer', args: { shapeType: 'ellipse' }, isError: true }],
  roundNumber: 3,
};
console.log(buildPostRoundReminder(ctx1, st, null)); // null — first occurrence

const ctx2 = {
  toolNames: ['create-shape-layer'],
  toolCalls: [{ name: 'create-shape-layer', args: { shapeType: 'ellipse' }, isError: true }],
  roundNumber: 4,
};
console.log(buildPostRoundReminder(ctx2, st, null)); // fires reminder
```

Drop this into a scratch file and run `pnpm tsx <file>`.

### Live E2E (AE)
1. Start AE bridge, start backend with `PIPEFX_AI_LOG=debug`.
2. Ask the desktop app: *"create a camera at [0, 0, -2000] in a comp that doesn't exist"*.
   - `create-camera` will fail on "No composition found".
   - Gemini's usual behavior: retry. On retry #2, expect a new
     `<system-reminder>` line in the agent log just before the next model turn.
3. `grep "identical args" <log>` — should appear once on round 4+.

### Build check
```bash
pnpm nx run-many -t build -p @pipefx/ai @pipefx/agents @pipefx/backend
```
All three green.

---

## Known limitations / follow-ups

- **Arg fingerprinting is lossy** for `undefined` values (they disappear under
  `JSON.stringify`). Acceptable — the model rarely flips undefined↔present
  without also changing something else.
- **No cross-turn memory.** If the user types the exact same prompt twice in a
  row and the model errors identically, each turn starts fresh. Fine for now.
- **No rate-limit on the reminder itself.** If the model ignores it and keeps
  erroring, the reminder fires every subsequent round. That's arguably correct
  (the MAX_TOOL_ROUNDS cap kicks in by round 25 regardless).
- **AE `getProjectInfo` staleness** — separate bug still open. After
  `create-composition` success, `getProjectInfo` sometimes reports `numItems:0`
  for one more round. `captureBaseline: true` in the AE asyncPolicy mitigates
  but doesn't fully close it. Not touched by Part C.
- **Part D candidate** (not yet implemented): read-before-write guards — reject
  a `create-*` call until a matching `get-*` has returned in the current turn.
  Bigger change; talk to the user first.

---

## Files to start with in the new chat

| File | Purpose |
|---|---|
| [`packages/agents/src/lib/selfCheck.ts`](packages/agents/src/lib/selfCheck.ts) | The reminder itself. Section 0 = new logic. |
| [`packages/ai/src/lib/types.ts`](packages/ai/src/lib/types.ts) | `PostRoundReminderContext` shape. |
| [`packages/ai/src/lib/agent.ts`](packages/ai/src/lib/agent.ts) | Search for `argsByCallId` — two call sites. |
| [`apps/backend/src/routes/chat.ts:347`](apps/backend/src/routes/chat.ts:347) | Where `freshSelfCheckState()` is called per-turn. |
| [`packages/agents/src/lib/constants.ts`](packages/agents/src/lib/constants.ts) | `TOOL_NAME_TOKENS` reference. |
| [`apps/mcp-aftereffects/src/index.ts`](apps/mcp-aftereffects/src/index.ts) | Where typed AE tools are defined (Part B output). |
| [`apps/backend/src/prompts/library.ts`](apps/backend/src/prompts/library.ts) | System prompt sections; `aeBridgeContract` is the per-app one. |

---

## Useful commands

```bash
# Build everything
pnpm nx run-many -t build

# Build just this feature's scope
pnpm nx run-many -t build -p @pipefx/ai @pipefx/agents @pipefx/backend

# Run backend with verbose AI logs
PIPEFX_AI_LOG=debug pnpm nx serve @pipefx/backend

# Tail the reminder firing in production-ish use
pnpm nx serve @pipefx/backend 2>&1 | grep -E "(identical args|tool batch|tool-call loop)"
```

---

## Reference links

- Upstream pattern source: https://github.com/yasasbanukaofficial/claude-code
  (`core/selfCheck.ts` equivalent — ours is leaner; they track per-tool counts,
  we track per-fingerprint.)
- MCP spec — tool result / `isError` flag: https://modelcontextprotocol.io/specification
- PipeFX architecture: [`CLAUDE.md`](CLAUDE.md)
- AE handoff from prior session: [`HANDOFF_AE_AGENT.md`](HANDOFF_AE_AGENT.md)
