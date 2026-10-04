import { describe, expect, it } from 'vitest';

import { exampleKeys } from '@/lib/api/_example.queries';
import { greetingKeys } from '@/lib/api/greeting.queries';

import { queryKeys } from './queryKeys';

// Each domain mapped to the factory its OWN module exports. A new domain is registered
// deliberately: whoever adds a factory to `queryKeys` adds it here too.
const OWN_FACTORIES = {
    example: exampleKeys,
    greeting: greetingKeys
} as const;

const domains = Object.keys(OWN_FACTORIES) as (keyof typeof OWN_FACTORIES)[];

describe('queryKeys', () => {
    it('registers exactly the known domains', () => {
        expect(Object.keys(queryKeys).sort()).toEqual([...domains].sort());
    });

    it.each(domains)('re-exports the %s factory itself, not a copy', (domain) => {
        expect(queryKeys[domain]).toBe(OWN_FACTORIES[domain]);
    });
});
