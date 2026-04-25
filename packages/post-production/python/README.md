# pipefx-postpro (Python engines)

Python pipeline engines that back the post-production workflows in
`@pipefx/post-production`. Lifted from the legacy `stools/` directory at
the repo root in Phase 9.2 of the refactor.

## Layout

```
packages/post-production/python/
├── pyproject.toml            ← installable as `pipefx-postpro`
├── requirements.txt          ← runtime deps (numpy, webrtcvad, google-genai)
├── README.md
└── pipefx_postpro/
    ├── __init__.py
    ├── audio_sync.py         FFT cross-correlation: external mic → camera offset
    ├── autopod.py            VAD-driven multicam-cut decisions
    ├── xml_inject_sync.py    Inject synced media into FCP7 XML
    ├── xml_tools.py          sync_fcpxml_with_external_audio (FCPXML + audio)
    └── cli.py                Standalone CLI for ad-hoc audio-sync runs
```

## Why a sibling `python/` directory?

The arc plan originally suggested `packages/post-production/src/engines/`,
mixing Python under the TypeScript `src/`. We deviated for two reasons:

1. **Tooling clarity.** Nx walks `src/` looking for TS / TSX. A `.py`
   under `src/` is invisible to Nx but still appears in IDE search
   indices for the package, which is confusing.
2. **Python convention.** `pyproject.toml` expects to live at the root of
   the Python project so `pip install -e .` (and editor venv discovery)
   works without flags. Burying it under `src/` forces every Python
   tool to take an explicit path argument.

`packages/post-production/python/` keeps both languages comfortable.

## Running

The TypeScript orchestrators in `packages/post-production/src/workflows/`
invoke the engines via subprocess (post-9.3, when they moved into this
package). They locate this directory via
`resolvePythonEngineDir(workspaceRoot)` from `@pipefx/post-production`
and either:

- Run a script directly: `python <dir>/autopod.py --xml ... --out ...`
- `sys.path`-inject and import: `import sys; sys.path.insert(0, '<dir>'); from audio_sync import find_audio_offset`

The second pattern exists because some entry points are pure functions
without a CLI wrapper. The engines support both modes — installed-package
imports (`from pipefx_postpro.audio_sync import find_audio_offset`) work
too once the package is `pip install -e .`'d.

## Cross-package imports

Only `autopod.py` reaches across packages: it imports `vad.py` from
`packages/video-kit/src/vad/` via `sys.path` injection. Video-kit's
Python utilities aren't a distributable package — they're sibling files
imported by name — so the relative offset is fixed:

```
pipefx_postpro/ → python/ → post-production/ → packages/ → repo root
```

Four `..` segments to reach `packages/`, then down into `video-kit/src/vad/`.

(Phase 9.5 moved `xml_tools.py` from `video-kit/fcpxml/` into this
package, removing the second cross-package hop that `cli.py` previously
needed.)

## Installing

For development:

```bash
cd packages/post-production/python
pip install -e .
```

Or just install the requirements without packaging:

```bash
pip install -r packages/post-production/python/requirements.txt
```

Both work. The orchestrators don't require the package to be installed
— they invoke scripts by absolute path and `sys.path`-inject.
