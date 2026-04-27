---
id: audio-sync
name: A/V Sync Studio
description: Sync external audio and video recordings to your edited Resolve timeline. Exports the timeline, FFT cross-correlates each external source against the timeline's scratch audio, injects the offsets, and re-imports the synced timeline.
category: post-production
icon: AudioWaveform
triggers: ['/audio-sync', 'audio-sync', 'avsync', 'sync-audio', 'multicam-sync']
requires:
  tools:
    - name: resolve_export_xml
      connector: ['resolve']
    - name: resolve_import_xml
      connector: ['resolve']
ui: bundled
bundledUi:
  entry: audio-sync/ui/index.tsx
  mount: full-screen
version: 0.0.1
---

# A/V Sync Studio

This is a `component`-mode skill. The runner emits a mount instruction and
the desktop shell hosts the bundled React UI at `audio-sync/ui/index.tsx`
(registered by `@pipefx/skills-builtin`).

The component drives the workflow itself by calling
`POST /api/audio-sync/run` on the local backend, which orchestrates the
`resolve_export_xml` → discovery → FFT cross-correlation → offset
injection → `resolve_import_xml` pipeline against the live Resolve
connector.

This Markdown body is documentation only — `component`-mode runs do not
forward it to the brain.
