import * as fs from 'fs';
import * as path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin, type PluginOption } from 'vite';
import compression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';
import { webfontDownload } from 'vite-plugin-webfont-dl';

import pkg from './package.json' with { type: 'json' };
import { devBanner } from './vite-plugins/dev-banner';
import { htmlOptimize } from './vite-plugins/html-optimize';
import { i18nHmr } from './vite-plugins/i18n-hmr';

// Remove MSW service worker from production dist — it's a dev-only artifact.
// public/mockServiceWorker.js is committed so MSW works in dev, but must not ship.
const removeMswPlugin = (): Plugin => ({
    name: 'remove-msw-sw',
    apply: 'build',
    closeBundle() {
        const sw = path.resolve(__dirname, 'dist/mockServiceWorker.js');
        const swBr = sw + '.br';
        if (fs.existsSync(sw)) fs.unlinkSync(sw);
        if (fs.existsSync(swBr)) fs.unlinkSync(swBr);
    }
});

export default defineConfig(({ command }) => ({
    server: {
        port: 3000,
        cors: true
    },
    base: '/',
    define: {
        // Exposed to app code (e.g. Footer) via global declared in src/vite-env.d.ts.
        // Single source of truth: package.json version.
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins: [
        tailwindcss(),
        react({
            jsxRuntime: 'automatic'
        }),
        // Single-print dev-server banner (project + version + node + vite + mode + flags).
        // Disabled in CI / non-TTY by default; flip with VITE_DEV_BANNER=false locally.
        devBanner(),
        // Prevents FOUC by ensuring CSS loads before JavaScript
        htmlOptimize(),
        // Hot reload for i18n translation files in development
        i18nHmr(),
        // MUST run before VitePWA so its closeBundle deletes dist/mockServiceWorker.js
        // before VitePWA's precache scan finalizes — see .cursor/brain/SKELETONS.md.
        removeMswPlugin(),
        // PWA: generateSW (Workbox) + prompt-mode update flow.
        // Manifest, update flow, caching strategy: .cursor/brain/PWA.md.
        VitePWA({
            registerType: 'prompt',
            injectRegister: 'auto',
            // Dev SW disabled by design: PWA SW is PROD-only, MSW SW is DEV-only —
            // they never coexist on `/`. Flipping this flag breaks MSW.
            devOptions: { enabled: false },
            manifest: {
                id: '/',
                scope: '/',
                start_url: '/',
                name: 'React SPA + PWA Foundation',
                short_name: 'React PWA',
                description:
                    'Production-ready React 19 + Vite 8 + TypeScript SPA + PWA template. Replace this description before shipping.',
                lang: 'en',
                display: 'standalone',
                display_override: ['standalone', 'minimal-ui'],
                orientation: 'any',
                theme_color: '#0a0a0a',
                background_color: '#ffffff',
                icons: [
                    { src: '/icons/192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
                ],
                // Chromium-only fields, ignored elsewhere — safe defaults.
                // handle_links: 'auto' (not 'preferred') so forks that ship auth flows
                // don't accidentally hijack deep links. See .cursor/brain/PWA.md.
                handle_links: 'auto',
                launch_handler: { client_mode: 'navigate-existing' }
            },
            workbox: {
                // Precache build artefacts + locales (content-hashed, no TTL needed).
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest,json}'],
                // Defence-in-depth: even if removeMswPlugin's closeBundle order regresses,
                // the MSW worker never enters precache and never 404s post-deploy.
                globIgnores: ['**/mockServiceWorker.js', '**/mockServiceWorker.js.br'],
                // Prompt mode requires these stay off — UpdateToast drives skipWaiting
                // via updateServiceWorker(true).
                skipWaiting: false,
                clientsClaim: false
            }
        }),
        compression({
            algorithm: 'brotliCompress',
            ext: '.br',
            deleteOriginFile: false
        }),
        // Downloads fonts from @import in CSS and bundles them locally (0 external requests)
        webfontDownload(),
        // Bundle analyzer: only runs when ANALYZE=true env variable is set
        // Usage: ANALYZE=true npm run build
        ...((process.env.ANALYZE === 'true'
            ? [
                  visualizer({
                      open: true,
                      filename: 'dist/bundle-analysis.html',
                      gzipSize: true,
                      brotliSize: true
                  })
              ]
            : []) as PluginOption[])
    ],
    optimizeDeps: {
        // Pre-bundle for faster cold dev-server startup
        include: [
            'react',
            'react-dom/client',
            'react-router-dom',
            'i18next',
            'react-i18next',
            'i18next-browser-languagedetector',
            'i18next-http-backend',
            '@tanstack/react-query',
            'zustand',
            'clsx',
            'tailwind-merge'
        ]
    },
    build: {
        minify: 'oxc',
        target: 'baseline-widely-available',
        cssCodeSplit: true,
        reportCompressedSize: false,
        // Keep source maps off in production artifacts to reduce output size.
        sourcemap: command === 'build' ? false : true,
        assetsInlineLimit: 4096,
        rolldownOptions: {
            treeshake: {
                moduleSideEffects: false
            },
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'state-vendor',
                            test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:zustand[\\/]|@tanstack[\\/]react-query[\\/]|@tanstack[\\/]query-core[\\/])/
                        },
                        {
                            // react-router (v7 core) must be listed before react to avoid
                            // "react" substring matching react-router incorrectly
                            name: 'react-vendor',
                            test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react-router-dom[\\/]|react-router[\\/]|react-dom[\\/]|scheduler[\\/]|react[\\/])/
                        },
                        {
                            name: 'ui-vendor',
                            test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:@radix-ui[\\/]|lucide-react[\\/]|class-variance-authority[\\/]|clsx[\\/]|tailwind-merge[\\/])/
                        },
                        {
                            name: 'i18n-vendor',
                            test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:i18next[\\/]|i18next-browser-languagedetector[\\/]|i18next-http-backend[\\/]|react-i18next[\\/])/
                        }
                    ]
                },
                entryFileNames: 'assets/[name].[hash].js',
                chunkFileNames: 'assets/[name].[hash].js',
                assetFileNames: 'assets/[name].[hash].[ext]'
            }
        },
        // Warning limit for chunk size (600kb = stricter control, helps catch performance issues early)
        chunkSizeWarningLimit: 600
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@locales': path.resolve(__dirname, './public/locales'),
            // i18next-http-backend pulls cross-fetch@4 (9.5kb polyfill).
            // All target browsers have native fetch — redirect to a thin shim.
            'cross-fetch': path.resolve(__dirname, './src/lib/cross-fetch-native.ts')
        }
    }
}));
