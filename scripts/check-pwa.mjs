#!/usr/bin/env node
// Post-build PWA sanity gate. Runs after `npm run build`, before push.
// Catches the failure modes the consilium red-team flagged:
//  1. Empty precache manifest (Rolldown vs rollupOptions API drift)
//  2. mockServiceWorker.js leaking into the precache list
//  3. Minifier silently stripping iOS/PWA meta tags from index.html
// Keep this script under 80 LOC. If it grows, replace with a proper test instead.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');

const fail = (msg) => {
    console.error(`✗ check-pwa: ${msg}`);
    process.exit(1);
};
const ok = (msg) => console.log(`✓ ${msg}`);

if (!existsSync(DIST)) fail(`dist/ missing — run 'npm run build' first`);

// 1. manifest.webmanifest with required fields.
const manifestPath = resolve(DIST, 'manifest.webmanifest');
if (!existsSync(manifestPath)) fail('manifest.webmanifest not generated');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const required = ['id', 'scope', 'start_url', 'name', 'display', 'theme_color', 'icons'];
for (const key of required) {
    if (manifest[key] === undefined) fail(`manifest missing field: ${key}`);
}
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
    fail('manifest.icons must list at least 2 entries (192 + 512)');
}
ok(`manifest.webmanifest has ${manifest.icons.length} icons + required fields`);

// 2. sw.js exists AND has a non-empty precache manifest.
const swPath = resolve(DIST, 'sw.js');
if (!existsSync(swPath)) fail('sw.js not generated');
const sw = readFileSync(swPath, 'utf8');
if (!sw.includes('precacheAndRoute')) fail('sw.js missing precacheAndRoute call');
// Each precache entry in Workbox's emitted SW contains a `revision:` field
// (either `revision:"<md5>"` for content-revisioned files or `revision:null`
// for content-hashed assets). Counting `revision:` is robust across minified
// (`{url:"..."}`) vs unminified (`{"url":"..."}`) SW shapes — under-5 means
// Rolldown ↔ rollupOptions API drift produced a near-empty manifest (build
// still "succeeds", SW ships with no offline cache).
const precacheEntries = (sw.match(/revision:/g) ?? []).length;
const PRECACHE_MIN = 5;
if (precacheEntries < PRECACHE_MIN) {
    fail(
        `sw.js precache has ${String(precacheEntries)} entries (need ≥${String(PRECACHE_MIN)}) — Rolldown/rollupOptions API drift?`
    );
}
if (sw.includes('mockServiceWorker.js')) {
    fail('sw.js precache contains mockServiceWorker.js — globIgnores or plugin order regressed');
}
ok(`sw.js has ${String(precacheEntries)} precache entries, no MSW leakage`);

// 3. index.html retains the iOS/PWA meta tags after Oxc minification.
const htmlPath = resolve(DIST, 'index.html');
if (!existsSync(htmlPath)) fail('index.html not in dist/');
const html = readFileSync(htmlPath, 'utf8');
const metaChecks = [
    ['name="mobile-web-app-capable"', 'Android install meta'],
    ['name="apple-mobile-web-app-capable"', 'iOS splash meta (next.js#74524)'],
    ['name="theme-color"', 'theme-color meta'],
    ['rel="manifest"', 'manifest <link>'],
    ['rel="apple-touch-icon"', 'apple-touch-icon <link>']
];
for (const [needle, label] of metaChecks) {
    if (!html.includes(needle)) fail(`index.html lost ${label} (${needle})`);
}
ok('index.html retains iOS/PWA meta tags + manifest link');

console.log('\nPWA build verified.');
