import nx from '@nx/eslint-plugin';

// ---------------------------------------------------------------------------
// PipeFX module boundaries — Phase 0 (see Refactore/phase-00-prep.md)
//
// Three tag axes are declared here:
//   scope:   shared | platform | feature | app | mcp
//   layer:   contracts | domain | ui | backend | data
//   feature: brain | chat | auth | billing | connectors | skills |
//            media-gen | post-production | node-system
//
// All rules run at WARN during the migration. Phase 11 flips to ERROR.
// A few transitional per-package scope tags (scope:tasks, scope:usage,
// scope:backend, scope:cloud-api) remain on packages that haven't migrated
// onto the new scope/layer/feature axes yet.
// ---------------------------------------------------------------------------

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/build',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'warn',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // ===== New scope axis (Phase 0 — populated as packages migrate) =====
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:platform',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:platform'],
            },
            {
              sourceTag: 'scope:feature',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:platform',
                'scope:feature',
              ],
            },
            {
              sourceTag: 'scope:app',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:platform',
                'scope:feature',
                'scope:app',
                'scope:mcp',
              ],
            },
            // scope:mcp covers the apps/mcp-* server projects and the low-level
            // @pipefx/mcp-transport package. Runtime connector code lives in
            // @pipefx/connectors (scope:feature + feature:connectors).
            {
              sourceTag: 'scope:mcp',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:platform',
                'scope:mcp',
              ],
            },

            // ===== Layer axis =====
            {
              sourceTag: 'layer:contracts',
              onlyDependOnLibsWithTags: ['layer:contracts'],
            },
            {
              sourceTag: 'layer:domain',
              onlyDependOnLibsWithTags: ['layer:contracts', 'layer:domain'],
            },
            {
              sourceTag: 'layer:ui',
              onlyDependOnLibsWithTags: [
                'layer:contracts',
                'layer:domain',
                'layer:ui',
              ],
            },
            {
              sourceTag: 'layer:data',
              onlyDependOnLibsWithTags: ['layer:contracts', 'layer:data'],
            },
            {
              sourceTag: 'layer:backend',
              onlyDependOnLibsWithTags: [
                'layer:contracts',
                'layer:domain',
                'layer:data',
                'layer:backend',
              ],
            },

            // ===== Feature isolation =====
            // Each feature may depend on its own internals plus *any* feature's
            // contracts. It may NOT reach into another feature's non-contracts
            // internals. The `notDependOnLibsWithTags` entries below are
            // populated for each feature:<X> pair: every other feature's
            // non-contracts layers are banned.
            //
            // These constraints activate as feature packages land (Phase 3+).
            // For Phase 0 they are declared so the axis is live; concrete
            // feature packages tagged feature:<X> will start seeing warnings
            // the moment they import across feature boundaries.
            ...[
              'brain',
              'chat',
              'auth',
              'billing',
              'connectors',
              'skills',
              'media-gen',
              'post-production',
              'node-system',
            ].flatMap((self) => {
              const others = [
                'brain',
                'chat',
                'auth',
                'billing',
                'connectors',
                'skills',
                'media-gen',
                'post-production',
                'node-system',
              ].filter((f) => f !== self);
              return [
                {
                  sourceTag: `feature:${self}`,
                  onlyDependOnLibsWithTags: [
                    // own feature internals
                    `feature:${self}`,
                    // other features' public contracts only
                    ...others.map((f) => `feature:${f}`),
                    // platform + shared are always fair game
                    'scope:platform',
                    'scope:shared',
                  ],
                },
              ];
            }),

            // ===== Brain sub-feature isolation (Phase 4.8) =====
            // Brain is split into six packages (see Refactore/phase-04-brain.md):
            //   brain-contracts (scope:platform)
            //   brain-loop, brain-tasks, brain-memory, brain-planning,
            //   brain-subagents (scope:feature, feature:brain).
            //
            // Implementation packages depend on brain-contracts only; they do
            // NOT import each other — except brain-subagents, which orchestrates
            // brain-loop + brain-tasks + brain-planning (documented exception).
            //
            // We express this with deny-lists: each implementation package's
            // sub-tag bans the siblings it must not import. The broader
            // `feature:brain` allow-list above still applies, so platform +
            // cross-feature contracts remain reachable.
            ...(() => {
              const siblings = ['loop', 'tasks', 'memory', 'planning'];
              return [
                ...siblings.map((self) => ({
                  sourceTag: `feature:brain-${self}`,
                  notDependOnLibsWithTags: siblings
                    .filter((x) => x !== self)
                    .map((x) => `feature:brain-${x}`)
                    .concat(['feature:brain-subagents']),
                })),
                // brain-subagents is the orchestrator: can reach loop/tasks/planning,
                // but not brain-memory.
                {
                  sourceTag: 'feature:brain-subagents',
                  notDependOnLibsWithTags: ['feature:brain-memory'],
                },
              ];
            })(),

            // ===== Transitional: current per-package scope tags =====
            // These are the tags packages carry today. They come off as each
            // package migrates onto the new scope/layer/feature axes during
            // Phase 1+. Do not add new ones.
            {
              sourceTag: 'scope:tasks',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:tasks'],
            },
            {
              sourceTag: 'scope:usage',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:platform',
                'scope:usage',
              ],
            },
            {
              sourceTag: 'scope:backend',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:mcp',
                'scope:tasks',
                'scope:usage',
                'scope:platform',
                'scope:feature',
              ],
            },
            {
              sourceTag: 'scope:cloud-api',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:platform',
                'scope:usage',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // Feature-isolation scaffold. As feature packages split in Phase 3+,
      // each feature's non-contracts sub-paths get added here so a deep
      // import like `@pipefx/brain-loop/internals` triggers a warning even
      // when a package forgets its feature:<X> tag. Warn-only through
      // Phase 11.
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@pipefx/*/src/*', '@pipefx/*/dist/*'],
              message:
                'Import from the package barrel (`@pipefx/<name>`), not a deep path.',
            },
          ],
        },
      ],
    },
  },
];
