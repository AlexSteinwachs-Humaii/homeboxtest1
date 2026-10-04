# Glass v5 shell validation handoff

Desktop browser checks only. Nothing in this note is a real iPad, real touch, or device performance sign-off.

## What was checked

Playwright `frontend/test/e2e/glass-shell.browser.spec.ts` against the Nuxt dev server at `http://127.0.0.1:3000`, with `/api/v1/**` mocked and `hb.auth.session=true`. Inventory create/join/switch persistence, a real camera, and sign-out against a running API were not exercised.

Browsers that actually ran:

- Chromium 151 (Playwright Chrome for Testing), Linux desktop, 4 tests passed.
- WebKit 26.5 (Playwright), Linux desktop, 4 tests passed. The reference-size case once failed on a WebKit "Load failed" for `/api/v1/entities` and passed on the configured retry. That is a harness flake, not a measured shell defect.

Viewports used (CSS pixels, window emulation, not a device frame):

- 834×1112 reference iPad size
- 390×844 and 320×700 narrow windows
- 1440×900 desktop
- 834×480 collapsed desktop sidebar

Routes: `/home`, `/items`, `/item/item-1`, `/collection/settings`, plus `/item/item-1/edit` for the sticky Save bar.

## Reachability

At 834×1112 the HomeBox mark, floating sidebar, collection selector, Create, search, Scan, profile and Sign Out were on screen. Collection opens `/collection/settings`. Empty search goes to `/items`; `drill 1/2` goes to `/items?q=drill%201%2F2`.

At 390×844 the in-header Home mark is 44×44. The mobile drawer stays inside the viewport (`min(18rem, 100vw - 1rem)`, `100dvh`), closes on Escape and on the outside strip, and Collection remains a sidebar link. At 320×700 the in-header mark is hidden; Home stays in the drawer. Header search and Scan stay inside the viewport. Sign Out in the drawer can be scrolled into view.

At 1440×900 the desktop sidebar and Sign Out stay inside the viewport. At 834×480 with the sidebar collapsed, Collection can be scrolled into view and followed.

Document `overflow-x: hidden` was removed so a clipped control is not hidden by the page. The shell uses `min-width: 0` / `max-width: 100%` instead.

## Keyboard, focus, targets, overlays

Checked in Chromium and WebKit at 834×1112:

- Sidebar trigger, search field, Scan, Home nav link, profile link and Sign Out take focus with a visible outline or ring, and the measured box is at least 44×44.
- Create opens from the keyboard (Enter) and shows Item / Asset.
- Collection selector opens from Enter. Reka's popover trigger did not open on Enter by itself; the selector button now toggles on Enter and Space.
- Scan with a stubbed `getUserMedia` rejection shows the existing permission-denied toast. A resolving stub opens the Scanner dialog above the header (`z-index` greater than the header). Escape closes it.
- After scrolling the item edit page, Save's top was 68px and the header bottom was 64px, so Save stays below the 4rem header.

Rail exception: `[data-sidebar="rail"]` remains `tabindex="-1"`. The labelled header trigger is the keyboard collapse control. The rail itself is not a 44px keyboard target and must not be cited as satisfying that requirement.

## Effects, contrast, motion

Explicit `document.documentElement.dataset.glassEffects = "off"` (the check that does not depend on media-query support):

- Sidebar `backdrop-filter` became `none`.
- Navigation background was opaque `rgb(235, 244, 241)` (`--glass-fallback`), `background-attachment: scroll`.
- Rendered text contrast about 12.8:1 and border contrast about 6.3:1 against that surface. Search and the Search nav link stayed available.

Effects on, same viewport, composited navigation `rgba(244, 251, 248, 0.82)` with `blur(16px) saturate(1.2)`:

- Rendered text contrast about 13.7:1 and border contrast about 6.7:1.
- Page background attachment was `fixed`.

`prefers-reduced-motion: reduce` (Playwright `emulateMedia`) set the header transition duration to `0s`.

`@supports not (backdrop-filter)` and `prefers-reduced-transparency` use the same solid fallback in `frontend/assets/css/main.css`. Chromium and WebKit both support `backdrop-filter`, and Playwright cannot emulate reduced transparency, so those two paths were not switched on in the browser. They were not measured as rendered states.

These samples are the HomeBox navigation and sidebar at one size. They are not every hover, disabled, focus, or alternate-theme pair. Token tests in `frontend/test/glass-materials.test.ts` are not a rendered sign-off.

## Effects performance

Synthetic 700ms scroll in the desktop browser, counting animation frames longer than 50ms. This is not frame-time, thermal, or iPad performance.

- Chromium, effects on, reference size: 22 frames, 2 long, ~727ms.
- Chromium, effects off: 42 frames, 0 long, ~704ms. Effects restored: 29 frames, 1 long, ~724ms.
- WebKit reported 2 frames for the whole gesture (about 0.8–2.4s). Headless WebKit is not producing a usable frame clock here. Do not treat those counts as jank.

`background-attachment: fixed` remains on for HomeBox when effects are on. That is a known cost on some touch browsers and was not measured on hardware.

## Still needs a person

On a real iPad, with the shipping browser:

- Finger navigation, the mobile-window drawer, and finger scrolling.
- Hardware keyboard traversal, including the selector, Create, Scan and sticky Save.
- Reduced transparency, if the device exposes it, and blur performance with effects on and off (jank, clipping, focus).

Record the device, OS and browser. Desktop Playwright results above are not that check.
