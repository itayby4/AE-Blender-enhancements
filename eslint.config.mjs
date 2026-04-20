import nx from '@nx/eslint-plugin';

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
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:async',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:async'],
            },
            {
              sourceTag: 'scope:colors',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:colors'],
            },
            {
              sourceTag: 'scope:strings',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:strings'],
            },
            {
              sourceTag: 'scope:mcp',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:async',
                'scope:mcp',
              ],
            },
            {
              sourceTag: 'scope:ai',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:mcp',
                'scope:ai',
                'scope:providers',
              ],
            },
            {
              sourceTag: 'scope:tasks',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:tasks'],
            },
            {
              sourceTag: 'scope:providers',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:mcp',
                'scope:providers',
              ],
            },
            {
              sourceTag: 'scope:agents',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:async',
                'scope:mcp',
                'scope:ai',
                'scope:providers',
                'scope:agents',
              ],
            },
            {
              sourceTag: 'scope:backend',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:mcp',
                'scope:ai',
                'scope:providers',
                'scope:tasks',
                'scope:agents',
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
    // Override or add rules here
    rules: {},
  },
];
