# pipefx_postpro — Python pipeline engines for the post-production package.
#
# Modules:
#   audio_sync       — FFT cross-correlation between camera audio + external
#                      mics; returns the offset in seconds.
#   autopod          — VAD-driven multicam-cut decisions from per-camera
#                      audio activity.
#   xml_inject_sync  — Injects synced external audio/video into FCP7 XML.
#   cli              — Standalone CLI for ad-hoc audio-sync runs (legacy
#                      entry point preserved from stools/main.py).
#
# Phase 9.2 lifts these out of the repo-root `stools/` directory. The TS
# orchestrators in `apps/backend/src/workflows/` reach into this package
# via the path returned by `resolvePythonEngineDir(workspaceRoot)` from
# `@pipefx/post-production` (see Phase 9.3 for the orchestrator move).
