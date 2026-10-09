# Security Requirements · Production Deployment Checklist

This document describes the **security headers and Content-Security-Policy the template ships**, how to adapt them, and what must be true before going live. The defaults apply regardless of your hosting platform; the recipes below cover hosts that do not read the generated file.

> **⚠️ CRITICAL:** The headers are only a default until the host actually sends them. Netlify and Cloudflare Pages pick up `dist/_headers` on their own; every other host needs the [recipe below](#-hosting-recipes). This checklist must be completed before going live.

## 📜 What ships

One module is the source of truth: [`vite-plugins/security-headers.ts`](vite-plugins/security-headers.ts).

| Header                         | Value                                                          | Purpose                                               |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------- |
| **Content-Security-Policy**    | See the table below                                            | XSS and injection prevention                          |
| **Strict-Transport-Security**  | `max-age=31536000; includeSubDomains`                          | Protection against MITM attacks (no `preload`, below) |
| **X-Content-Type-Options**     | `nosniff`                                                      | MIME-type sniffing protection                         |
| **Referrer-Policy**            | `strict-origin-when-cross-origin`                              | Controls referrer info in requests                    |
| **Permissions-Policy**         | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Restrict browser feature access                       |
| **Cross-Origin-Opener-Policy** | `same-origin`                                                  | Isolates the browsing context group                   |
| **X-Frame-Options**            | `DENY`                                                         | Legacy twin of `frame-ancestors 'none'`               |

> **Note on `X-XSS-Protection`:** This header is **deprecated** and must not be set. It was removed from modern browsers (Chrome 78+) and can introduce vulnerabilities in legacy browsers. CSP is the correct defense against XSS.

The policy allows exactly what the app needs and nothing else. There is no `'unsafe-inline'` and no `'unsafe-eval'` (zod 4 probes for JIT with `new Function`, which a policy without `'unsafe-eval'` reports, so `src/env.ts` sets `z.config({ jitless: true })` instead of loosening the policy):

| Directive                    | Sources                   | Why                                                                                                                                                                                  |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-src`                | `'self'`                  | Everything not listed below is same-origin only                                                                                                                                      |
| `script-src`                 | `'self'` + `'sha256-…'`   | The hash is that of the one inline script the build injects (the service-worker registration)                                                                                        |
| `style-src`                  | `'self'`                  | The build emits CSS files; React `style` props go through CSSOM, which a CSP does not block                                                                                          |
| `img-src`, `font-src`        | `'self'`, `data:`         | Assets under `assetsInlineLimit` are inlined as `data:` URIs                                                                                                                         |
| `connect-src`                | `'self'` + the API origin | The origin of `VITE_API_URL` at build time, or the client default when it is unset                                                                                                   |
| `worker-src`, `manifest-src` | `'self'`                  | The service worker and the web manifest                                                                                                                                              |
| `object-src`                 | `'none'`                  | No plugins                                                                                                                                                                           |
| `base-uri`, `form-action`    | `'self'`                  | Blocks an injected `<base>` or form posting elsewhere                                                                                                                                |
| `frame-ancestors`            | `'none'`                  | Clickjacking. Only works as a header; a `<meta>` CSP ignores it ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)) |

### How the headers reach the browser

- **Build:** `dist/_headers` is written after the bundle is final. The inline-script hash is computed from the shipped `dist/index.html`, so it cannot drift from the page.
- **`vite preview`:** every shipped header, so the e2e run exercises the policy a host would apply. Playwright's Firefox loses navigations intermittently under COOP, so the `firefox` project turns off Firefox's COOP process swap (`firefoxUserPrefs` in `playwright.config.ts`); the header is still sent (measurement and lift condition: SKELETONS.md, "The Firefox test project turns off Firefox's COOP process swap").
- **Dev server:** no policy. Vite HMR needs inline scripts and a websocket, and the dev-only MSW worker would force a hole into the production policy. The policy is verified on the production build instead.

### What guards it

- `vite-plugins/security-headers.test.ts` fails when a header, a directive or the `_headers` format changes (a line over 2000 characters is rejected by Cloudflare Pages).
- `e2e/support/fixtures.ts` makes every preview spec fail when the page raises a Content-Security-Policy violation, as a console message or as a `securitypolicyviolation` event (Chromium raises some violations only as the event). ESLint forbids importing `test` from `@playwright/test` in `e2e/*.spec.ts`, so a spec cannot opt out by accident.
- `e2e/security-headers.spec.ts` compares what the preview serves with `dist/_headers`; it fails if the plugin is dropped from `vite.config.ts`.

## 🔧 Adapting it

- **API origin:** set `VITE_API_URL` for the production build; `connect-src` follows it. Left unset, the policy allows the default `http://localhost:3001` and a production page fetching its API elsewhere is blocked.
- **A third-party origin** (analytics, payments, a CDN): add it to the matching directive in `buildContentSecurityPolicy` (for example the analytics host in both `script-src` and `connect-src`) and update the exact-token assertions in the test next to it. Prefer a specific origin to a scheme or a wildcard.
- **Inline scripts:** keep them out of `index.html` (`public/theme-boot.js` is external for this reason). One that does land there is hashed at build, so it still runs, but every edit to it changes the hash.
- **A library that injects `<style>` elements** is blocked by `style-src 'self'`. The e2e run fails with the violation; move the styles into a CSS file or allow that library's hash, not `'unsafe-inline'`.
- **HSTS `preload`:** not shipped. Submitting a domain to the browsers' preload list is hard to undo, and `includeSubDomains` already means every subdomain must serve HTTPS. Add `; preload` in the module only when the domain owner has decided to submit it.
- **COOP and OAuth popups:** `same-origin` cuts `window.opener`. If sign-in runs in a popup, loosen it to `same-origin-allow-popups`.

## 🚀 Hosting recipes

**Netlify, Cloudflare Pages:** nothing to configure. Both read `_headers` from the published directory, and the build writes `dist/_headers`.

**Vercel** does not read `_headers`. Generate the `headers` block from the built file and merge it into `vercel.json`:

```sh
node -e "const fs=require('fs');const rows=fs.readFileSync('dist/_headers','utf8').split('\n').filter((l)=>/^\s+\S/.test(l)).map((l)=>{const t=l.trim();const i=t.indexOf(': ');return {key:t.slice(0,i),value:t.slice(i+2)};});process.stdout.write(JSON.stringify({headers:[{source:'/(.*)',headers:rows}]},null,4)+'\n');"
```

The output has this shape:

```json
{
    "headers": [
        {
            "source": "/(.*)",
            "headers": [
                { "key": "Content-Security-Policy", "value": "default-src 'self'; ..." },
                {
                    "key": "Strict-Transport-Security",
                    "value": "max-age=31536000; includeSubDomains"
                }
            ]
        }
    ]
}
```

**nginx:** generate an include from the built file and reference it in the `server` block:

```sh
awk 'NR>1 { sub(/^  /,""); i=index($0,": "); printf "add_header %s \"%s\" always;\n", substr($0,1,i-1), substr($0,i+2) }' dist/_headers > security-headers.conf
```

```nginx
server {
    include /etc/nginx/security-headers.conf;
}
```

nginx drops inherited `add_header` lines in any `location` that sets its own, so repeat the `include` there.

**Any other host:** copy the `/*` block of `dist/_headers`.

**Regenerate on every deploy.** The CSP carries the hash of the inline script, which changes whenever the service-worker setup does (a `vite-plugin-pwa` upgrade, a `vite.config.ts` PWA change). A copy pinned in host configuration goes stale and the browser then blocks the registration script.

## 🔑 Session, tokens and money

- **The session token lives in an `HttpOnly; Secure; SameSite=Lax` cookie set by the server.** The app never reads it and never stores it: no `localStorage`, no `sessionStorage`, no in-memory copy handed around. Identity comes from an endpoint (`GET /me`-shaped), never from parsing a cookie. The shipped login demo (`userStore` + `apiClient`, a showcase: `examples/auth-bearer-pattern/README.md`) does not follow this yet: it keeps a bearer token in memory only, never in storage, and `apiClient` sends it as `Authorization: Bearer`; replace it with this cookie model when you wire real auth (`.cursor/brain/EXTENSIONS.md` Phase 2).
- **Across apps the cookie is the contract, not a store.** When this app runs under a path of a larger product (one reverse proxy, `/app/*` per app), the cookie scope (`Domain`, `Path`) is all that is shared. No common Redux/Zustand store across apps; cross-app signals go through a versioned `CustomEvent` on `window`.
- **Thin client, no client-side pricing.** The client never computes, corrects or submits a price, discount or total it derived itself; it sends an intent or an id and renders what the server returns. Money is validated on the server; the boundary adapter (`.cursor/rules/api.mdc`) parses the response once.
- **Third-party scripts** (payments, analytics) load only from origins listed in the CSP (add them in `vite-plugins/security-headers.ts`, see [Adapting it](#-adapting-it)), never with `'unsafe-inline'`.

## ✅ Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] The host sends the headers: `_headers` is read (Netlify, Cloudflare Pages) or the recipe above is wired (Vercel, nginx, other)
- [ ] The host copy was regenerated from the current build (the CSP hash matches `dist/index.html`)
- [ ] `X-XSS-Protection` is **NOT set** (deprecated, potentially harmful)
- [ ] `VITE_API_URL` was set for the production build, so `connect-src` allows the real API origin and not the localhost default
- [ ] Every third-party origin the app uses is listed in the CSP, and nothing else is
- [ ] Every subdomain of the domain serves HTTPS (HSTS ships with `includeSubDomains`)
- [ ] `preload` was added to HSTS only if the domain owner decided to submit the domain
- [ ] Security headers are tested on the deployed URL (use [Security Headers Scanner](https://securityheaders.com/))
- [ ] No token in `localStorage` / `sessionStorage` (grep the production bundle for both)
- [ ] No price arithmetic in `src/` (money arrives computed from the server)

## 🔗 Resources

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP: Security Headers](https://owasp.org/www-project-secure-headers/)
- [MDN: X-XSS-Protection (deprecated)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection)
- [Security Headers Scanner](https://securityheaders.com/)

---

**Remember:** Security is not a one-time setup. Regularly audit and update your security configurations as your application evolves.
