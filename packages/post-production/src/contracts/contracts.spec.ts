// ── @pipefx/post-production/contracts — smoke tests ──────────────────────
// Light coverage that confirms the contract types are usable end-to-end:
// a dummy WorkflowDescriptor compiles, the quota-checker shape works,
// and the typed errors round-trip through `instanceof`.
//
// We deliberately don't go deep here — the contract layer is intentionally
// shallow; the real tests live in each workflow's folder once the
// implementations land in 9.3+.

import { describe, expect, it } from 'vitest';

import {
  WorkflowEngineError,
  WorkflowQuotaError,
  type QuotaChecker,
  type WorkflowContext,
  type WorkflowDescriptor,
  type WorkflowResult,
} from './index.js';

describe('WorkflowDescriptor', () => {
  it('accepts a minimal descriptor and produces a typed result', async () => {
    interface DummyInput {
      value: number;
    }
    interface DummyOutput {
      doubled: number;
    }

    const descriptor: WorkflowDescriptor<DummyInput, WorkflowResult<DummyOutput>> = {
      id: 'dummy',
      name: 'Dummy',
      description: 'Doubles a number for the test.',
      metered: false,
      async execute(input, ctx) {
        ctx.onProgress?.({ runId: ctx.runId, step: 'doubling' });
        return {
          runId: ctx.runId,
          status: 'succeeded',
          data: { doubled: input.value * 2 },
          artifacts: [],
          durationMs: 1,
        };
      },
    };

    const ctx: WorkflowContext = { outputDir: '/tmp', runId: 'r-1' };
    const result = await descriptor.execute({ value: 21 }, ctx);
    expect(result.status).toBe('succeeded');
    expect(result.data.doubled).toBe(42);
  });
});

describe('quota seam', () => {
  it('lets the gate allow with an optional hold id', async () => {
    const gate: QuotaChecker = async (req) => {
      expect(req.capability).toBe('llm.gemini');
      return { allowed: true, holdId: 'hold-7' };
    };
    const decision = await gate({ capability: 'llm.gemini', estimatedUnits: 100 });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      // Type-narrowing — `holdId` only exists on the allowed branch.
      expect(decision.holdId).toBe('hold-7');
    }
  });

  it('lets the gate deny with a reason', async () => {
    const gate: QuotaChecker = async () => ({
      allowed: false,
      reason: 'insufficient credits',
    });
    const decision = await gate({ capability: 'image.gen.seeddream' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('insufficient credits');
    }
  });
});

describe('error types', () => {
  it('WorkflowQuotaError narrows via instanceof and exposes its capability', () => {
    const err = new WorkflowQuotaError(
      'denied',
      'video.gen.kling',
      'insufficient credits'
    );
    expect(err).toBeInstanceOf(WorkflowQuotaError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('quota_denied');
    expect(err.capability).toBe('video.gen.kling');
    expect(err.reason).toBe('insufficient credits');
  });

  it('WorkflowEngineError carries exit code + stderr', () => {
    const err = new WorkflowEngineError(
      'autopod failed',
      'autopod',
      1,
      'ImportError: foo'
    );
    expect(err.code).toBe('engine_failed');
    expect(err.engine).toBe('autopod');
    expect(err.exitCode).toBe(1);
    expect(err.stderr).toContain('ImportError');
  });
});
