---
id: _author-guide
name: Skill Authoring Guide
description: Documents the SKILL.md format end-to-end and asks the brain to scaffold a new skill for you. Covers all three execution modes, every connector + tool, and where files belong on disk.
category: dev
icon: BookOpen
triggers: ['/new-skill', '/author-skill', 'author skill', 'create skill', 'scaffold skill']
inputs:
  - id: idea
    type: string
    label: What should the skill do?
    description: One sentence. Example — "snap timeline markers to detected beat onsets in the loaded audio".
    required: true
  - id: mode
    type: enum
    label: Execution mode
    description: prompt = LLM body. script = subprocess. component = bundled React UI (built-ins only this phase).
    required: true
    options: ['prompt', 'script']
    default: prompt
ui: inline
version: 0.0.1
---

# Skill Authoring Guide

You are helping the user scaffold a new PipeFX skill. Read this whole
body, ask the user any clarifying questions you need, then **call the
`create_skill` tool** with the complete SKILL.md text. The tool parses
your input, refuses bad frontmatter, and lands the skill on disk so it
shows up in the user's library immediately. **Do NOT just emit the
SKILL.md as a chat message — without the tool call nothing gets saved.**

Use the user's idea (`{{idea}}`) and chosen mode (`{{mode}}`) as the
seed. Pick a short kebab-case `id` (e.g. `cut-to-beat`, `import-srt`)
and a human-readable `name`. If the `id` collides with an existing
skill, the tool returns an error — pick a different one and call again.

## How to invoke `create_skill`

The tool takes one argument:

```json
{
  "skillMd": "---\nid: cut-to-beat\nname: Cut to Beat\n…\n---\n\n# Body…\n"
}
```

The full SKILL.md document (frontmatter + body) goes into `skillMd` as
a single UTF-8 string. The tool parses it via the v2 frontmatter schema
and persists to `<userData>/SKILL/<id>/SKILL.md`. On success the user
gets a "Saved {name}" card in chat with an "Open in editor" button.

If the tool returns an error (invalid frontmatter, duplicate id, etc.),
read the message, fix the SKILL.md, and call the tool again. Don't
apologize at length — just iterate.

**Frontmatter schema rules — common mistakes the AI tends to make:**

- Field is `triggers: ['…']` (array of strings), NOT `triggerCommand`
- There is no `hasUI` field. Mode is implied: `ui: bundled` → component
  mode (RESERVED — don't use), `scripts.entry` → script mode, neither
  → prompt mode.
- The body is plain Markdown. Do NOT embed raw HTML, `<form>`, `<input
  onclick>`, or `execute(...)` calls. Inputs are declared in the
  `inputs:` frontmatter array; the desktop renders the form.
- `category` is a free-form string (`creative`, `workflow`, `dev`,
  `utility`, etc.). Pick the closest match.
- `icon` is a `lucide-react` icon name in PascalCase (`Subtitles`,
  `Mic`, `Wand`, `BookOpen`). Optional.

---

## 1. Where skills live

PipeFX walks **two roots** at boot and merges by `id`:

| Root                       | Source            | Writable? | Use for                          |
| -------------------------- | ----------------- | --------- | -------------------------------- |
| `<repo>/SKILL/`            | `builtin`         | No        | Skills shipped with the desktop  |
| `<userData>/SKILL/`        | `local` / `bundle`| Yes       | User-authored / installed skills |

`<userData>` resolves via Tauri's `appDataDir()`. On Windows that's
`%APPDATA%\pipefx\SKILL\`. Each skill lives in its own folder named
after `id`. Drop the folder, restart the app (or trigger a reindex),
and the skill appears in the library.

A skill folder looks like this:

```
<userData>/SKILL/cut-to-beat/
  SKILL.md           ← required, frontmatter + body
  scripts/           ← optional, for `script` mode
    run.py
  ui/                ← built-ins only (component mode)
    index.tsx
  assets/            ← optional, free-form
```

---

## 2. Frontmatter shape

The frontmatter is a small YAML block delimited by `---` lines. Every
field below maps onto `SkillFrontmatter` in
`@pipefx/skills/contracts`.

```yaml
id: cut-to-beat               # required, kebab/dot-case, /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i
name: Cut to Beat             # required, human-readable
description: Snap timeline markers to detected beat onsets.
category: post-production     # optional, free-form library group
icon: Music                   # optional, lucide-react icon name
triggers: ['/cut-to-beat', 'beat', 'snap']  # optional, palette match terms
version: 0.0.1                # optional

inputs:                       # optional, drives the inline auto-form
  - id: track
    type: clip-ref            # string | number | boolean | enum | clip-ref | file
    label: Audio Track
    required: true
  - id: sensitivity
    type: number
    label: Sensitivity
    default: 0.6

requires:                     # optional, gates runnability + UI badging
  tools:
    - get_timeline_info       # bare string = match ANY connector exposing it
    - name: add_timeline_marker
      connector: ['resolve', 'premiere']  # restrict to these connector ids
  optional:
    - render_clip             # nice-to-have; matcher reports when present

ui: inline                    # inline (default) | bundled
bundledUi:                    # required iff ui: bundled — built-ins only
  entry: cut-to-beat/ui/index.tsx
  mount: full-screen          # full-screen | sidebar | modal

scripts:                      # optional, presence flips mode → script
  entry: scripts/run.py
  interpreter: python3        # optional override; inferred from extension
```

Body (everything after the closing `---`) is opaque Markdown — used
verbatim by `prompt` mode, ignored by `script` and `component` (where
it serves as on-disk documentation).

---

## 3. The three execution modes

`resolveExecutionMode(frontmatter)` picks the mode by precedence:
**component > script > prompt**.

### prompt — LLM-driven body

Default. The runner builds a chat turn from the body, substitutes any
`{{input}}` references against the form values, and asks the brain to
respond. Best for skills that wrap a recipe or playbook.

```yaml
---
id: explain-timeline
name: Explain Timeline
description: Summarises the loaded timeline in plain English.
requires:
  tools: [get_timeline_info, list_markers]
ui: inline
inputs:
  - id: depth
    type: enum
    label: Detail level
    options: ['short', 'detailed']
    default: short
---
# Explain Timeline

Call `get_timeline_info` and `list_markers`. Produce a `{{depth}}`
summary covering duration, marker count, and any unusual gaps.
```

### script — subprocess

Frontmatter declares `scripts.entry`. The runner spawns the script with
JSON on stdin (form values + skill metadata) and streams stdout
back line-by-line as the run output. Default 5-minute timeout.

Interpreter inference: `.py` → `python3`, `.mjs` / `.js` → `node`,
`.sh` → `bash`. Override via `scripts.interpreter`.

```yaml
---
id: probe-media
name: Probe Media
description: Runs ffprobe on a media file and prints a JSON report.
ui: inline
inputs:
  - id: file
    type: file
    label: Media file
    required: true
scripts:
  entry: scripts/probe.py
---
```

```python
# scripts/probe.py — receives {"inputs": {...}} on stdin
import json, subprocess, sys
req = json.loads(sys.stdin.read())
path = req["inputs"]["file"]
print(subprocess.check_output(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path]).decode())
```

### component — bundled React UI (built-ins this phase)

`ui: bundled` flips the mode to `component`. The runner emits a
`SkillMountInstruction` carrying the `bundledUi.entry` string; the
desktop host looks that string up in a registry seeded by
`@pipefx/skills-builtin` and mounts the matching React module.

User-authored bundled skills are out of scope this phase — they require
workspace source + a build step.

---

## 4. Tool requirements (`requires`)

Every entry in `requires.tools[]` is either:

- **a bare string** (`render_clip`) — satisfied by ANY connector
  exposing that tool name. Use this when the skill is host-agnostic.
- **`{ name, connector?: string[] }`** — restrict to specific
  connectors. Use when a tool name collides across hosts or the skill
  only knows how to drive one of them.

`requires.optional[]` advertises tools the skill *can* take advantage
of when present — they don't gate runnability. Prompt-mode runs
receive the live optional list as a system-prompt hint.

If any required entry is unsatisfied, the library card greys out and
the run dialog refuses to open. Fix by starting the matching connector
or relaxing the requirement.

---

## 5. Connectors and the tools they expose

These are the connector IDs registered in
`apps/backend/src/config.ts`. The tool surface for each is **not**
hard-coded into PipeFX — it's whatever the underlying MCP server lists
at runtime. The library refreshes capability matches on every
`mcp.tools.changed` event, so this list is best-effort.

| Connector ID    | Host                      | Status        |
| --------------- | ------------------------- | ------------- |
| `resolve`       | DaVinci Resolve           | Functional    |
| `premiere`      | Adobe Premiere Pro        | Stub (placeholder MCP) |
| `aftereffects`  | Adobe After Effects       | Functional, async-policy polling |
| `blender`       | Blender                   | Stub (placeholder MCP) |
| `ableton`       | Ableton Live              | Stub (placeholder MCP) |

To see the live tool list for a connector, check the connector status
panel or run a `/tools` introspection turn in chat. Don't hard-code
tool inventories — the connector contract is "whatever the MCP server
exposes at this moment".

---

## 6. Where to put files inside a skill folder

| Folder      | Used by mode | Purpose                                              |
| ----------- | ------------ | ---------------------------------------------------- |
| `scripts/`  | `script`     | Subprocess entry + helpers. POSIX paths in `entry`.  |
| `ui/`       | `component`  | React module exporting the default component. Built-ins only. |
| `assets/`   | any          | Free-form static files. Reference via relative paths from scripts; not auto-served to prompt mode. |

The loader rejects `..`, absolute paths, and backslashes anywhere a
relative POSIX path is expected.

---

## 7. Testing a skill locally

1. Drop the folder into `<userData>/SKILL/<id>/`.
2. Restart the desktop OR trigger a library reindex (Settings → Skills
   → Reload, or relaunch).
3. Open the library — the new skill should appear. If it's greyed out,
   hover the badge to see which `requires.tools[]` entry is missing.
4. Click **Run** for inline-mode skills, or `/<trigger>` from the
   command palette.

For `script`-mode skills, the run dialog shows live stdout. Errors,
non-zero exit codes, and the 5-minute timeout all surface as failed
runs in the run history.

---

## 8. Ask the user, then scaffold

Now: confirm the `id` you'll use, the `requires.tools[]` minimum, and
any inputs the skill needs. Then write the files. Print the install
path you used and a one-line "run it via /<trigger>" hint at the end.
