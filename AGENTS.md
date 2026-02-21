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

# UI Development — shadcn/ui

When working on UI in `apps/desktop`:

- **Always prefer shadcn/ui components** over hand-written HTML/CSS or third-party component libraries. Check `apps/desktop/src/components/ui/` for already-installed components before building anything custom.
- **Adding new components**: run `pnpm dlx shadcn@latest add <component> --cwd apps/desktop` to install from the registry. Never copy-paste component source from docs manually.
- **Styling**: use Tailwind CSS utility classes and the project's CSS variables (defined in `apps/desktop/src/styles.css`). Use the `cn()` helper from `@/lib/utils` to merge class names.
- **Icons**: use `lucide-react` (the configured icon library). Do not add other icon packages.
- **Configuration reference**: see `apps/desktop/components.json` for the active shadcn preset (style: new-york, base color: gray, aliases, etc.).
- **Do not** create custom UI primitives (buttons, dialogs, dropdowns, inputs, cards, etc.) when a shadcn equivalent exists.
