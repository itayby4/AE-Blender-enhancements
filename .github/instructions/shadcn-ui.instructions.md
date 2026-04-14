---
applyTo: 'apps/desktop/**'
---

# shadcn/ui Component Rules

When working on UI in `apps/desktop`:

- **Always prefer shadcn/ui components** over hand-written HTML/CSS or third-party component libraries. Check `apps/desktop/src/components/ui/` for already-installed components before building anything custom.
- **Adding new components**: run `pnpm dlx shadcn@latest add <component> --cwd apps/desktop` to install from the registry. Never copy-paste component source from docs manually.
- **Styling**: use Tailwind CSS utility classes and the project's CSS variables (defined in `apps/desktop/src/styles.css`). Use the `cn()` helper from `@/lib/utils` to merge class names.
- **Icons**: use `lucide-react` (the configured icon library). Do not add other icon packages.
- **Configuration reference**: see `apps/desktop/components.json` for the active shadcn preset (style: new-york, base color: gray, aliases, etc.).
- **Do not** create custom UI primitives (buttons, dialogs, dropdowns, inputs, cards, etc.) when a shadcn equivalent exists.
