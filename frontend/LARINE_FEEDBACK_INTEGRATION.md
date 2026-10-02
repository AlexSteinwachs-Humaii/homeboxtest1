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

The association bootstrap is now implemented by story 2 at the Go HTML-serving boundary, ahead of every head script. The widget itself remains uninstalled pending the prerequisites above.

## Verification performed in this attempt

- Queue branch fetch and merge: already up to date; no conflicts.
- Initial focused Vitest attempt failed with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "vitest" not found` because dependencies were absent.
- `cd frontend && pnpm install --frozen-lockfile`: passed, including `nuxt prepare`; existing duplicate-component warnings were emitted.
- `cd frontend && pnpm exec vitest --run --config ./test/vitest.config.ts lib/passwords/index.test.ts lib/datelib/dateOnly.test.ts`: passed, 2 files / 16 tests. These are baseline tests, not widget verification.
- No application code changed, so a widget build and browser acceptance walk are not claimed. Widget loading, Cmd/Ctrl+Shift+F activation, and actual feedback submission remain unverified pending the prerequisites above.

## Story 2: independent runtime associations

`backend/app/api/larine_context.go` reads the unprefixed server environment at router creation:

- `LARINE_ACTIVE_WORK_ITEM_ID` → `window.__LARINE_ACTIVE_WORK_ITEM_ID__`
- `LARINE_STATEMENT_ID` → `window.__LARINE_STATEMENT_ID__`

Set either, both, or neither before starting the Go backend; restart it to change context. The Work Item value must be the **canonical Work Item projection ID** supplied by delivery configuration. HomeBox cannot resolve Larine identities and does not convert native Enhancement IDs, derive context from a Statement, or read legacy Enhancement variables. These IDs are browser-visible deployment-wide context, not per-user HomeBox records.

`staticPageHandler` in `backend/app/api/routes.go` injects a synchronous inline script as the first child of the generated HTML head, for directly served HTML and SPA route fallbacks. Blank/whitespace-only or unset values produce no assignment; with neither present, the HTML is unchanged. Go `json.Marshal` string serialization preserves values while escaping HTML metacharacters (including script termination), quotes, control characters and JS line separators. No Vite placeholders or new widget/token implementation are introduced.

HTML responses use `Cache-Control: no-store`. Nuxt PWA configuration excludes HTML from precaching and removes the cached navigation fallback to prevent stale launch context; offline app-shell navigation is no longer supported. Existing installed service workers need to update before this behavior takes effect. Serving `.output/public` directly (including Nuxt dev/static preview) bypasses Go runtime injection and is not a context-enabled deployment.

Focused Go regression tests cover independent combinations, empty/unset values, hostile serialization, initialization order, direct HTML, SPA fallback and untouched JS assets. Submission/persisted associations are **not yet verified**, because the widget script is absent (see story 1 prerequisites).

### Story 2 verification

- `cd frontend && pnpm run build`: passed; existing duplicate-component, circular-chunk and chunk-size warnings emitted. Generated service worker has no HTML precache entries or navigation fallback.
- `cd frontend && pnpm exec eslint nuxt.config.ts`: passed.
- `cd frontend && pnpm exec vitest --run --config ./test/vitest.config.ts lib/passwords/index.test.ts lib/datelib/dateOnly.test.ts`: passed, 2 files / 16 baseline tests (not association tests).
- `cd backend && go test ./app/api -run 'Test(LarineContext|StaticPageLarineContext)' -count=1`: could not run, `/bin/sh: 1: go: not found` (exit 127).
- `cd backend && go build ./app/api`: could not run, `/bin/sh: 1: go: not found` (exit 127).
- Go toolchain download attempts from go.dev and proxy.golang.org returned HTTP 403. `apt-get update && apt-get install -y golang-go` also failed with HTTP 403 for Debian repositories. Go tests/build must be run in a Go 1.26-enabled environment; no backend success is claimed.
- `git diff --check`: passed.
