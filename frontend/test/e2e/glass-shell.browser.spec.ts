import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Browser checks for the Glass v5 shell. These run in desktop Chromium/WebKit
 * at emulated viewports. They are not real-iPad touch or keyboard validation.
 */

const ITEM_ID = "item-1";
const GROUP_ID = "group-1";

const VIEWPORTS = [
  { name: "ipad", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 700 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const ROUTES = [
  { path: "/home", label: "Home" },
  { path: "/items", label: "Search" },
  { path: `/item/${ITEM_ID}`, label: "Search" },
  { path: "/collection/settings", label: "Collection" },
] as const;

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  const gap = 1;
  return a.x < b.right - gap && a.right > b.x + gap && a.y < b.bottom - gap && a.bottom > b.y + gap;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("missing bounding box");
  }
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}

async function expectInViewport(locator: Locator, viewport: { width: number; height: number }, label: string) {
  const box = await boxOf(locator);
  expect(box.width, `${label} width`).toBeGreaterThan(0);
  expect(box.height, `${label} height`).toBeGreaterThan(0);
  expect(box.x, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 1);
  return box;
}

async function expectMinTarget(locator: Locator, label: string) {
  const box = await boxOf(locator);
  expect(box.width, `${label} target width`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label} target height`).toBeGreaterThanOrEqual(44);
}

async function mockApi(page: Page) {
  const now = "2024-06-01T00:00:00Z";
  const user = {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    isSuperuser: false,
    groupIds: [GROUP_ID],
    defaultGroupId: GROUP_ID,
    oidcIssuer: "",
    oidcSubject: "",
  };
  const group = { id: GROUP_ID, name: "Workshop", currency: "USD", createdAt: now, updatedAt: now };
  const item = {
    id: ITEM_ID,
    name: "Cordless drill",
    description: "Drawer drill",
    assetId: "0",
    archived: false,
    attachments: [],
    children: [],
    createdAt: now,
    updatedAt: now,
    entityType: null,
    fields: [],
    imageId: null,
    insured: false,
    itemCount: 0,
    lifetimeWarranty: false,
    location: null,
    manufacturer: "",
    modelNumber: "",
    notes: "",
    parent: null,
    purchaseDate: now,
    purchaseFrom: "",
    purchasePrice: 89,
    quantity: 1,
    serialNumber: "",
    soldDate: "0001-01-01T00:00:00Z",
    soldNotes: "",
    soldPrice: 0,
    soldTo: "",
    syncChildEntityLocations: false,
    tags: [],
    thumbnailId: null,
    totalPrice: 89,
    warrantyDetails: "",
    warrantyExpires: "0001-01-01T00:00:00Z",
  };

  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/status")) {
      return json({
        allowRegistration: true,
        build: { buildTime: now, commit: "glass-shell", version: "v0.0.0" },
        demo: false,
        health: true,
        labelPrinting: false,
        latest: { date: now, version: "v0.0.0" },
        message: "",
        oidc: { allowLocal: true, autoRedirect: false, buttonText: "", enabled: false },
        title: "Homebox",
        versions: [],
      });
    }
    if (path.endsWith("/users/self")) return json({ item: user });
    if (path.endsWith("/users/logout")) return json({});
    if (path.endsWith("/groups/all")) return json([group]);
    if (path.includes("/groups/statistics")) {
      return json({
        totalItemPrice: 89,
        totalItems: 1,
        totalLocations: 0,
        totalTags: 0,
        totalUsers: 1,
        totalWithWarranty: 0,
      });
    }
    if (path.endsWith("/groups/members")) return json([{ id: user.id, name: user.name, email: user.email }]);
    if (path.endsWith("/groups/invitations")) return json([]);
    if (path.endsWith("/currencies")) {
      return json([{ code: "USD", decimals: 2, local: "en-US", name: "US Dollar", symbol: "$" }]);
    }
    if (path.endsWith("/groups")) return json(group);
    if (path.includes(`/entities/${ITEM_ID}/path`)) return json([{ id: ITEM_ID, name: item.name, type: "item" }]);
    if (path.includes(`/entities/${ITEM_ID}`)) return json(item);
    if (path.includes("/entities/tree")) return json([]);
    if (path.includes("/entities/fields")) return json([]);
    if (path.includes("/entities")) {
      return json({
        items: [
          {
            id: ITEM_ID,
            name: item.name,
            description: item.description,
            assetId: "0",
            archived: false,
            createdAt: now,
            updatedAt: now,
            entityType: null,
            imageId: null,
            insured: false,
            itemCount: 0,
            quantity: 1,
            purchasePrice: 89,
            totalPrice: 89,
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPrice: 89,
      });
    }
    if (
      path.endsWith("/tags") ||
      path.endsWith("/entity-types") ||
      path.endsWith("/templates") ||
      path.endsWith("/notifiers") ||
      path.endsWith("/maintenance")
    ) {
      return json([]);
    }
    return json(route.request().method() === "GET" ? [] : {});
  });
}

async function signedIn(page: Page) {
  await page.context().addCookies([
    { name: "hb.auth.session", value: "true", url: "http://localhost:3000" },
    { name: "hb.auth.session", value: "true", url: "http://127.0.0.1:3000" },
  ]);
  await page.addInitScript(() => {
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
  await mockApi(page);
}

function shellTrigger(page: Page) {
  return page.locator("[data-sidebar='trigger']");
}

async function openNav(page: Page) {
  const drawer = page.locator("[data-mobile='true'][data-sidebar='sidebar']");
  const desktop = page.locator("[data-variant='floating'] [data-sidebar='sidebar']");
  if (await desktop.isVisible()) {
    return desktop;
  }
  if (!(await drawer.isVisible())) {
    await shellTrigger(page).click();
    await expect(drawer).toBeVisible();
  }
  return drawer;
}

test.describe("Glass v5 shell", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3000";
    page.setDefaultTimeout(15_000);
    await page.context().addCookies([{ name: "hb.auth.session", value: "true", url: origin }]);
    await signedIn(page);
  });

  test("keeps navigation, content and footer reachable at iPad, narrow and desktop sizes", async ({ page }) => {
    test.setTimeout(120_000);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        await page.goto(route.path);
        await expect(page).toHaveURL(new RegExp(route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 20_000 });

        const search = await expectInViewport(page.getByTestId("shell-search"), viewport, `${viewport.name} search`);
        const scan = await expectInViewport(page.getByTestId("shell-scan"), viewport, `${viewport.name} scan`);
        const trigger = await expectInViewport(shellTrigger(page), viewport, `${viewport.name} trigger`);
        expect(overlaps(search, scan), `${viewport.name} search/scan overlap on ${route.path}`).toBe(false);
        expect(overlaps(search, trigger), `${viewport.name} search/trigger overlap on ${route.path}`).toBe(false);
        expect(overlaps(scan, trigger), `${viewport.name} scan/trigger overlap on ${route.path}`).toBe(false);

        const nav = await openNav(page);
        const destination = nav.locator("[data-sidebar='menu-button']", { hasText: route.label });
        await destination.scrollIntoViewIfNeeded();
        await expect(destination).toBeVisible();
        await expectInViewport(destination, viewport, `${viewport.name} ${route.label}`);
        const signOut = nav.getByTestId("logout-button");
        await signOut.scrollIntoViewIfNeeded();
        await expectInViewport(signOut, viewport, `${viewport.name} sign out`);
        await expect(nav.getByRole("link", { name: "Profile & preferences" })).toBeVisible();

        const version = page.getByText(/0\.0\.0/);
        if (await version.count()) {
          await version.first().scrollIntoViewIfNeeded();
          await expect(version.first()).toBeVisible();
        }

        const metrics = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const offenders: string[] = [];
          for (const el of document.querySelectorAll("body *")) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && (rect.right > viewportWidth + 1 || rect.left < -1)) {
              offenders.push(
                `${el.tagName}.${String(el.className).slice(0, 60)} ${Math.round(rect.left)}-${Math.round(rect.right)}`
              );
            }
          }
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: viewportWidth,
            offenders: offenders.slice(0, 8),
          };
        });
        expect(
          metrics.scrollWidth,
          `${viewport.name} document overflow on ${route.path}: ${metrics.offenders.join(" | ")}`
        ).toBeLessThanOrEqual(metrics.clientWidth + 1);
      }
    }
  });

  test("uses a solid navigation surface without blur and keeps every shell task", async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-glass-effects", "off");
    });
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto("/home");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-glass-effects", "off");
    });
    await expect(page.locator("[data-sidebar='menu-button']", { hasText: "Home" })).toBeVisible();

    const surface = await page.evaluate(() => {
      const nav = document.querySelector("[data-sidebar='sidebar']");
      const style = nav ? getComputedStyle(nav) : null;
      const body = getComputedStyle(document.body);
      return {
        effects: document.documentElement.dataset.glassEffects ?? "",
        backdrop: style?.backdropFilter ?? style?.webkitBackdropFilter ?? "",
        background: style?.backgroundColor ?? "",
        attachment: body.backgroundAttachment,
        blurred: document.querySelectorAll("[data-sidebar='sidebar'], .glass-nav, .glass-tabs").length,
      };
    });
    expect(surface.effects).toBe("off");
    expect(surface.backdrop === "none" || surface.backdrop === "").toBe(true);
    expect(surface.background).not.toMatch(/rgba\([^)]*,\s*0?\.\d+/);
    expect(surface.attachment).not.toBe("fixed");

    await page.getByTestId("shell-search").fill("drill");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/items\?q=drill/);

    await page.getByTestId("shell-search").fill("");
    await page.locator("form[role='search']").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page).toHaveURL(/\/items$/);

    await page.getByTestId("shell-scan").click();
    const scanner = page.getByRole("dialog").filter({ hasText: "Scanner" });
    await expect(scanner).toBeVisible();
    const header = await boxOf(page.locator(".glass-header"));
    const title = scanner.getByRole("heading", { name: "Scanner" });
    await expect(title).toBeVisible();
    const titleBox = await boxOf(title);
    const covered = titleBox.y < header.bottom && overlaps(titleBox, header);
    expect(covered, "scanner title covered by header").toBe(false);
    await page.keyboard.press("Escape");
    await expect(scanner).toBeHidden();

    await page.getByRole("link", { name: "Collection", exact: true }).click();
    await expect(page).toHaveURL(/\/collection\/settings/);
    await expect(page.getByTestId("logout-button")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
  });

  test("exposes keyboard focus, 44px targets, scrolling and overlays", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto("/home");

    await expectMinTarget(page.getByTestId("shell-scan"), "scan");
    await expectMinTarget(shellTrigger(page), "trigger");
    await expectMinTarget(page.getByRole("link", { name: "Search", exact: true }), "search nav");
    await expectMinTarget(page.getByTestId("logout-button"), "sign out");

    await page.locator(".glass-header").click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        name: el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName,
        outline: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        shadow: style.boxShadow,
        ring: style.getPropertyValue("--tw-ring-shadow") || style.boxShadow,
      };
    });
    expect(focus).not.toBeNull();
    const visible =
      (focus?.outline && focus.outline !== "none" && focus.outlineWidth !== "0px") ||
      (focus?.shadow && focus.shadow !== "none");
    expect(visible, `focus indicator on ${focus?.name}`).toBe(true);

    for (const route of ROUTES) {
      await page.goto(route.path);
      await shellTrigger(page).focus();
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("shell-search")).toBeFocused();
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const style = getComputedStyle(el);
        return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, shadow: style.boxShadow };
      });
      const visible =
        (focus?.outline && focus.outline !== "none" && focus.outlineWidth !== "0px") ||
        (focus?.shadow && focus.shadow !== "none");
      expect(visible, `visible focus on search at ${route.path}`).toBe(true);
    }

    await page.goto(`/item/${ITEM_ID}/edit`);
    await expect(page.locator(".glass-header")).toBeVisible({ timeout: 15_000 });
    const editSticky = page.getByRole("button", { name: "Save" });
    await expect(editSticky).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      const tall = document.createElement("div");
      tall.style.height = "1600px";
      document.querySelector("main")?.append(tall);
      window.scrollTo(0, 400);
    });
    const offset = await page.evaluate(() => {
      const header = document.querySelector(".glass-header");
      const save = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes("Save"));
      const sticky = save?.closest(".sticky") ?? null;
      const headerBox = header?.getBoundingClientRect();
      const stickyBox = sticky?.getBoundingClientRect();
      return {
        url: location.pathname,
        headerBottom: headerBox?.bottom ?? 0,
        stickyTop: stickyBox?.top ?? -1,
      };
    });
    expect(offset.headerBottom).toBeGreaterThanOrEqual(64);
    expect(offset.headerBottom).toBeLessThanOrEqual(68);
    expect(offset.stickyTop).toBeGreaterThanOrEqual(offset.headerBottom - 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    await expectMinTarget(page.locator('.glass-header a[href="/home"]'), "mobile Home link");
    await shellTrigger(page).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator('.glass-header a[href="/home"]')).toBeFocused();
    await shellTrigger(page).click();
    const drawer = page.locator("[data-mobile='true'][data-sidebar='sidebar']");
    await expect(drawer).toBeVisible();
    await expect.poll(async () => (await drawer.boundingBox())?.x ?? -1000).toBeGreaterThanOrEqual(-1);
    const drawerBox = await expectInViewport(drawer, { width: 390, height: 844 }, "drawer");
    expect(drawerBox.right).toBeLessThanOrEqual(390);
    await expectMinTarget(drawer.getByRole("link", { name: "Locations", exact: true }), "locations");
    await drawer.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("menuitem", { name: "Item / Asset" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Item / Asset" })).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // A short desktop window must not clip links when the sidebar is collapsed.
    await page.setViewportSize({ width: 834, height: 480 });
    await page.goto("/home");
    const sidebar = page.locator('[data-variant="floating"] [data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible();
    if (await page.locator('[data-variant="floating"][data-state="expanded"]').count()) {
      await shellTrigger(page).click();
    }
    await expect(page.locator('[data-variant="floating"][data-state="collapsed"]')).toBeVisible();
    const content = sidebar.locator('[data-sidebar="content"]');
    await expect.poll(() => content.evaluate(el => getComputedStyle(el).overflowY)).toBe("auto");
    const collection = sidebar.getByRole("link", { name: "Collection", exact: true });
    await collection.scrollIntoViewIfNeeded();
    await expectInViewport(collection, { width: 834, height: 480 }, "collapsed Collection");
    await collection.click();
    await expect(page).toHaveURL(/\/collection\/settings/);
  });
});
