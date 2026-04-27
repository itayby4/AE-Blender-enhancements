---
id: autopod
name: AutoPod Studio
description: Automated multi-camera podcast/interview editing. Discovers cameras and audio sources from the Resolve timeline, runs voice-activity detection per microphone, maps speakers to cameras, and writes the cut sequence back into the timeline.
category: post-production
icon: Mic
triggers: ['/autopod', 'autopod', 'multicam', 'podcast', 'interview-cut']
requires:
  tools:
    - name: resolve_export_xml
      connector: ['resolve']
    - name: resolve_import_xml
      connector: ['resolve']
ui: bundled
bundledUi:
  entry: autopod/ui/index.tsx
  mount: full-screen
version: 0.0.1
---

# AutoPod Studio

This is a `component`-mode skill. The runner emits a mount instruction
and the desktop shell hosts the bundled React UI at `autopod/ui/index.tsx`
(registered by `@pipefx/skills-builtin`).

The component drives the workflow itself by calling
`POST /api/autopod/discover` and `POST /api/autopod/run` on the local
backend, which orchestrates the export → VAD analysis → speaker mapping →
multicam cut → import pipeline against the live Resolve connector.

The backend workflow also supports a `premiere` `app_target`, but the
Premiere MCP is a placeholder this phase, so the bundled UI hard-pins
Resolve. When a real Premiere connector lands we'll add an in-component
target picker and broaden `requires.tools[]` accordingly.

This Markdown body is documentation only — `component`-mode runs do not
forward it to the brain.
