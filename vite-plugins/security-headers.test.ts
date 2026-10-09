import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    apiOrigin,
    buildContentSecurityPolicy,
    buildSecurityHeaders,
    inlineScriptHashes,
    renderHeadersFile,
    securityHeaders
} from './security-headers';
import { API_DEFAULT_URL } from '../src/lib/constants.ts';

const sha256 = (text: string): string =>
    `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** `directive -> tokens`, so a case can assert on one directive without matching the whole string. */
const parseCsp = (csp: string): Record<string, string[]> =>
    Object.fromEntries(
        csp.split(';').map((part) => {
            const [name = '', ...tokens] = part.trim().split(/\s+/);
            return [name, tokens];
        })
    );

const INPUT = {
    scriptHashes: ["'sha256-AAAA'"],
    connectOrigins: ['https://api.example.com']
};

describe('inlineScriptHashes', () => {
    it('hashes the exact text of an inline script', () => {
        const body = 'console.log("inline")';
        expect(inlineScriptHashes(`<script>${body}</script>`)).toEqual([sha256(body)]);
    });

    it('hashes an inline module script too', () => {
        const body = 'import "/x.js";';
        expect(inlineScriptHashes(`<script type="module">${body}</script>`)).toEqual([
            sha256(body)
        ]);
    });

    it('skips scripts that load from a URL and empty scripts', () => {
        const html =
            '<script src="/theme-boot.js"></script><script type="module" src="/a.js"></script><script> </script>';
        expect(inlineScriptHashes(html)).toEqual([]);
    });

    it('returns each distinct script once', () => {
        const html = '<script>a()</script><script>b()</script><script>a()</script>';
        expect(inlineScriptHashes(html)).toEqual([sha256('a()'), sha256('b()')]);
    });
});

describe('apiOrigin', () => {
    it('keeps the origin and drops the path', () => {
        expect(apiOrigin('https://api.example.com/v1/api')).toBe('https://api.example.com');
        expect(apiOrigin('http://localhost:3001/api')).toBe('http://localhost:3001');
    });

    it('falls back to the client default when the variable is unset', () => {
        expect(apiOrigin(undefined)).toBe(new URL(API_DEFAULT_URL).origin);
    });

    it('returns nothing for a value that is not a URL', () => {
        expect(apiOrigin('not a url')).toBeUndefined();
    });
});

describe('buildContentSecurityPolicy', () => {
    const csp = parseCsp(buildContentSecurityPolicy(INPUT));

    it.each([
        ['default-src', ["'self'"]],
        ['object-src', ["'none'"]],
        ['base-uri', ["'self'"]],
        ['form-action', ["'self'"]],
        ['frame-ancestors', ["'none'"]],
        ['worker-src', ["'self'"]],
        ['manifest-src', ["'self'"]],
        ['style-src', ["'self'"]]
    ])('%s is exactly %j', (directive, tokens) => {
        expect(csp[directive]).toEqual(tokens);
    });

    it('allows own scripts and the hashed inline ones, nothing else', () => {
        expect(csp['script-src']).toEqual(["'self'", "'sha256-AAAA'"]);
    });

    it('allows the API origin next to our own for fetches', () => {
        expect(csp['connect-src']).toEqual(["'self'", 'https://api.example.com']);
    });

    it('allows data: only for images and fonts (small assets are inlined by the build)', () => {
        const withData = Object.entries(csp)
            .filter(([, tokens]) => tokens.includes('data:'))
            .map(([name]) => name);
        expect(withData).toEqual(['img-src', 'font-src']);
    });

    it('never opens a directive with unsafe-*, a wildcard or a scheme-wide source', () => {
        const tokens = Object.values(csp).flat();
        expect(tokens.filter((token) => /unsafe-|^\*$|^https?:$/.test(token))).toEqual([]);
    });

    it('does not force https, so an http localhost run still works', () => {
        expect(csp).not.toHaveProperty('upgrade-insecure-requests');
    });

    it('lists no hash when the page has no inline script', () => {
        const bare = parseCsp(buildContentSecurityPolicy({ ...INPUT, scriptHashes: [] }));
        expect(bare['script-src']).toEqual(["'self'"]);
    });
});

describe('buildSecurityHeaders', () => {
    const headers = buildSecurityHeaders(INPUT);

    it('carries the CSP built from the same input', () => {
        expect(headers['Content-Security-Policy']).toBe(buildContentSecurityPolicy(INPUT));
    });

    it('sends HSTS for a year with subdomains and without the preload opt-in', () => {
        const value = headers['Strict-Transport-Security'];
        expect(value).toMatch(/max-age=31536000(;|$)/);
        expect(value).toContain('includeSubDomains');
        expect(value).not.toContain('preload');
    });

    it('stops MIME sniffing', () => {
        expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('limits what the Referer header leaks', () => {
        expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('switches off the powerful features the app does not use', () => {
        const value = headers['Permissions-Policy'];
        for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
            expect(value).toContain(`${feature}=()`);
        }
    });

    it('isolates the browsing context group', () => {
        expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    });

    it('keeps the legacy framing header next to frame-ancestors', () => {
        expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('ships exactly this set, so a header cannot be dropped or added unnoticed', () => {
        expect(Object.keys(headers).sort()).toEqual(
            [
                'Content-Security-Policy',
                'Cross-Origin-Opener-Policy',
                'Permissions-Policy',
                'Referrer-Policy',
                'Strict-Transport-Security',
                'X-Content-Type-Options',
                'X-Frame-Options'
            ].sort()
        );
    });
});

describe('renderHeadersFile', () => {
    const file = renderHeadersFile(buildSecurityHeaders(INPUT));
    const lines = file.trimEnd().split('\n');

    it('puts every header under one `/*` rule, indented', () => {
        expect(lines[0]).toBe('/*');
        expect(lines.slice(1).every((line) => /^ {2}[A-Za-z-]+: \S/.test(line))).toBe(true);
        expect(file.endsWith('\n')).toBe(true);
    });

    it('round-trips every header', () => {
        const parsed = Object.fromEntries(
            lines.slice(1).map((line) => {
                const [name = '', ...value] = line.trim().split(': ');
                return [name, value.join(': ')];
            })
        );
        expect(parsed).toEqual(buildSecurityHeaders(INPUT));
    });

    // 2000 is the per-line cap as remembered from Cloudflare's docs, not re-checked: treat it as a budget.
    it('keeps each line under 2000 characters, however many inline scripts add a hash', () => {
        const many = Array.from(
            { length: 20 },
            (_, i) => `'sha256-${String(i).padStart(44, 'x')}'`
        );
        const long = renderHeadersFile(buildSecurityHeaders({ ...INPUT, scriptHashes: many }));
        expect(Math.max(...long.split('\n').map((line) => line.length))).toBeLessThan(2000);
    });
});

describe('securityHeaders plugin', () => {
    const INLINE = 'self.__sw = 1';
    let root: string;

    const writeIndex = (script: string): void => {
        writeFileSync(
            join(root, 'dist', 'index.html'),
            `<!doctype html><head><script src="/theme-boot.js"></script><script>${script}</script></head>`
        );
    };

    /** Vite types its hooks as `fn | { handler }`; ours are plain functions, so a call site is one cast. */
    const resolveConfig = (
        plugin: ReturnType<typeof securityHeaders>,
        command: 'build' | 'serve',
        env: Record<string, string> = {}
    ): void => {
        (plugin.configResolved as unknown as (config: unknown) => void)({
            root,
            command,
            build: { outDir: 'dist' },
            env
        });
    };

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'security-headers-'));
        mkdirSync(join(root, 'dist'));
        writeIndex(INLINE);
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('writes dist/_headers at build time, with the hash of the inline script as built', () => {
        const plugin = securityHeaders();
        resolveConfig(plugin, 'build', { VITE_API_URL: 'https://api.example.com/v1' });

        (plugin.closeBundle as unknown as () => void)();

        const file = readFileSync(join(root, 'dist', '_headers'), 'utf8');
        expect(file).toContain(sha256(INLINE));
        expect(file).toContain('https://api.example.com');
        expect(file).not.toContain('/v1');
    });

    it('writes the same bytes the preview server would send', () => {
        const plugin = securityHeaders();
        resolveConfig(plugin, 'build');
        (plugin.closeBundle as unknown as () => void)();
        const written = readFileSync(join(root, 'dist', '_headers'), 'utf8');

        const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
        const expected = renderHeadersFile(
            buildSecurityHeaders({
                scriptHashes: inlineScriptHashes(html),
                connectOrigins: [new URL(API_DEFAULT_URL).origin]
            })
        );
        expect(written).toBe(expected);
    });

    it('writes nothing while the dev server runs', () => {
        const plugin = securityHeaders();
        resolveConfig(plugin, 'serve');

        (plugin.closeBundle as unknown as () => void)();

        expect(() => readFileSync(join(root, 'dist', '_headers'))).toThrow();
    });

    it('sets every shipped header on a preview response, COOP included, and follows a rebuilt index.html', () => {
        const plugin = securityHeaders();
        resolveConfig(plugin, 'serve');
        let middleware: ((req: unknown, res: unknown, next: () => void) => void) | undefined;
        (plugin.configurePreviewServer as unknown as (server: unknown) => void)({
            middlewares: {
                use: (fn: typeof middleware) => {
                    middleware = fn;
                }
            }
        });

        const respond = (): { headers: Record<string, string>; next: ReturnType<typeof vi.fn> } => {
            const headers: Record<string, string> = {};
            const next = vi.fn();
            middleware?.(
                {},
                { setHeader: (name: string, value: string) => (headers[name] = value) },
                next
            );
            return { headers, next };
        };

        const first = respond();
        expect(first.next).toHaveBeenCalledOnce();
        const shipped = buildSecurityHeaders({
            scriptHashes: [sha256(INLINE)],
            connectOrigins: [new URL(API_DEFAULT_URL).origin]
        });
        expect(first.headers).toEqual(shipped);
        expect(first.headers['Cross-Origin-Opener-Policy']).toBe('same-origin');

        writeIndex('self.__sw = 2');
        expect(respond().headers['Content-Security-Policy']).toContain(sha256('self.__sw = 2'));
    });
});
