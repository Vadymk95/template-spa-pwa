import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Plugin } from 'vite';

import { API_DEFAULT_URL } from '../src/lib/constants.ts';

/**
 * The ONE source of truth for the response headers a deployment must send.
 *
 * Three consumers read it, so they cannot drift apart:
 *   - `dist/_headers`, written at build time (Netlify and Cloudflare Pages read that file as is);
 *   - `vite preview`, so the e2e suite runs under the same policy a host would apply;
 *   - the unit test next to this file, which fails when a header or a CSP directive disappears.
 *
 * Adapting it = edit `buildContentSecurityPolicy` / `buildSecurityHeaders` below. SECURITY_REQUIREMENTS.md
 * has the Vercel and nginx recipes for hosts that do not read `_headers`.
 *
 * The dev server is deliberately left alone: Vite HMR needs inline scripts and a websocket, and the
 * dev-only MSW worker is a service worker script. A CSP loose enough for those would not be the one
 * production ships, so the policy is exercised on the production build (preview) instead.
 */

export interface PolicyInput {
    /** `'sha256-…'` sources for the inline scripts of the BUILT `index.html`. */
    readonly scriptHashes: readonly string[];
    /** Origins the app fetches from besides its own. */
    readonly connectOrigins: readonly string[];
}

const SELF = "'self'";
const NONE = "'none'";

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/** Origin of an API URL; the unset case resolves to the same default the client uses. */
export const apiOrigin = (url: string | undefined): string | undefined => {
    try {
        return new URL(url ?? API_DEFAULT_URL).origin;
    } catch {
        return undefined;
    }
};

/**
 * CSP hash sources for the inline scripts of a built page. The hash covers the exact text between
 * the tags, so it must be computed from the FINAL html: `vite-plugin-pwa` injects an inline
 * service-worker registration (`injectRegister: 'inline'`) whose text changes with the config.
 */
export const inlineScriptHashes = (html: string): string[] => {
    const hashes: string[] = [];
    for (const [, attributes = '', body = ''] of html.matchAll(
        /<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi
    )) {
        if (/\bsrc\s*=/i.test(attributes) || body.trim() === '') continue;
        hashes.push(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    }
    return unique(hashes);
};

export const buildContentSecurityPolicy = ({
    scriptHashes,
    connectOrigins
}: PolicyInput): string => {
    const directives: Record<string, readonly string[]> = {
        'default-src': [SELF],
        'script-src': [SELF, ...scriptHashes],
        // The build emits CSS files and React sets `style` through CSSOM, which a CSP does not block.
        'style-src': [SELF],
        // Assets under `assetsInlineLimit` are inlined as data: URIs.
        'img-src': [SELF, 'data:'],
        'font-src': [SELF, 'data:'],
        'connect-src': [SELF, ...connectOrigins],
        'worker-src': [SELF],
        'manifest-src': [SELF],
        'object-src': [NONE],
        'base-uri': [SELF],
        'form-action': [SELF],
        // Only effective as a header (a <meta> CSP ignores it), which is why this lives here.
        'frame-ancestors': [NONE]
    };
    return Object.entries(directives)
        .map(([name, sources]) => `${name} ${unique(sources).join(' ')}`)
        .join('; ');
};

export const buildSecurityHeaders = (input: PolicyInput): Record<string, string> => ({
    'Content-Security-Policy': buildContentSecurityPolicy(input),
    // No `preload`: submitting a domain to the browsers' preload list is hard to undo, so it stays an
    // explicit decision of whoever owns the domain.
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    // `same-origin` also cuts `window.opener` for OAuth popups; use `same-origin-allow-popups` if
    // the app signs in through one.
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Legacy twin of `frame-ancestors 'none'` for browsers that predate CSP level 2.
    'X-Frame-Options': 'DENY'
});

/** Netlify / Cloudflare Pages `_headers` syntax: a path rule, then indented `Name: value` lines. */
export const renderHeadersFile = (headers: Record<string, string>): string =>
    `/*\n${Object.entries(headers)
        .map(([name, value]) => `  ${name}: ${value}`)
        .join('\n')}\n`;

const headersFor = (distDir: string, apiUrl: string | undefined): Record<string, string> => {
    const html = readFileSync(join(distDir, 'index.html'), 'utf8');
    const origin = apiOrigin(apiUrl);
    return buildSecurityHeaders({
        scriptHashes: inlineScriptHashes(html),
        connectOrigins: origin ? [origin] : []
    });
};

export const securityHeaders = (): Plugin => {
    let distDir = '';
    let isBuild = false;
    let apiUrl: string | undefined;

    return {
        name: 'security-headers',
        // No `apply`: the plugin must stay in the pipeline for `vite preview` as well as for the build.
        configResolved(config) {
            distDir = resolve(config.root, config.build.outDir);
            isBuild = config.command === 'build';
            const configured: unknown = config.env.VITE_API_URL;
            apiUrl = typeof configured === 'string' && configured !== '' ? configured : undefined;
        },
        // After every other plugin has written `index.html`, so the hashes are those of the shipped file.
        closeBundle() {
            if (!isBuild) return;
            const file = renderHeadersFile(headersFor(distDir, apiUrl));
            writeFileSync(join(distDir, '_headers'), file);
        },
        configurePreviewServer(server) {
            server.middlewares.use((_req, res, next) => {
                // Read per request: a rebuild under a running preview changes the inline-script hash.
                for (const [name, value] of Object.entries(headersFor(distDir, apiUrl))) {
                    res.setHeader(name, value);
                }
                next();
            });
        }
    };
};
