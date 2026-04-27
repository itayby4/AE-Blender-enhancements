# Node-System: Feature, not Platform

**Status:** Decided · Phase 10 · 2026-04-25
**Resolves:** `arc_guidelines.md §11 item 1` — node-system feature-vs-platform

## Decision

The node graph is extracted as a **vertical-slice feature** package
`@pipefx/node-system` (`scope:feature`, `feature:node-system`). It is **not**
demoted to a platform `@pipefx/node-kit` rendering substrate.

## Criterion (arc §4.7)

> **If** a typical PipeFX user encounters the node graph as a surface they
> directly author in (like the skill editor) → **keep feature-scoped** as
> `@pipefx/node-system`.
>
> **If** it is primarily a rendering substrate consumed by other features'
> visualizations (like brain's task tree or post-production's pipeline view)
> → **demote to platform** as `@pipefx/node-kit`.

## Evidence

### 1. The user authors directly in the graph

`apps/desktop/src/features/node-system/NodeSystemDashboard.tsx` is a full
ReactFlow editor: drag-from-palette, connect handles, edit per-node config,
press Play to execute the pipeline. The custom nodes (`ModelNode`,
`TriggerNode`, `PromptNode`, `MediaNode`, `NullNode`, `DownloadNode`,
`SoundNode`) are **domain primitives the user composes** — not generic
rendering chrome.

### 2. Nothing else in the repo renders a node graph

A repo-wide search for `@xyflow/react`, `ReactFlow`, `node-graph`,
`TaskTree`, and `PipelineView` returns matches in `features/node-system/`
only. Specifically:

- **Skills authoring** (`packages/skills/src/ui/authoring/`) is
  form-based — `CapabilityPicker`, `InputSchemaBuilder`,
  `ManifestIdentityFields`, `TemplatePreview`. No graph.
- **Brain task tree** has no graph rendering today; task hierarchies are
  rendered as nested lists.
- **Post-production pipeline view** (`packages/post-production/`) renders
  workflow status as cards/lists, not graphs.

There is no consuming feature for which `node-system` would be a
"substrate." The platform-extraction argument is therefore unsupported
by current code.

### 3. Domain knowledge concentrates inside the nodes

`ModelNode` (477 lines) embeds knowledge of which video/image models exist,
their cost, their prompt schema. `usePipelineExecutor` calls
`@pipefx/auth` for tokens and posts `MediaGenRequest` payloads to the
backend. These are product-shape concerns, not generic graph-rendering
concerns.

A `node-kit` extraction would have to either (a) leak this knowledge into
consumers via prop-drilling, or (b) keep it inside node-kit and dilute
its "platform" claim. Both outcomes argue for the feature framing.

## Consequences

- `packages/node-system/` ships with three subpath exports:
  - `.` — `PipelineAction`, `dispatchPipelineActions`, `onPipelineActions`
    (the chat → editor command bridge, currently in
    `apps/desktop/src/lib/pipeline-actions.ts`).
  - `./contracts` — the same contracts re-exported for consumers that
    only need types.
  - `./ui` — `NodeSystemDashboard` and the custom nodes.
- The package depends on `@pipefx/auth` (token retrieval) and
  `@pipefx/media-gen/contracts` (request shapes). Both relationships are
  cross-feature and currently allowed under the warn-mode boundary lint.
- `apps/desktop` becomes a wiring layer for the node-system surface:
  imports `<NodeSystemDashboard />` from `@pipefx/node-system/ui` and
  bridges chat → editor via `dispatchPipelineActions`.

## Reversal trigger

If a future feature needs a generic graph-rendering substrate (e.g.,
brain visualizing a sub-agent fork tree, post-production showing a render
DAG), revisit. Per the arc §11 mitigation, the package-move cost is small
while the commit count is low. The current commit count for
`features/node-system/` justifies extracting once, not twice.
