# Larine feedback widget: implementation prerequisite

Status: story 1 is **not implemented**. No widget script, placeholder token, or guessed token attribute has been added.

## Verified frontend integration point

- `nuxt.config.ts` sets `ssr: false`. This is a client-only Nuxt application, not the server-rendered frontend assumed in the original planning notes.
- `package.json` builds with `nuxt generate`; deployment serves generated static HTML.
- `app.head.script` in `nuxt.config.ts` already includes `/set-theme.js` and is the shared HTML script entry. A verified widget integration belongs here rather than in individual pages or layouts.
- `app.vue` wraps `NuxtPage` in the shared layout. Page navigation should not reinstall the widget.
- No Vite replacement syntax is needed. Static generation means any build-provisioned script attributes must be supplied when generating the frontend, not merely when starting the backend.

## Required before changing the shared script entry

1. Supply the actual HomeBox - Test 1 product widget API token through the approved secure delivery channel. Do not paste it into chat, review notes, test fixtures, or tracked documentation. The widget requires a browser-visible token; it must not be a privileged server API credential.
2. Supply the authoritative integration contract or restore access to the published widget script so the supported token attribute can be verified. Requests to `https://next.larine.dev/larine-feedback.js`, both normally and with a browser user agent, returned `HTTP 403 Forbidden` in this sandbox.

The sandbox environment contained no variable names matching `LARINE`, `WIDGET`, or `TOKEN`. Repository inspection found no existing Larine widget integration. A token cannot be fabricated from the product ID.

Once provisioned, include the verified script once through Nuxt's shared head with:

- `src`: `https://next.larine.dev/larine-feedback.js`
- the verified token attribute containing the actual provisioned product widget token
- `data-enabled`: `always`
- `data-shortcut`: `mod+shift+f`
- `data-source`: `HomeBox - Test 1`
- no domain restriction

Coordinate initialization order with the later association-bootstrap story. This story does not implement Work Item or Statement associations.

## Verification performed in this attempt

- Queue branch fetch and merge: already up to date; no conflicts.
- Initial focused Vitest attempt failed with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "vitest" not found` because dependencies were absent.
- `cd frontend && pnpm install --frozen-lockfile`: passed, including `nuxt prepare`; existing duplicate-component warnings were emitted.
- `cd frontend && pnpm exec vitest --run --config ./test/vitest.config.ts lib/passwords/index.test.ts lib/datelib/dateOnly.test.ts`: passed, 2 files / 16 tests. These are baseline tests, not widget verification.
- No application code changed, so a widget build and browser acceptance walk are not claimed. Widget loading, Cmd/Ctrl+Shift+F activation, and actual feedback submission remain unverified pending the prerequisites above.
