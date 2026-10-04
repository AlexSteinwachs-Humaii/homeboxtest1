# Glass v5 shell validation

Browser checks only. Desktop Chromium and WebKit emulation is not real-iPad touch, keyboard, or effects-performance validation. A person still has to do those on a device.

## What was exercised

Playwright spec `frontend/test/e2e/glass-shell.browser.spec.ts`, projects `chromium` and `webkit`, against the Nuxt dev server with API responses intercepted. Both projects passed.

Viewports:

- 834×1112 (reference iPad artboard size, desktop layout because the shell switches at 768px)
- 390×844 (mobile drawer)
- 320×700 (narrow window)
- 1440×900 (wider desktop)

Routes: `/home`, `/items`, `/item/item-1`, `/collection/settings`, plus `/item/item-1/edit` for the sticky offset.

Checked: search, Scan, sidebar trigger, nav destinations, profile, and sign-out stay inside the viewport and do not overlap; document scroll width does not exceed the viewport; mobile drawer stays within the window and leaves a dismiss strip; Escape closes the create menu and the drawer; search submits to `/items` and `/items?q=`; Scan opens the existing scanner dialog above the header; Collection opens settings; shell controls are at least 44×44 CSS pixels; Tab from the sidebar trigger lands on search with a visible focus ring or shadow; the item-edit sticky bar sits at or below the shell header after scroll.

## Reduced effects

`html[data-glass-effects="off"]` is the explicit switch. The spec sets it and reads computed style. With it on, sidebar `backdrop-filter` is `none` and the navigation background is the solid fallback (`--glass-nav-fallback`, `158 28% 96%`), not a translucent rgba. `background-attachment` is `scroll`, not `fixed`.

The same solid surface is also applied by `@supports not (backdrop-filter)` and `prefers-reduced-transparency: reduce`. `prefers-reduced-motion: reduce` drops shell and dialog transitions/animations and the fixed gradient attachment, which repaints on scroll. Those media queries were not emulated as a substitute for the explicit attribute. WebKit in this run supports backdrop-filter, so the unsupported path was not hit in a browser; the attribute is the check that does not depend on that.

## Contrast

Token contrast is asserted in `frontend/test/glass-materials.test.ts` (passed): ink and muted text at least 4.5:1 on card, fallback, and sage/blue/lilac stops, including glass composited at `--glass-nav-alpha` 0.82; functional edges at least 3:1 on those surfaces and on the solid fallback; primary, destructive, accent, and secondary pairs at least 4.5:1. No new web font. Hairline artboard borders are not used for functional edges.

## Effects performance

Costly effects are limited to navigation: `blur(16px) saturate(1.15)` on the sidebar, `.glass-nav`, and `.glass-tabs`. Panels and fields stay opaque with `backdrop-filter: none`. The page gradient uses `background-attachment: fixed` only while effects are on; fallback, reduced transparency, missing backdrop-filter, and reduced motion use `scroll`. No full-screen animated blur.

No frame-time or thermal reading was taken. A desktop browser scrolling an emulated viewport does not measure iPad compositor cost.

## Review follow-up

The review enlarged the mobile Home mark link to 44×44 with explicit keyboard focus, and kept the sidebar content scrollable when collapsed. Regression coverage checks the mobile link's target and focus, plus reaching Collection in a collapsed sidebar at 834×480.

Review rerun: the viewport and solid-fallback cases passed in Chromium and WebKit (four cases). The extended keyboard/overlay case then passed in both projects (two cases) after waiting for the desktop sidebar before toggling its collapsed state. Command: `E2E_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test --config test/playwright.config.ts test/e2e/glass-shell.browser.spec.ts --project chromium --project webkit --workers 1 --reporter line`. The server must be started separately (`pnpm dev --no-fork --host 127.0.0.1 --port 3000`). Earlier review attempts failed with connection-refused errors; these were not UI assertion failures.

The two foundation Vitest files passed (nine tests). Targeted ESLint completed; full `lint:ci` and `typecheck` each exceeded the review's 600-second limit without a completed result. `pnpm build` also exceeded 600 seconds: client and server compilation completed, but static generation did not return a result. These are not recorded as passing checks.

Coverage limits: token contrast calculations are not a rendered-state audit of every theme, hover state, or composited pixel. The redundant sidebar rail still has `tabindex=-1`; keyboard collapse/expand uses the labelled 44px header trigger. The suite does not verify real collection create/join/switch persistence, scanner permission denial, or real sign-out against the backend.

## Still needs a person

- Real iPad (or other touch tablet) touch targets, scroll, and sticky header with a finger, including the floating sidebar rail
- Hardware keyboard and focus order on that device, including the mobile drawer
- Effects performance with blur on and with `data-glass-effects="off"`, reduced transparency, and reduced motion on device
- WebKit here was Playwright's desktop WebKit, not Safari on iPadOS
