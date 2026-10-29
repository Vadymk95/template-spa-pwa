/// <reference types="vitest" />
import path from 'node:path';

import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';

import viteConfigFn from './vite.config.ts';

const viteConfig =
    typeof viteConfigFn === 'function'
        ? viteConfigFn({ command: 'build', mode: 'test' })
        : viteConfigFn;

// Characters picomatch reads as pattern syntax: in a literal path each one has to be escaped.
const GLOB_SYNTAX = /[\\()[\]{}!+@*?|]/g;

// The files that make `vitest run --changed` run the WHOLE suite instead of the tests the import graph
// reaches: the manifest and the runner's own config, neither of which is part of that graph. The
// runner's defaults (`**/package.json/**`, `**/{vitest,vite}.config.*/**`) never match the config file
// itself, and a `**` does not cross a dot-directory, so a checkout under `.worktrees/` matched nothing.
// A literal path anchored at the checkout matches from wherever it lives; the only wildcard is the
// config file's extension. The vite config is in the list because this config merges it.
export const forceRerunTriggersFor = (root: string): string[] => {
    const anchor = root.split(path.sep).join('/').replace(GLOB_SYNTAX, '\\$&');

    return [`${anchor}/package.json`, `${anchor}/{vitest,vite}.config.*`];
};

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            // A focused test (`it.only`, `describe.only`) silently skips the rest of the suite and
            // exits 0. Vitest's default allows it outside CI, so a push could carry one; refuse it
            // everywhere. Iterate on one test with `npm run test:one -- <file>` or `-t <name>`.
            allowOnly: false,
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts'],
            // The runner adds `setupFiles` to this list itself, so the setup file is covered as well.
            forceRerunTriggers: forceRerunTriggersFor(import.meta.dirname),
            coverage: {
                provider: 'v8',
                // text: terminal summary, json-summary: CI badge/diff, lcov: Codecov/Coveralls, html: local drill-down
                reporter: ['text', 'json-summary', 'lcov', 'html'],
                // Explicit include ensures ALL src files appear in the report —
                // not just those imported by tests. Prevents inflated coverage %.
                include: ['src/**'],
                exclude: [
                    'src/test/**',
                    'src/env.ts',
                    // Entry: i18n boot + providers — integration-tested manually; keeps thresholds honest vs untestable orchestration.
                    'src/main.tsx',
                    'src/components/ui/**',
                    // Lazy-only barrels — real pages are covered via `*.tsx` modules and route tests.
                    'src/pages/**/index.ts',
                    // DEV-only, tree-shaken in prod. Deleting it should not move coverage.
                    'src/pages/DevPlayground/**',
                    // Template seeds — graduate to real domain modules per .cursor/brain/EXTENSIONS.md Phase 1; untested by design.
                    'src/lib/api/_example*',
                    // Side-effect singleton tested indirectly via the mocked hook in usePwaInstall.test.ts.
                    'src/lib/pwa/installPromptCapture.ts',
                    // DEV-only MSW worker setup; never reaches prod.
                    'src/mocks/**',
                    '**/*.d.ts',
                    '**/*.config.{ts,js}'
                ],
                reportsDirectory: './coverage',
                // Ratchet floor — locks current state, prevents regression.
                // Roadmap: bump to 70 / 60 / 70 / 55 once `isSafeForAuth` and
                // `_hasHydrated` branches are covered (EXTENSIONS Phase 4); then
                // 80 / 70 / 80 / 70 once observability transport lands.
                // CI fails if coverage drops below these numbers.
                thresholds: {
                    statements: 65,
                    lines: 65,
                    functions: 60,
                    branches: 48
                }
            },
            // `scripts/**` is deliberately `.mjs`: it sits outside every tsconfig
            // project, so a `.ts` test there would fail ESLint's project service.
            // Coverage `include` stays `src/**`, so build tooling cannot inflate
            // or dilute the thresholds.
            include: [
                'src/**/*.{test,spec}.{ts,tsx}',
                'vite-plugins/**/*.{test,spec}.{ts,tsx}',
                'scripts/**/*.{test,spec}.mjs',
                // Pure helpers shared by the Playwright specs. `.test.ts` here runs in Vitest and
                // `.spec.ts` runs in Playwright — the two runners must not collect each other's files,
                // which is why both configs carry the matching ignore.
                'e2e/support/**/*.test.ts'
            ]
        }
    })
);
