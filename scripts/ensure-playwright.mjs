#!/usr/bin/env node
// Skip `npx playwright install --with-deps chromium` when the browser is
// already cached. Saves 3-5 min on every `ci:local` invocation after the
// first; `--with-deps` itself is mostly a no-op on macOS but the network
// "is up to date" probe still fires.
//
// On a fresh runner (clean GH Actions cache), this script falls through to
// the install command — same end state as the unconditional version.

import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const explicit = process.env.PLAYWRIGHT_BROWSERS_PATH;
const cacheDir =
    explicit ??
    (platform() === 'darwin'
        ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
        : platform() === 'win32'
          ? join(homedir(), 'AppData', 'Local', 'ms-playwright')
          : join(homedir(), '.cache', 'ms-playwright'));

const hasChromium =
    existsSync(cacheDir) && readdirSync(cacheDir).some((d) => d.startsWith('chromium'));

if (hasChromium) {
    console.log(`✓ playwright chromium cached at ${cacheDir} — skipping install`);
    process.exit(0);
}

console.log(`→ playwright chromium not in ${cacheDir} — installing…`);
execSync('npx playwright install --with-deps chromium', { stdio: 'inherit' });
