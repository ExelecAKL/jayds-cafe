import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    settings: { next: { rootDir: ['apps/customer/', 'apps/pos/', 'apps/admin/'] } },
    rules: { '@next/next/no-img-element': 'off' },
  },
  globalIgnores([
    '**/.next/**', '**/out/**', '**/build/**', '**/public/sw.js',
    '**/public/workbox-*.js', '**/public/swe-worker-*.js', '**/next-env.d.ts',
    // Copied upstream MapLibre distribution; maintained map code remains linted.
    'apps/customer/public/maplibre/**',
    '.codex-logs/**', '**/.vercel*/**', 'docs/**',
  ]),
]);
