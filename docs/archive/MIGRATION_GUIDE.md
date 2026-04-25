# Migration Guide — Event-Sourced Task Engine (`feature/event-sourced-tasks`)

This branch introduces a **new shared package** (`@pipefx/tasks`) and significant changes to the backend task management system. Follow these steps to get up and running after pulling.

---

## What Changed

| Area | Change |
|---|---|
| **New package** | `packages/tasks/` — shared task types, events, and reducers |
| **Backend** | `MemoryTaskManager` rewritten to event-sourced architecture |
| **Database** | Schema upgraded from v1 → v2 (new `task_events` table, `thoughts` column) |
| **AI agent** | `onThought` callback added for Chain of Thought streaming |
| **Frontend** | Task widget repositioned to bottom-left, imports shared types, shows Chain of Thought |
| **Deleted** | `apps/backend/src/task-manager.ts` and `apps/backend/src/api/projects.ts` (dead code) |

---

## Setup Steps

### 1. Install dependencies

The new `@pipefx/tasks` package needs to be linked in the workspace:

```bash
pnpm install --no-frozen-lockfile
```

### 2. Build the new package

The `@pipefx/tasks` package must be built before the backend or desktop can consume it:

```bash
pnpm nx run @pipefx/tasks:build
```

### 3. Build everything

Verify nothing is broken:

```bash
pnpm nx run-many -t build lint typecheck
```

All projects should pass with **0 errors**. Pre-existing warnings (e.g. `@typescript-eslint/no-explicit-any`) are expected and unrelated.

### 4. Database migration

The database schema upgrade happens **automatically** on first backend startup. When you start the backend, you'll see:

```
[Memory] Upgrading schema from v1 to v2
[Memory] Migration v1 → v2: Adding task_events table and thoughts column
```

This is a non-destructive migration — your existing tasks data is preserved. If you want a clean slate, simply delete `data/pipefx.db` and the backend will recreate it.

### 5. Start the app

```bash
# Terminal 1 — Backend
pnpm nx serve backend

# Terminal 2 — Desktop (Vite dev server)
pnpm nx serve desktop
```

### 6. Environment variables

Make sure your `.env` file exists at the workspace root with at minimum:

```env
GEMINI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
# Optional:
ANTHROPIC_API_KEY=your_key_here
```

---

## Known Issues

- **`mcp-premiere` ENOENT**: If you don't have the Premiere Pro MCP server's Python venv set up, you'll see a non-fatal error on startup. This is safe to ignore — the Resolve connector still works independently.
- **Vite chunk size warning**: The desktop build emits a warning about chunks > 500 KB. This is cosmetic and does not affect functionality.

---

## New Architecture at a Glance

```
@pipefx/tasks (shared package — zero dependencies)
├── types.ts     →  TaskDTO, TaskStep, TaskStatus
├── events.ts    →  TaskEvent discriminated union (6 event types)
└── reducer.ts   →  taskReducer(), tasksReducer() (pure functions)

Backend                              Frontend
┌────────────────────┐               ┌────────────────────┐
│ MemoryTaskManager  │               │ SSE listener       │
│  append event      │───SSE────────▶│ tasksReducer()     │
│  materialize row   │               │ (same reducer!)    │
│  emit via EventEmitter             │                    │
│                    │               │ TaskManagerWidget  │
│ task_events (log)  │               │ + Chain of Thought │
│ tasks (materialized)               │                    │
└────────────────────┘               └────────────────────┘
```

Both backend and frontend use the **same `tasksReducer()`** function from `@pipefx/tasks` — guaranteed state consistency.

---

## Verification Checklist

After setup, confirm everything works:

- [ ] `pnpm nx run @pipefx/tasks:build` — passes
- [ ] `pnpm nx run-many -t build lint typecheck -p @pipefx/tasks @pipefx/ai @pipefx/backend` — 0 errors
- [ ] `pnpm nx run desktop:build` — passes
- [ ] Backend starts and prints `[Memory] Database ready`
- [ ] Sending a chat message returns a response
- [ ] Task steps appear in the "Processing Details" panel during chat
- [ ] Task Manager widget appears at bottom-left for non-chat tasks
