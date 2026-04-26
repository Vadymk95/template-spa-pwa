/// <reference types="vitest" />
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';

import viteConfigFn from './vite.config';

const viteConfig =
    typeof viteConfigFn === 'function'
        ? viteConfigFn({ command: 'build', mode: 'test' })
        : viteConfigFn;

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts'],
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
                    // 5-line cross-fetch shim, no branching logic.
                    'src/lib/cross-fetch-native.ts',
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
            include: ['src/**/*.{test,spec}.{ts,tsx}', 'vite-plugins/**/*.{test,spec}.{ts,tsx}']
        }
    })
);
