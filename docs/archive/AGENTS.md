<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

---

# PipeFX Architecture Guide

This document is the single source of truth for how this codebase is structured.
Every AI agent working in this repo MUST read and follow it.

## Project Overview

PipeFX is a desktop application for controlling video editing software (DaVinci Resolve and more in the future) through an AI-powered command center. It is an Nx monorepo using pnpm workspaces.

**Runtime data flow:**

```
Desktop (Tauri/React) --HTTP POST /chat--> Backend (Node.js)
                                              |
                                    ConnectorRegistry
                                     /            \
                          Connector: resolve    Connector: ... (future)
                               |
                          MCP Client (stdio)
                               |
                       mcp-davinci (Python)
                               |
                       DaVinci Resolve API
```

## Directory Layout

```
pipefx/
  apps/
    desktop/           -> @pipefx/desktop   Tauri 2 + React 19 + shadcn/ui
    backend/           -> @pipefx/backend   Thin Node.js HTTP server (wiring only)
    mcp-davinci/       -> (Python)          MCP server for DaVinci Resolve

  packages/
    connectors/          -> @pipefx/connectors           Registry, lifecycle, capability map, backend + UI surfaces
    connectors-contracts/-> @pipefx/connectors-contracts Frozen connector types + event-bus events
    mcp-transport/       -> @pipefx/mcp-transport        Stdio/SSE transport factory + resolveVenvPython
    brain-contracts/     -> @pipefx/brain-contracts      Frozen brain types + events
    brain-loop/ brain-tasks/ brain-memory/ brain-planning/ brain-subagents/
                         -> @pipefx/brain-*             Post-Phase-4 brain split (see CLAUDE.md)
    async/             -> @pipefx/async     Retry with exponential backoff
    strings/           -> @pipefx/strings   String utilities
    colors/            -> @pipefx/colors    Color conversion utilities
    utils/             -> @pipefx/utils     Shared low-level helpers
```

---

## Dependency Graph and Module Boundaries

Dependencies flow **downward only**. This is enforced by `@nx/enforce-module-boundaries` in `eslint.config.mjs`.

```
  apps/backend  (scope:backend)
      |     \
      |      \
  @pipefx/ai  (scope:ai)
      |
  @pipefx/connectors (scope:feature, feature:connectors)
      |
  @pipefx/mcp-transport (scope:mcp)
      |
  @pipefx/async (scope:async)   @pipefx/strings (scope:strings)
      \                              |
       \___________________________/
                   |
             @pipefx/utils (scope:shared)
```

**Rules:**

- `scope:shared` can only depend on `scope:shared`.
- `scope:mcp` can depend on `scope:shared` and `scope:async`.
- `scope:ai` can depend on `scope:shared` and `scope:mcp`.
- `scope:backend` can depend on `scope:shared`, `scope:mcp`, and `scope:ai`.
- Packages MUST NOT import from apps. Apps MUST NOT import from each other.
- Every project that imports a workspace package must declare it in its own `package.json` `dependencies` using `"workspace:*"`.

---

## TypeScript Package Conventions

Every package in `packages/` follows the same structure. Do not deviate.

### File layout

```
packages/<name>/
  src/
    index.ts              <- barrel file, re-exports everything public
    lib/
      types.ts            <- interfaces and type aliases
      <feature>.ts        <- implementation files
  package.json
  tsconfig.json           <- extends ../../tsconfig.base.json, references lib + spec
  tsconfig.lib.json       <- build config (rootDir: src, outDir: dist)
  tsconfig.spec.json      <- test config (vitest types)
  vite.config.ts          <- vitest test runner config
```

### `package.json` template

```json
{
  "name": "@pipefx/<name>",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "@pipefx/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "!**/*.tsbuildinfo"],
  "dependencies": {
    "tslib": "^2.3.0"
  },
  "nx": {
    "tags": ["scope:<name>"]
  }
}
```

The `"@pipefx/source"` export condition enables direct source imports during development (configured in `tsconfig.base.json` via `customConditions`).

### Import style

- Always use `.js` extensions in relative imports (`./lib/types.js`, not `./lib/types`).
- Import workspace packages by name (`@pipefx/connectors`), never by relative path.
- Use `import type { ... }` for type-only imports.

### Creating a new package

1. Create the directory structure shown above.
2. Add the Nx `scope:<name>` tag in `package.json`.
3. Add the project reference to the root `tsconfig.json`.
4. Add a dep constraint to `eslint.config.mjs` for the new scope tag.
5. Run `pnpm install --no-frozen-lockfile` to link.
6. Run `pnpm nx run-many -t build lint typecheck -p @pipefx/<name>` to verify.

---

## Connector Architecture (`@pipefx/connectors` + `@pipefx/connectors-contracts` + `@pipefx/mcp-transport`)

The connector system abstracts connections to external applications via the Model Context Protocol. It is the central extensibility point.

### Key types

- **`ConnectorConfig`** -- declares _what_ to connect to (id, name, transport).
- **`TransportConfig`** -- discriminated union: `StdioTransportConfig | SseTransportConfig`.
- **`Connector`** -- a live connection wrapping an MCP `Client`. Has `connect()`, `disconnect()`, `listTools()`, `callTool()`.
- **`ConnectorRegistry`** -- manages multiple connectors. Aggregates tools from all connectors and routes `callTool()` to the correct one.

### Adding a new connector

To support a new application (e.g., Adobe Premiere Pro):

1. **Create the MCP server** at `apps/mcp-premiere/`. It can be Python, Node, or any language that speaks MCP over stdio or SSE.
2. **Register it in `apps/backend/src/config.ts`:**
   ```typescript
   connectors: {
     resolve: { ... },
     premiere: {
       id: 'premiere',
       name: 'Adobe Premiere Pro',
       transport: {
         type: 'stdio',
         command: resolveVenvPython(path.join(workspaceRoot, 'apps', 'mcp-premiere', 'venv')),
         args: [path.join(workspaceRoot, 'apps', 'mcp-premiere', 'src', 'mcp_premiere', 'server.py')],
       },
     },
   }
   ```
3. **Register in `main.ts`:** `registry.register(config.connectors.premiere);`
4. That is it. The AI agent automatically discovers all tools from all connectors.

Do NOT put connector-specific logic in `@pipefx/connectors`, `@pipefx/connectors-contracts`, `@pipefx/mcp-transport`, or any `@pipefx/brain-*` package. Those packages are application-agnostic.

---

## AI Agent Architecture (`@pipefx/ai`)

- `createAgent(config)` returns an `Agent` with a single `chat(message)` method.
- The agent uses a `ConnectorRegistry` to discover tools and route tool calls.
- The tool-call loop: Gemini -> functionCall -> `registry.callTool()` -> functionResponse -> repeat until text.
- The agent is **stateless per call** -- each `chat()` invocation creates a fresh Gemini chat session.

Do NOT hardcode tool names, connector IDs, or application-specific prompts inside `@pipefx/ai`. All configuration is passed via `AgentConfig`.

---

## Backend Conventions (`apps/backend`)

The backend is a **thin wiring layer**. It must contain:

- `config.ts` -- environment variables, connector configs, port.
- `main.ts` -- HTTP server setup, connector registration, agent creation.

It must NOT contain:

- Business logic (belongs in packages).
- AI model interaction code (belongs in `@pipefx/ai`).
- MCP client/transport code (belongs in `@pipefx/connectors` + `@pipefx/mcp-transport`).

---

## Python MCP Server Conventions (`apps/mcp-davinci`)

### Structure

```
apps/mcp-davinci/
  pyproject.toml
  src/mcp_davinci/
    __init__.py
    server.py               <- FastMCP instance + tool registration (thin)
    resolve_connector.py    <- ResolveConnector with caching
    constants.py            <- shared constants, platform paths
    tools/
      __init__.py           <- register_tools(mcp, connector)
      project.py            <- get_project_info
      markers.py            <- add_timeline_marker
      macros.py             <- execute_macro
```

### Connector caching strategy

`ResolveConnector` manages connection to DaVinci Resolve with tiered caching:

| What                | Cached?   | Why                                     |
| ------------------- | --------- | --------------------------------------- |
| fusionscript module | Permanent | Native binary, never changes at runtime |
| resolve instance    | TTL (5s)  | User might restart Resolve              |
| project reference   | Never     | User switches projects frequently       |
| timeline reference  | Never     | User switches timelines frequently      |

### Adding a new MCP tool

1. Create a new file in `tools/` (e.g., `tools/export.py`).
2. Implement a `register(mcp, connector)` function.
3. Inside it, define the tool with `@mcp.tool()`. Use the `connector` for all Resolve access.
4. Import and call the register function from `tools/__init__.py`.

Tool functions must:

- Accept the `connector` via the `register()` closure, never call `get_resolve()` directly.
- Return a string (FastMCP convention).
- Handle `NoProjectError`, `NoTimelineError`, `ResolveNotRunningError` from the connector.
- Use constants from `constants.py`, never hardcode repeated values.

---

## UI Development -- shadcn/ui

When working on UI in `apps/desktop`:

- **Always prefer shadcn/ui components** over hand-written HTML/CSS or third-party component libraries. Check `apps/desktop/src/components/ui/` for already-installed components before building anything custom.
- **Adding new components**: run `pnpm dlx shadcn@latest add <component> --cwd apps/desktop` to install from the registry. Never copy-paste component source from docs manually.
- **Styling**: use Tailwind CSS utility classes and the project's CSS variables (defined in `apps/desktop/src/styles.css`). Use the `cn()` helper from `@/lib/utils` to merge class names.
- **Icons**: use `lucide-react` (the configured icon library). Do not add other icon packages.
- **Configuration reference**: see `apps/desktop/components.json` for the active shadcn preset (style: new-york, base color: gray, aliases, etc.).
- **Do not** create custom UI primitives (buttons, dialogs, dropdowns, inputs, cards, etc.) when a shadcn equivalent exists.

---

## Verification Checklist

Before considering any change complete, run:

```bash
pnpm nx run-many -t build lint typecheck
```

All projects you touched (and their dependents) must pass. Pre-existing failures in unrelated projects (e.g., `desktop:typecheck` path alias issues) are not your responsibility, but do not introduce new ones.
