# pipefx_postpro — Python pipeline engines for the post-production package.
#
# Modules:
#   audio_sync       — FFT cross-correlation between camera audio + external
#                      mics; returns the offset in seconds.
#   autopod          — VAD-driven multicam-cut decisions from per-camera
#                      audio activity.
#   xml_inject_sync  — Injects synced external audio/video into FCP7 XML.
#   xml_tools        — sync_fcpxml_with_external_audio (FCPXML + audio
#                      correlation). Moved here from video-kit/fcpxml/ in
#                      Phase 9.5 — it's a workflow operation, not a
#                      generic FCPXML primitive.
#   cli              — Standalone CLI for ad-hoc audio-sync runs (legacy
#                      entry point preserved from stools/main.py).
#
# Phase 9.2 lifted these out of the repo-root `stools/` directory. The
# in-package TS orchestrators at `packages/post-production/src/workflows/`
# (post-9.3) reach into this package via the path returned by
# `resolvePythonEngineDir(workspaceRoot)` from `@pipefx/post-production`.
