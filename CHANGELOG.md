# Changelog

## [3.2.1](https://github.com/Vadymk95/template-spa-pwa/compare/v3.2.0...v3.2.1) (2026-09-13)


### Bug fixes

* **gate:** give the push budget a recency window so it can recover ([6d5eb4a](https://github.com/Vadymk95/template-spa-pwa/commit/6d5eb4a3477685160a02d27767a78074245dbb0f))
* **gate:** let release-please own the changelog format instead of the checker ([669b361](https://github.com/Vadymk95/template-spa-pwa/commit/669b361916ca636fc10dadc0b330fe84dc8815d8))
* **gate:** make eslint blind to an agent worktree inside the repository ([0a89774](https://github.com/Vadymk95/template-spa-pwa/commit/0a897744ca44f4b1de0e146756b1bac4247aba3e))
* **gate:** the push budget calibrates to the machine it runs on, not to mine ([#50](https://github.com/Vadymk95/template-spa-pwa/issues/50)) ([26d1679](https://github.com/Vadymk95/template-spa-pwa/commit/26d16791e53c0b9a3ee2f4806585c152e8bf5848))


### Documentation

* **agents:** say what a fork does NOT inherit, because settings do not travel ([#51](https://github.com/Vadymk95/template-spa-pwa/issues/51)) ([e9a267d](https://github.com/Vadymk95/template-spa-pwa/commit/e9a267dc3fcaf4bf4fece6fd5b48aea5e302841e))


### CI

* **deps:** bump googleapis/release-please-action in the actions group ([#49](https://github.com/Vadymk95/template-spa-pwa/issues/49)) ([652006d](https://github.com/Vadymk95/template-spa-pwa/commit/652006df4f2f96800426cac58d9059b02a785a19))

## [3.2.0](https://github.com/Vadymk95/template-spa-pwa/compare/v3.1.0...v3.2.0) (2026-09-13)


### Features

* **docs-check:** focused tests never land; an unconditional skip carries a dated quarantine ([8305dd7](https://github.com/Vadymk95/template-spa-pwa/commit/8305dd796f2b57e2185a9df4097742d3b4568cd1))
* **gate:** docs:check in a docs class; the tracer records the phase ([a3c3fc4](https://github.com/Vadymk95/template-spa-pwa/commit/a3c3fc43ed46876baec535d836eb1f097570893e))
* **gate:** the browser suite has a ceiling in the tier data; push budgets are per phase ([6887428](https://github.com/Vadymk95/template-spa-pwa/commit/6887428e930742f3208a24abb1193e9dd17bf4ae))
* **home:** the start page shows what is inside, how work flows and the agent commands ([ca9327a](https://github.com/Vadymk95/template-spa-pwa/commit/ca9327a72468aa06f47f8971375e9ad3784f7b31))


### Bug fixes

* **docs-check:** module references, attached rules, script families; verify:* in the law ([21e613a](https://github.com/Vadymk95/template-spa-pwa/commit/21e613a54f1fc7a1770ebfb5184207456d64d523))
* **home:** code chips keep their own foreground, contrast inside muted copy ([649ff26](https://github.com/Vadymk95/template-spa-pwa/commit/649ff266aaf0367d991beffc9d99534da09d86f5))
* **ports:** the probe answers what its callers ask, IPv6 loopback included ([dc532f5](https://github.com/Vadymk95/template-spa-pwa/commit/dc532f5e9d690e4bfa61adaab1d85e29126c7a09))
* **release:** the bootstrap sha must be the full 40 chars, or it never matches ([219450c](https://github.com/Vadymk95/template-spa-pwa/commit/219450c7d2d36fff4617a313d8aec5c465e2e40a))
* **theme:** the theme is applied before the first paint; the scrollbar keeps its gutter ([544a309](https://github.com/Vadymk95/template-spa-pwa/commit/544a3091e999afbb42a3b50abbd6f3f8de43c5ed))


### Build and dependencies

* **deps:** size-limit measures files only; the time plugin and estimo leave the tree ([488a89a](https://github.com/Vadymk95/template-spa-pwa/commit/488a89a68fda4a23d4cc2d416c910b0aee94b2aa))


### Maintenance

* **deps:** in-range update; the 3-day cooldown lifted once by operator decision ([69b74c1](https://github.com/Vadymk95/template-spa-pwa/commit/69b74c1b267998cd90517342c4ca8a8ec780cdb6))
* **size:** entry budget re-measured after zod 4.6 grew it by 1.5 kB brotli ([739e556](https://github.com/Vadymk95/template-spa-pwa/commit/739e5561a9b526cf96ea7c30eb965ecbd52f5598))


### Documentation

* **brain:** fold enterprise-upgrade into EXTENSIONS.md; port suites bind ephemeral ports ([3b7869a](https://github.com/Vadymk95/template-spa-pwa/commit/3b7869ae6fdedd28eec18cac563d07301e028585))


### CI

* **release:** release-please keeps a release PR with the version, changelog and tag ([d93d423](https://github.com/Vadymk95/template-spa-pwa/commit/d93d4233eaee9dd5d8c21c26a2ad9f3bb73e9166))
