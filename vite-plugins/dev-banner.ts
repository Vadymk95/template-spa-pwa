import { execSync } from 'node:child_process';

import type { Plugin } from 'vite';

import pkg from '../package.json' with { type: 'json' };

interface BannerOptions {
    /** Disables the banner — useful when running in CI or non-TTY environments. */
    disabled?: boolean;
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

const safeExec = (cmd: string): string | null => {
    try {
        return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return null;
    }
};

const flagState = (raw: string | undefined, fallback: 'on' | 'off'): string => {
    const truthy = raw === 'true' || raw === '1' || raw === 'yes';
    const falsy = raw === 'false' || raw === '0' || raw === 'no';
    if (truthy) return green('on');
    if (falsy) return yellow('off');
    return fallback === 'on' ? green('on (default)') : yellow('off (default)');
};

/**
 * Dev-server banner — minimal, single-print on `vite dev` startup.
 *
 * Shows project identity (name + version), runtime versions (Node + Vite),
 * mode, and active env flags (MSW, web-vitals attribution). Stays under 8 lines
 * so it doesn't push useful Vite output (URLs, HMR ready) off-screen.
 *
 * Disabled in CI / non-TTY by default to keep logs clean. Set
 * `VITE_DEV_BANNER=false` to silence locally.
 */
export const devBanner = (options: BannerOptions = {}): Plugin => {
    return {
        name: 'dev-banner',
        apply: 'serve',
        configureServer(server) {
            if (options.disabled || process.env.VITE_DEV_BANNER === 'false') return;

            const printOnce = () => {
                const env = server.config.env as Record<string, string | undefined>;
                const mswFlag = flagState(env.VITE_ENABLE_MSW, 'off');
                const wvFlag = flagState(env.VITE_WEB_VITALS_ATTRIBUTION, 'off');

                const node = process.version;
                const vitePkgVersion =
                    safeExec('node -p "require(\'vite/package.json\').version"') ?? 'unknown';

                const branch = safeExec('git rev-parse --abbrev-ref HEAD') ?? '—';
                const sha = safeExec('git rev-parse --short HEAD') ?? '—';

                const lines = [
                    '',
                    `${bold(cyan(pkg.name))} ${dim('v' + pkg.version)} ${dim('· branch ' + branch + ' @ ' + sha)}`,
                    `${dim('node')} ${node}  ${dim('vite')} ${vitePkgVersion}  ${dim('mode')} ${server.config.mode}`,
                    `${dim('flags')} msw=${mswFlag}  web-vitals-attribution=${wvFlag}`,
                    ''
                ];
                // eslint-disable-next-line no-console
                console.log(lines.join('\n'));
            };

            // Print after Vite's own ready-banner so it doesn't get clobbered.
            const originalPrintUrls = server.printUrls.bind(server);
            server.printUrls = () => {
                originalPrintUrls();
                printOnce();
            };
        }
    };
};
