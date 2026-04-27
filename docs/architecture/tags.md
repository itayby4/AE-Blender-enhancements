# Nx Tag Axes

This repo uses **three tag axes** on every Nx project to enforce module
boundaries. Tags live in each project's `package.json` under `nx.tags` and are
validated by `@nx/enforce-module-boundaries` in [`eslint.config.mjs`](../../eslint.config.mjs).

All boundary rules currently run at **warn**. They flip to **error** in
Phase 11 of the migration.

## Axes at a glance

| Axis | Values | Applied to |
|---|---|---|
| `scope` | `shared`, `platform`, `feature`, `app`, `mcp` | Every package and app |
| `layer` | `contracts`, `domain`, `ui`, `backend`, `data` | Feature packages (optional on tiny libs) |
| `feature` | `brain`, `chat`, `auth`, `billing`, `connectors`, `skills`, `media-gen`, `post-production`, `node-system` | Feature-scoped packages only |

## `scope:*` — what this thing *is*

| Value | Meaning | Example (future names) |
|---|---|---|
| `shared` | IO-free helper, no product opinions. Depends on other `shared` only. | `@pipefx/utils`, `@pipefx/strings`, `@pipefx/result`, `@pipefx/ids` |
| `platform` | Stable infra reused by many features. | `@pipefx/video-kit`, `@pipefx/llm-providers`, `@pipefx/event-bus`, `@pipefx/db`, `@pipefx/logger` |
| `feature` | Product capability. Opinionated, disposable, feature-tagged. | `@pipefx/brain-*`, `@pipefx/chat`, `@pipefx/auth`, `@pipefx/skills` |
| `app` | Deployable under `apps/`. Imports packages; is not imported. | `@pipefx/desktop`, `@pipefx/backend`, `@pipefx/cloud-api` |
| `mcp` | MCP server process under `apps/mcp-*` plus the low-level `@pipefx/mcp-transport` factory. Runtime connector code lives in `@pipefx/connectors` (`scope:feature`, `feature:connectors`). | `apps/mcp-davinci`, `apps/mcp-aftereffects`, `@pipefx/mcp-transport` |

Dependency direction: `shared ⟵ platform ⟵ feature ⟵ app`. MCP apps are
standalone processes and do not import app/package internals cross-process —
they speak MCP/HTTP.

## `layer:*` — which slice of a feature package

Feature packages are split internally (by tag or folder) into layers with a
strict inward dependency direction:

```
contracts ⟵ domain ⟵ ui
                  ⟵ backend ⟵ data
```

| Layer | Contents |
|---|---|
| `contracts` | Pure types, schemas, and the public API other features may import. Zero runtime deps on domain/ui/backend/data. |
| `domain` | Pure business logic. Imports `contracts`. |
| `ui` | React components / rendering. Imports `contracts` + `domain`. |
| `backend` | HTTP routes, handlers, workflow wiring. Imports `contracts` + `domain` + `data`. |
| `data` | DB access, repositories, schemas. Imports `contracts` only. |

Rule of thumb: anything another feature might consume lives in
`layer:contracts`. Everything else is internal.

## `feature:*` — which product capability owns this code

Applied to feature-scoped packages only. A feature package may only import
another feature's **`layer:contracts`** surface — never its `domain`, `ui`,
`backend`, or `data` internals.

Current feature list:

- `brain` — agent loop, planning, memory, subagents (6 packages after Phase 4)
- `chat` — conversation UI + backend routes
- `auth` — authentication and session
- `billing` — metering, entitlements, cloud-api composer
- `connectors` — MCP host / connector registry
- `skills` — skill manifest + runtime
- `media-gen` — image/video generation
- `post-production` — pipeline engines (autopod, audio-sync, xml-inject-sync)
- `node-system` — *pending* feature-vs-platform decision (§11)

## Boundary rules in effect

Encoded in [`eslint.config.mjs`](../../eslint.config.mjs):

1. Scope hierarchy — `shared` ⟵ `platform` ⟵ `feature` ⟵ `app`; `mcp` sits beside `feature` with access to `shared` + `platform`.
2. Layer hierarchy — inward-only as shown above.
3. Feature isolation — `feature:X` may depend on `feature:X` internals, any feature's `layer:contracts`, plus `platform` + `shared`. No other feature's internals.
4. `no-restricted-imports` — deep imports like `@pipefx/brain-loop/src/*` are warned; import the barrel.

## Transitional per-package scope tags

Today's packages carry per-package scope tags (`scope:ai`, `scope:async`,
`scope:providers`, etc.). They stay lint-clean under transitional
constraints in `eslint.config.mjs` and will be retagged onto `scope:shared`,
`scope:platform`, or `scope:feature` + `feature:<name>` as each package
migrates in Phase 1 onwards.

**Do not add new per-package scope tags.** New packages use the three axes
above from day one.

## How to tag a new package

```json
{
  "name": "@pipefx/chat",
  "nx": {
    "tags": ["scope:feature", "feature:chat"]
  }
}
```

For a multi-layer feature package, add the layer tag too:

```json
{
  "nx": {
    "tags": ["scope:feature", "feature:brain", "layer:contracts"]
  }
}
```

A platform package:

```json
{
  "nx": {
    "tags": ["scope:platform"]
  }
}
```

## References

- `phase-00-prep.md` — this phase's deliverables (in `Refactore/`, not checked in)
- [`arc_guidelines.md`](../../../../Downloads/arc_guidelines.md) §9 — canonical boundary rules
- [`CLAUDE.md`](../../CLAUDE.md) — current (pre-migration) dependency graph
