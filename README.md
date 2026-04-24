# PipeFX

A TypeScript monorepo powered by [Nx](https://nx.dev) — publishable utility packages and a Tauri desktop application.

## Prerequisites

| Tool    | Version | Install                                                                  |
| ------- | ------- | ------------------------------------------------------------------------ |
| Node.js | >= 22   | [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org) |
| pnpm    | >= 10   | `corepack enable && corepack prepare pnpm@latest --activate`             |
| Rust    | stable  | [rustup.rs](https://rustup.rs)                                           |

Tauri also needs platform-specific system dependencies. See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build everything
pnpm nx run-many -t build

# Run all tests
pnpm nx run-many -t test

# Lint all projects
pnpm nx run-many -t lint

# Type-check all projects
pnpm nx run-many -t typecheck

# Launch the desktop app in dev mode
pnpm nx serve desktop
```

## Project Structure

```
pipefx/
├── apps/
│   └── desktop/              Tauri desktop application
│       ├── src/              Frontend source (React, Tailwind CSS, shadcn/ui)
│       ├── src-tauri/        Rust backend (Tauri 2)
│       ├── components.json   shadcn/ui configuration
│       └── vite.config.mts   Vite bundler config
├── packages/
│   ├── strings/              @pipefx/strings — string manipulation utilities
│   ├── async/                @pipefx/async  — async retry and helpers
│   ├── colors/               @pipefx/colors — color conversion and manipulation
│   └── utils/                @pipefx/utils  — shared internal utilities (private)
├── nx.json                   Nx workspace configuration
├── pnpm-workspace.yaml       pnpm workspace definition
└── tsconfig.base.json        Shared TypeScript compiler options
```

## Desktop App (`apps/desktop`)

A native desktop application built with [Tauri 2](https://v2.tauri.app), [React](https://react.dev), [Vite](https://vite.dev), [Tailwind CSS v4](https://tailwindcss.com), and [shadcn/ui](https://ui.shadcn.com).

### Available Targets

```bash
pnpm nx serve desktop        # Tauri dev mode (Vite + native window)
pnpm nx build desktop        # Build the Vite frontend
pnpm nx build:tauri desktop  # Full native app build (frontend + Rust bundle)
pnpm nx test desktop         # Run Vitest unit tests
pnpm nx lint desktop         # Run ESLint
pnpm nx typecheck desktop    # TypeScript type-checking
```

### Adding shadcn/ui Components

The desktop app is configured with shadcn/ui. Add components from the registry:

```bash
pnpm dlx shadcn@latest add button --cwd apps/desktop
pnpm dlx shadcn@latest add dialog --cwd apps/desktop
```

Installed components land in `apps/desktop/src/components/ui/`. Use the `cn()` helper from `@/lib/utils` for conditional class names.

## Packages

All packages under `packages/` are buildable TypeScript libraries using Vite.

| Package           | Scope Tag       | Description                             | Published |
| ----------------- | --------------- | --------------------------------------- | --------- |
| `@pipefx/strings` | `scope:strings` | `capitalize`, `slugify`, and more       | Yes       |
| `@pipefx/async`   | `scope:async`   | `asyncRetry` with configurable backoff  | Yes       |
| `@pipefx/colors`  | `scope:colors`  | Hex/RGB/HSL conversion and manipulation | Yes       |
| `@pipefx/utils`   | `scope:shared`  | Internal shared helpers                 | No        |

### Working with a Package

```bash
# Build a single package
pnpm nx build strings

# Test a single package
pnpm nx test async

# Lint a single package
pnpm nx lint colors

# See all available targets for a project
pnpm nx show project strings --web
```

## Module Boundaries

Architectural constraints are enforced via ESLint and Nx tags:

| Package           | Can Import From        |
| ----------------- | ---------------------- |
| `@pipefx/utils`   | Nothing (base library) |
| `@pipefx/strings` | `scope:shared`         |
| `@pipefx/async`   | `scope:shared`         |
| `@pipefx/colors`  | `scope:shared`         |

Try violating a boundary — import `@pipefx/colors` into `@pipefx/strings` and run `pnpm nx lint strings` to see it fail.

## Common Commands

```bash
# Explore the workspace
pnpm nx graph                              # Interactive dependency graph
pnpm nx show projects                      # List all projects
pnpm nx show project <name> --web          # View project details in browser

# Run tasks
pnpm nx run-many -t build test lint        # Multiple targets in parallel
pnpm nx affected -t build                  # Only affected projects (great for CI)

# Release
pnpm nx release --dry-run                  # Preview release changes
pnpm nx release                            # Version and publish packages

# Format
pnpm nx format --fix                       # Prettier formatting across the workspace
```

## Nx Cloud

This workspace is connected to [Nx Cloud](https://cloud.nx.app) for remote caching and CI acceleration.

- **Remote caching** — build artifacts are shared across machines
- **Distributed task execution** — parallelize CI across agents
- **Flaky task detection** — automatic retries for non-deterministic tasks

## Learn More

- [Nx Documentation](https://nx.dev)
- [Tauri 2 Documentation](https://v2.tauri.app)
- [React](https://react.dev)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Vite](https://vite.dev)
