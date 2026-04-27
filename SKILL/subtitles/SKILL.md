---
id: subtitles
name: Subtitle Studio
description: Auto-generate and translate subtitles from your DaVinci Resolve timeline audio. Renders timeline audio, runs VAD plus Whisper, optionally translates, and imports a subtitle track back into the timeline.
category: post-production
icon: Subtitles
triggers: ['/subtitles', 'subtitle', 'subtitles', 'caption', 'captions']
requires:
  tools:
    - name: render_timeline_audio
      connector: ['resolve']
    - name: add_timeline_subtitle
      connector: ['resolve']
ui: bundled
bundledUi:
  entry: subtitles/ui/index.tsx
  mount: full-screen
version: 0.0.1
---

# Subtitle Studio

This is a `component`-mode skill. The runner emits a mount instruction
and the desktop shell hosts the bundled React UI at
`subtitles/ui/index.tsx` (registered by `@pipefx/skills-builtin`).

The component drives the workflow itself by calling
`POST /api/subtitles/generate` on the local backend, which orchestrates
the `render_timeline_audio` → VAD → Whisper transcription → optional
translation → `add_timeline_subtitle` pipeline against the live Resolve
connector.

This Markdown body is documentation only — `component`-mode runs do not
forward it to the brain.
