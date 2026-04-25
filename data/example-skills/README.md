# PipeFX example skills

Three example `.pfxskill` bundles that demonstrate the manifest skill system end-to-end. Each wraps an existing local workflow (`auto_generate_subtitles`, `sync_external_audio`, `run_autopod`) with a structured manifest so users can drive it through the Skill Library form instead of typing into chat.

## Layout

```
data/example-skills/
├── manifests/                  source manifests (committed, hand-edited)
│   ├── auto-subtitles.json
│   ├── sync-external-audio.json
│   └── autopod.json
├── dist/                       built .pfxskill bundles (committed for ergonomics)
│   ├── pipefx.auto-subtitles.pfxskill
│   ├── pipefx.sync-external-audio.pfxskill
│   └── pipefx.autopod.pfxskill
├── build.mjs                   packager
└── README.md
```

## The skills

| Manifest | What it does | Required local tool |
|---|---|---|
| `pipefx.auto-subtitles` | Extracts timeline audio, transcribes via Whisper, optionally translates with Gemini, and writes either an SRT track or animated Fusion macros. | `auto_generate_subtitles` |
| `pipefx.sync-external-audio` | FFT cross-correlates external audio (boom, Zoom, lav) against video sources and creates a new timeline with synced audio under each clip. | `sync_external_audio` |
| `pipefx.autopod` | Discovers cameras + mics in the active timeline, optionally uses Gemini vision for AI mic-to-camera mapping, then cuts the multicam edit locally with VAD. | `run_autopod` |

All three light up automatically once DaVinci Resolve (or, for AutoPod, Premiere Pro) is connected — the capability matcher subscribes to `mcp.tools.changed` and the workflow tools register at backend boot.

## Building

```bash
pnpm nx build @pipefx/skills
node data/example-skills/build.mjs
```

The script:
1. Reads each `manifests/*.json`
2. Validates the manifest via `parseManifestOrThrow` from `@pipefx/skills/domain`
3. Packages it via `exportSkillBundle` from `@pipefx/skills/marketplace`
4. Writes `dist/<skill-id>.pfxskill`

## Installing

Two paths:

**Manual (UI)** — open the Skill Library page in PipeFX Desktop, click "Import .pfxskill", pick a file from `data/example-skills/dist/`, confirm in the consent dialog.

**Automatic (preinstall)** — the backend autoload sees the bundles in `data/example-skills/dist/` on first boot and installs them silently if not already present. Re-running after install is a no-op (the SkillStore is keyed by skill id).

## Why unsigned

The bundles ship without an Ed25519 signature on purpose. Shipping a stable private key in the repo would defeat the point of signing — anyone could re-sign their own tampered manifest with the same key and the install consent dialog would still show the green "signed" badge. Honest demo: these are unsigned examples, the consent dialog correctly shows the amber "unsigned" warning, and real authors generate their own keypair via the (upcoming) Authoring UI.

## Editing

To modify a skill, edit the manifest under `manifests/` and rerun `node build.mjs`. The dev server reads bundles at backend boot, so restart the backend to pick up changes (or uninstall + reimport via the UI).
