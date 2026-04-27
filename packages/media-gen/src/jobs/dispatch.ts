// ── @pipefx/media-gen/jobs — provider dispatch ──────────────────────────
// Picks the right provider for a `MediaGenRequest` and forwards the call.
// Lifted from the inline `if (videoProvider) … else if (imageProvider)`
// chain that previously lived in `apps/backend/src/api/ai-models/router.ts`.
// Keeping it in a function (rather than baking it into the route handler)
// means non-HTTP callers — sub-agents, future MCP tools, batch scripts —
// can dispatch through the same code path.
//
// Lookup order matches the legacy router: video → image → sound. The
// order matters when a model id is registered in more than one tier
// (rare, but cheap to preserve).

import { providerRegistry } from '@pipefx/media-providers';

import type { MediaGenRequest, MediaGenResponse } from '../contracts/types.js';

/** Thrown when no registered provider matches `model`. The caller turns
 *  this into a 400 — the request is malformed (unknown model), not a
 *  provider failure. */
export class UnknownModelError extends Error {
  override readonly name = 'UnknownModelError';
  constructor(public readonly model: string) {
    super(`Unknown model: ${model}`);
  }
}

/**
 * Dispatch a media-gen request to the matching provider. Returns the
 * provider's raw response envelope — no wrapping, no normalization —
 * because the desktop already understands the provider response shape
 * from the legacy route.
 */
export async function dispatchMediaGen(
  req: MediaGenRequest
): Promise<MediaGenResponse> {
  const {
    model,
    prompt,
    imageRef,
    lastFrameRef,
    imageRefs,
    duration,
    resolution,
    aspectRatio,
    quality,
    background,
    outputFormat,
    outputCompression,
    voiceId,
    audioRef,
  } = req;

  // ── Video first ──
  // Some providers (Kling) take both head + tail frames; the wire field
  // is `lastFrameRef` but the provider option is `imageTailRef`. We do
  // the rename here so the contract stays close to dashboard vocab.
  const videoProvider = providerRegistry.getVideoProvider(model);
  if (videoProvider) {
    return videoProvider.generate(prompt, {
      imageRef,
      imageTailRef: lastFrameRef,
      duration,
      resolution,
      aspectRatio,
    });
  }

  // ── Image ──
  // Single-ref callers send `imageRef`; multi-ref callers send
  // `imageRefs`. Promote single → array so providers don't need both
  // code paths.
  const imageProvider = providerRegistry.getImageProvider(model);
  if (imageProvider) {
    return imageProvider.generate(prompt, {
      imageRefs: imageRefs ?? (imageRef ? [imageRef] : undefined),
      aspectRatio,
      quality,
      background,
      outputFormat,
      outputCompression,
    });
  }

  // ── Sound ──
  // Legacy node-system callers reused `imageRef` as the audio ref slot
  // (back when ai-models only knew image/video). Honor that fallback so
  // existing pipelines keep working without dashboard changes.
  const soundProvider = providerRegistry.getSoundProvider(model);
  if (soundProvider) {
    return soundProvider.generate(prompt, {
      voiceId,
      audioRef: audioRef ?? imageRef,
    });
  }

  throw new UnknownModelError(model);
}
