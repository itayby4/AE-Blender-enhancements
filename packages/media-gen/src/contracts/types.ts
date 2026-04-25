// ── @pipefx/media-gen — wire types ───────────────────────────────────────
// Request / response shapes shared between the desktop dashboards
// (image-gen, video-gen, node-system) and the backend route mounted by
// `@pipefx/media-gen/backend`. Keeping these in one place is the whole
// point of the package: previously the dashboards and the route both
// hand-rolled inline `JSON.stringify({...})` payloads, so a new
// provider option meant editing two files in lockstep and hoping. With
// these contracts a TS error fires the moment they drift.
//
// Why a single MediaGenRequest instead of one-per-modality:
//   - `model` selects the modality at runtime (image vs video vs sound)
//   - the underlying `media-providers` registry already keys by model id,
//     so the route just hands the request off to whichever provider
//     matches — no per-modality discriminant needed at the wire level.
//   - kept loose (all option fields optional) so future providers can
//     introduce new params without breaking the contract. The provider
//     itself validates what it cares about.

/**
 * Body posted to `POST /api/ai-models`. Exactly one provider modality
 * (image / video / sound) handles the call, picked by `model`.
 *
 * All non-`model`/`prompt` fields are optional: image providers ignore
 * `duration` etc., sound providers ignore `aspectRatio`, and so on.
 * Don't add validation here — the provider implementations in
 * `@pipefx/media-providers` are the source of truth for which fields
 * each model honors.
 */
export interface MediaGenRequest {
  /** Provider id registered with `@pipefx/media-providers` (e.g. `kling`,
   *  `gemini-image`, `seeddream45`, `elevenlabs-tts`). */
  model: string;
  /** Text prompt. Required by every provider. */
  prompt: string;

  // ── Image / Video shared ──
  /** Reference image as data URL or remote URL. Image providers treat as
   *  source/edit input; video providers treat as the first frame. */
  imageRef?: string;
  /** Last-frame reference, used by some video providers to anchor the
   *  end of a clip. Translates to `imageTailRef` on the provider side. */
  lastFrameRef?: string;
  /** Multi-image input (e.g. composition references). Image providers
   *  may use this in place of `imageRef`. */
  imageRefs?: string[];

  // ── Video-specific ──
  /** Clip length in seconds (provider-dependent units; some take "5"
   *  others "5s"). Validated by the provider. */
  duration?: string;
  /** Output resolution token (e.g. `720p`, `1080p`, `2K`). Provider
   *  decides which tokens it accepts. */
  resolution?: string;
  /** Aspect ratio token (e.g. `16:9`, `9:16`, `1:1`). */
  aspectRatio?: string;

  // ── Sound-specific ──
  /** ElevenLabs voice id; falls back to provider default. */
  voiceId?: string;
  /** Audio reference for speech-to-speech / isolation flows. Falls back
   *  to `imageRef` for legacy callers that reused the image-ref slot. */
  audioRef?: string;
}

/**
 * Provider response envelope. The provider returns the asset URL (data
 * URL for inline images, https URL for hosted videos), an opaque task
 * id for traceability, and a status string. `type` is set by image
 * providers so the desktop knows whether to render `<img>` or `<video>`.
 */
export interface MediaGenResponse {
  id: string;
  status: string;
  url?: string;
  type?: string;
}

/**
 * Body posted to `POST /api/save-render`. The desktop calls this after
 * a successful generation to persist the asset to disk under
 * `~/Desktop/RENDERS/`. Separate route from generation so the desktop
 * can also save assets it didn't generate (drag-dropped refs, etc.)
 * without going back through the providers.
 */
export interface SaveRenderRequest {
  /** Data URL or http(s) URL to save. */
  url: string;
  /** `image` (saved as .png) or `video` (saved as .mp4). Defaults to
   *  `video` for backwards compat with callers that omit it. */
  type?: 'image' | 'video';
  /** Provider id used to generate the asset; included in the filename
   *  and in the sidecar metadata. */
  model?: string;
  /** Original prompt; written to the sidecar metadata only. */
  prompt?: string;
}

export interface SaveRenderResponse {
  saved: true;
  filePath: string;
  filename: string;
}
