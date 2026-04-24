# PipeFX — AE Agent Session Handoff

Context for the next chat. Read this first, then `CLAUDE.md` for architecture.
(Note: a separate `HANDOFF.md` exists for the user/credits system — unrelated.)

## Strategic Goal

Build **"Claude Code, but for After Effects"** — a desktop AI agent that drives AE (and eventually Premiere, Blender, Resolve) through MCP connectors. Reference implementation being mined for patterns: https://github.com/yasasbanukaofficial/claude-code (a Claude-Code replica with cached prompt sections, planning tools, multi-agent coordinator).

The `@pipefx/agents` package already ports the core orchestration primitives: `EnterPlanMode`, `ExitPlanMode`, `TodoWrite`, `Task*`. Keep that — don't re-import their coordinator.

## What Was Done This Session

Fixed a tool-call loop (GPT-5.4 re-proposing the same plan forever after approval):

1. **[packages/ai/src/lib/agent.ts](packages/ai/src/lib/agent.ts)** — added to BOTH the streaming and non-streaming tool-call loops:
   - `MAX_TOOL_ROUNDS = 25` hard cap.
   - Mid-turn strip of `EnterPlanMode` from the tool list once a result content matches `"Plan approved. Proceed with execution."` or `"A plan has ALREADY been approved"` (see `maybeStripEnterPlanMode`).

2. **[apps/backend/src/routes/chat.ts:284](apps/backend/src/routes/chat.ts:284)** — AE preflight now calls `registry.getAllTools()` before `callTool('bridge-health', {})`. Previously the first request of a process threw `Unknown tool "bridge-h…"`, silently skipped `excludedTools.push('bridge-health')`, and left the tool visible — causing re-probes after every step.

Typecheck passes: `pnpm nx run-many -t typecheck -p @pipefx/ai @pipefx/backend`.

Working tree still has other in-progress edits from before this session (see `git status`) — not my changes.

## Current Failure (Next Thing To Fix)

Switched from GPT-5.4 to Gemini 3.1-pro-preview. Loop is gone, but a new bug is visible in the log: **the AE bridge tool contract is async-leaky.**

After `run-script` writes `ae_command.json`, the handler returns immediately with:
```json
{"status":"waiting","message":"Waiting for new result from After Effects...","timestamp":"..."}
```
The agent sees `ok=true`, treats it as done, calls `get-results` which shows *stale* state, concludes "nothing happened", and **re-creates the composition from scratch**. In the log you can see `Animated Circles Comp` created three times (ids 109, 133, and again).

This is NOT a prompting problem — the model is doing the right thing given what the tool told it. No system prompt will paper over it reliably.

## Priority Order

1. **Fix the bridge async contract.** `run-script` (and `create-*` / `setLayer*` / `apply-effect*`) must not return until AE has produced a terminal result (or a real timeout fires). Either poll internally or make the tool wait on the result-file mtime for the specific command.
   - Bridge file paths: `C:\Users\PC\Documents\ae-mcp-bridge\ae_command.json` (in), `ae_mcp_result.json` (out).
   - `bridge-health` already does a blocking wait pattern — look there for prior art.
   - Check the async-policy wrapper in `@pipefx/connectors` `packages/connectors/src/lib/domain/registry.ts` (search for `asyncPolicy`, `skipTools`) — there may already be a polling layer that just isn't configured for these tools.

2. **Port the cached prompt-sections architecture** from the reference repo (`src/constants/systemPromptSections.ts`, `prompts.ts`, `system.ts`). Key functions: `systemPromptSection()`, `resolveSystemPromptSections()`, `clearSystemPromptSections()`. Gives clean seams to compose `<base-agent>` + `<planning-discipline>` + `<activeApp=aftereffects>` per turn with per-section caching.

3. **Swap the domain layer.** Keep the reference repo's "Doing tasks / Tone / Executing actions with care" sections nearly verbatim. Replace bash/git/file sections with AE-specific ones: the bridge contract, the `run-script` whitelist (already in `apps/backend/src/routes/chat.ts` `bridgePreflightNote`), the composition/layer/effect model, EnterPlanMode+TodoWrite obligation for multi-step AE tasks.

4. **Secondary issue:** Gemini skipped `EnterPlanMode`/`TodoWrite` entirely despite them being available (log shows `planningPresent=[...]`). This is a prompt issue — blocked behind (2)/(3).

## Key Files

- **Architecture overview:** `CLAUDE.md`
- **Agent loop (provider-agnostic):** [packages/ai/src/lib/agent.ts](packages/ai/src/lib/agent.ts)
- **Chat HTTP route + preflight + excludedTools logic:** [apps/backend/src/routes/chat.ts](apps/backend/src/routes/chat.ts)
- **Plan-mode handler (anti-loop guard):** [packages/agents/src/lib/tools/enterPlanMode.ts](packages/agents/src/lib/tools/enterPlanMode.ts)
- **Tool registry + `callTool` + asyncPolicy hook:** [packages/mcp/src/lib/registry.ts](packages/mcp/src/lib/registry.ts)
- **AE MCP server (Python):** `apps/mcp-premiere/` *(actually the AE bridge, despite the name — verify before assuming)*
- **Provider adapters:** `packages/providers/` (Gemini / OpenAI / Anthropic)

## Repro / Verification

After changes, always:
```bash
pnpm nx run-many -t build lint typecheck
```

## Gotchas

- User has ₪100 prepaid Gemini credit (Postpay, threshold ₪200) — safe to test without charges.
- User-facing model IDs live in [packages/ai/src/lib/agent.ts:49](packages/ai/src/lib/agent.ts:49) `resolveProvider`.
- GPT-5.4 was specifically pathological about re-proposing plans; the `MAX_TOOL_ROUNDS` + mid-turn `EnterPlanMode` strip are the guards. Don't remove them even if the prompt system improves.
- `PIPEFX_AI_LOG=debug` surfaces every tool call / result in stdout — essential when debugging loops.
- User communicates in English with occasional typos; sometimes Hebrew. Respond in English by default.
