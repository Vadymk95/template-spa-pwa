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

    // Vitest keeps a mock's calls and its implementation from one test to the next by default, so a
    // call count or a stubbed return asserted in one test carries into the next and the order of the
    // tests decides a verdict. Read as text for the same reason as the option above.
    it('resets every mock before each test', () => {
        expect(config()).toMatch(/^\s*mockReset:\s*true,/m);
    });
});
