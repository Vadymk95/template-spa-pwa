import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// `process.cwd()` rather than `import.meta.url`: under Vitest the module URL is not a `file:` URL.
const config = () => readFileSync(join(process.cwd(), 'vitest.config.ts'), 'utf8');

describe('vitest.config.ts', () => {
    // Vitest allows a focused test (`it.only`) everywhere except CI, so a local push could carry
    // one: the rest of the suite is skipped and the run still exits 0. The option is read as text
    // because vitest.config.ts sits outside every tsconfig project this `.mjs` could import it from.
    it('refuses a focused test regardless of CI', () => {
        expect(config()).toMatch(/^\s*allowOnly:\s*false,/m);
    });
});
