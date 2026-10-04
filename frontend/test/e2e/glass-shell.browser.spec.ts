import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Desktop browser checks for the Glass v5 shell. These are not real-iPad
 * validation: viewports emulate window size only.
 */

function observationsPath(project: string) {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../test-results",
    `glass-shell-observations.${project}.json`
  );
}

const routes = ["/home", "/items", "/item/item-1", "/collection/settings"] as const;

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "hb.auth.session",
      value: "true",
      url: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    },
  ]);
  await context.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, "");
    const body = mockApi(path, url);
    await route.fulfill({
      status: route.request().method() === "POST" && path.endsWith("/logout") ? 204 : 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.addInitScript(() => {
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
  page.on("pageerror", error => {
    console.log("PAGEERROR", error.message);
  });
});

test("reference iPad size keeps shell tasks on the four routes", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 834, height: 1112 });
  const samples: Record<string, unknown> = {};

  for (const path of routes) {
    await openShell(page, path);
    await expect(page.locator("a.glass-brand").first()).toBeVisible();
    await expect(page.getByTestId("shell-search")).toBeVisible();
    await expect(page.getByTestId("shell-scan")).toBeVisible();
    await expect(page.locator('[data-sidebar="sidebar"]').getByRole("link", { name: "Collection" })).toBeVisible();
    await expect(page.getByTestId("logout-button")).toBeVisible();
    await expectInViewport(page.getByTestId("shell-header"), page);
    await expectInViewport(page.locator('[data-sidebar="sidebar"]'), page);
    await expectInViewport(page.getByTestId("logout-button"), page);
    const active = page.locator('[data-sidebar="menu-button"][data-active="true"]');
    await expect(active.first()).toBeVisible();
  }

  await openShell(page, "/home");
  await page.getByTestId("shell-search").locator("input").fill("");
  await page.getByTestId("shell-search").locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/items\/?$/);

  await page.getByTestId("shell-search").locator("input").fill("drill 1/2");
  await page.getByTestId("shell-search").locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/items\?q=drill%201%2F2/);

  await page.getByTestId("shell-scan").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Scanner", { exact: true })).toBeVisible();
  await expectAboveHeader(dialog, page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  samples.contrast = await sampleContrast(page);
  expect(samples.contrast).toMatchObject({ text: expect.any(Number), edge: expect.any(Number) });
  const contrast = samples.contrast as { text: number; edge: number; effects: string };
  expect(contrast.text).toBeGreaterThanOrEqual(4.5);
  expect(contrast.edge).toBeGreaterThanOrEqual(3);
  expect(contrast.effects).not.toBe("none");

  samples.scroll = await scrollCost(page);
  record(testInfo.project.name, "ipad", samples);
});

test("narrow windows keep the drawer, header and footer reachable", async ({ page }) => {
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await openShell(page, "/home");
  const mark = page.getByTestId("shell-home-mark");
  await expect(mark).toBeVisible();
  const markBox = await box(mark);
  expect(markBox.width).toBeGreaterThanOrEqual(44);
  expect(markBox.height).toBeGreaterThanOrEqual(44);

  const trigger = page.locator('[data-sidebar="trigger"]');
  await trigger.click();
  const drawer = page.locator('[data-mobile="true"][data-sidebar="sidebar"]');
  await expect(drawer).toBeVisible();
  await expect.poll(async () => (await box(drawer)).x, { timeout: 5_000 }).toBeGreaterThanOrEqual(-1);
  await expectInViewport(drawer, page);
  const drawerBox = await box(drawer);
  const viewport = page.viewportSize();
  expect(drawerBox.width).toBeLessThanOrEqual((viewport?.width || 390) - 8);
  await expect(drawer.locator('[data-sidebar="menu-button"][href="/home"]')).toBeVisible();
  await drawer.locator('[data-sidebar="menu-button"][href="/collection/settings"]').click();
  await expect(page).toHaveURL(/\/collection\/settings/);
  await expect(drawer).toBeHidden();

  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click((viewport?.width || 390) - 4, 200);
  await expect(drawer).toBeHidden();

  await page.setViewportSize({ width: 320, height: 700 });
  await openShell(page, "/items");
  await expect(page.getByTestId("shell-home-mark")).toBeHidden();
  await expectInViewport(page.getByTestId("shell-header"), page);
  await expectInViewport(page.getByTestId("shell-scan"), page);
  await page.locator('[data-sidebar="trigger"]').click();
  const narrowDrawer = page.locator('[data-mobile="true"][data-sidebar="sidebar"]');
  await expect(narrowDrawer).toBeVisible();
  await expect.poll(async () => (await box(narrowDrawer)).x, { timeout: 5_000 }).toBeGreaterThanOrEqual(-1);
  await expectInViewport(narrowDrawer, page);
  const signOut = narrowDrawer.getByTestId("logout-button");
  await signOut.scrollIntoViewIfNeeded();
  await expect(signOut).toBeVisible();
  await expectInViewport(signOut, page);
  await page.keyboard.press("Escape");
});

test("desktop and short collapsed sidebar keep navigation reachable", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openShell(page, "/home");
  await expect(page.locator('[data-mobile="true"]')).toHaveCount(0);
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expectInViewport(sidebar, page);
  await expectInViewport(page.getByTestId("logout-button"), page);
  const rail = page.locator('[data-sidebar="rail"]');
  await expect(rail).toHaveAttribute("tabindex", "-1");

  await context.addCookies([
    {
      name: "sidebar:state",
      value: "false",
      url: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    },
  ]);
  await page.setViewportSize({ width: 834, height: 480 });
  await openShell(page, "/home");
  const collapsed = page.locator('[data-sidebar="sidebar"]');
  await expect(collapsed).toBeVisible();
  const collection = collapsed.getByRole("link", { name: "Collection" });
  await collection.scrollIntoViewIfNeeded();
  await expect(collection).toBeVisible();
  await expectInViewport(collection, page);
  await collection.click();
  await expect(page).toHaveURL(/\/collection\/settings/);
});

test("keyboard, targets, fallback surfaces, sticky edit and overlays", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 834, height: 1112 });
  await openShell(page, "/home");

  const trigger = page.locator('[data-sidebar="trigger"]');
  await trigger.focus();
  await expect(trigger).toBeFocused();
  expect(await focusVisible(trigger)).toBe(true);
  const triggerBox = await box(trigger);
  expect(Math.min(triggerBox.width, triggerBox.height)).toBeGreaterThanOrEqual(44);

  const search = page.getByTestId("shell-search").locator("input");
  await search.focus();
  expect(await focusVisible(search)).toBe(true);
  const searchBox = await box(search);
  expect(searchBox.height).toBeGreaterThanOrEqual(44);

  const scan = page.getByTestId("shell-scan");
  await scan.focus();
  expect(await focusVisible(scan)).toBe(true);
  const scanBox = await box(scan);
  expect(Math.min(scanBox.width, scanBox.height)).toBeGreaterThanOrEqual(44);

  const home = page.locator('[data-sidebar="menu-button"][href="/home"]');
  await home.focus();
  expect(await focusVisible(home)).toBe(true);
  const homeBox = await box(home);
  expect(Math.min(homeBox.width, homeBox.height)).toBeGreaterThanOrEqual(44);

  const profile = page.locator('[data-sidebar="sidebar"]').getByRole("link", { name: /Profile/ });
  await profile.focus();
  expect(await focusVisible(profile)).toBe(true);

  const signOut = page.getByTestId("logout-button");
  await signOut.focus();
  expect(await focusVisible(signOut)).toBe(true);
  const signOutBox = await box(signOut);
  expect(Math.min(signOutBox.width, signOutBox.height)).toBeGreaterThanOrEqual(44);

  const create = page.locator('[data-sidebar="header"]').getByRole("button", { name: "Create" });
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Item / Asset" })).toBeVisible();
  await page.keyboard.press("Escape");

  const selector = page.locator('[data-sidebar="sidebar"] [role="combobox"]');
  await selector.focus();
  await selector.press("Enter");
  await expect(page.getByText("Create New Collection", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const media = navigator.mediaDevices;
    media.getUserMedia = () => Promise.reject(new Error("denied"));
  });
  await page.getByTestId("shell-scan").click();
  await expect(page.getByText("Camera permission denied")).toBeVisible();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({ getTracks: () => [{ stop() {} }] } as MediaStream);
  });

  await page.evaluate(() => {
    document.documentElement.dataset.glassEffects = "off";
  });
  const fallback = await sampleContrast(page);
  expect(fallback.effects).toBe("none");
  expect(fallback.opaque).toBe(true);
  expect(fallback.text).toBeGreaterThanOrEqual(4.5);
  expect(fallback.edge).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("shell-scan")).toBeVisible();
  await expect(page.locator('[data-sidebar="sidebar"]').getByRole("link", { name: "Search" })).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await page.evaluate(() => {
    const nav = document.querySelector(".glass-nav");
    return nav ? getComputedStyle(nav).transitionDuration : "";
  });
  expect(motion === "0s" || motion.startsWith("0.01")).toBe(true);

  const scrollOff = await scrollCost(page);
  await page.evaluate(() => {
    delete document.documentElement.dataset.glassEffects;
  });
  const scrollOn = await scrollCost(page);

  await openShell(page, "/item/item-1/edit");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeVisible();
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "glass-scroll-spacer";
    spacer.style.height = "1600px";
    document.querySelector("main")?.appendChild(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 700));
  const headerBox = await box(page.getByTestId("shell-header"));
  const saveBox = await box(save);
  expect(saveBox.y).toBeGreaterThanOrEqual(headerBox.bottom - 1);

  await page.getByTestId("shell-scan").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectAboveHeader(dialog, page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  record(testInfo.project.name, "keyboard-fallback", {
    fallback,
    motion,
    scrollOff,
    scrollOn,
    saveTop: saveBox.y,
    headerBottom: headerBox.bottom,
  });
});

async function openShell(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-header")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "homebox");
}

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  });
}

async function expectInViewport(locator: Locator, page: Page) {
  const rect = await box(locator);
  const viewport = page.viewportSize() || { width: 0, height: 0 };
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.x).toBeGreaterThanOrEqual(-1);
  expect(rect.y).toBeGreaterThanOrEqual(-1);
  expect(rect.right).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.bottom).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectAboveHeader(dialog: Locator, page: Page) {
  const dialogZ = await dialog.evaluate(el => Number(getComputedStyle(el).zIndex) || 0);
  const headerZ = await page.getByTestId("shell-header").evaluate(el => Number(getComputedStyle(el).zIndex) || 0);
  expect(dialogZ).toBeGreaterThan(headerZ);
}

async function focusVisible(locator: Locator) {
  return locator.evaluate(el => {
    const style = getComputedStyle(el);
    const outline = Number.parseFloat(style.outlineWidth);
    const shadow = style.boxShadow;
    return outline >= 2 || (shadow !== "none" && shadow !== "");
  });
}

async function sampleContrast(page: Page) {
  return page.evaluate(() => {
    function parse(color: string) {
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (!match?.[1]) return null;
      const parts = match[1].split(",").map(part => Number.parseFloat(part.trim()));
      return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts[3] ?? 1 };
    }
    function lin(channel: number) {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }
    function lum(color: { r: number; g: number; b: number }) {
      return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
    }
    function ratio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
      const l1 = lum(a);
      const l2 = lum(b);
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (hi + 0.05) / (lo + 0.05);
    }
    const nav = document.querySelector(".glass-nav");
    const sidebar = document.querySelector('[data-sidebar="sidebar"]');
    if (!nav || !sidebar) return { text: 0, edge: 0, effects: "missing", opaque: false };
    const navStyle = getComputedStyle(nav);
    const sideStyle = getComputedStyle(sidebar);
    const text = parse(navStyle.color);
    const surface = parse(navStyle.backgroundColor);
    const edge = parse(sideStyle.borderTopColor);
    const webkit = (sideStyle as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
    const effects = sideStyle.backdropFilter || webkit || "none";
    return {
      text: text && surface ? ratio(text, surface) : 0,
      edge: edge && surface ? ratio(edge, surface) : 0,
      effects,
      opaque: (surface?.a ?? 0) === 1,
      navBackground: navStyle.backgroundColor,
      attachment: getComputedStyle(document.documentElement).backgroundAttachment,
    };
  });
}

async function scrollCost(page: Page) {
  return page.evaluate(async () => {
    const scroller = document.scrollingElement || document.documentElement;
    const spacer = document.createElement("div");
    spacer.style.height = "2400px";
    document.body.appendChild(spacer);
    const start = performance.now();
    let frames = 0;
    let longFrames = 0;
    let previous = start;
    await new Promise<void>(resolve => {
      const step = (now: number) => {
        frames += 1;
        if (now - previous > 50) longFrames += 1;
        previous = now;
        scroller.scrollTop = ((now - start) / 700) * 1800;
        if (now - start < 700) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    spacer.remove();
    scroller.scrollTop = 0;
    return { frames, longFrames, ms: Math.round(performance.now() - start) };
  });
}

function record(project: string, key: string, value: unknown) {
  const path = observationsPath(project);
  mkdirSync(dirname(path), { recursive: true });
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    current = {};
  }
  current[key] = value;
  writeFileSync(path, JSON.stringify(current, null, 2));
}

function mockApi(path: string, url: URL) {
  const now = "2026-01-01T00:00:00Z";
  const user = {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    defaultGroupId: "group-1",
    groupIds: ["group-1"],
    isSuperuser: false,
    oidcIssuer: "",
    oidcSubject: "",
  };
  const group = { id: "group-1", name: "Workshop", currency: "USD", createdAt: now, updatedAt: now };
  const item = {
    id: "item-1",
    name: "Cordless drill",
    description: "A drill used to check shell scrolling.",
    archived: false,
    assetId: "",
    attachments: [],
    children: [],
    createdAt: now,
    updatedAt: now,
    entityType: null,
    fields: [],
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
    purchasePrice: 0,
    quantity: 1,
    serialNumber: "",
    soldDate: now,
    soldNotes: "",
    soldPrice: 0,
    soldTo: "",
    syncChildEntityLocations: false,
    tags: [],
    totalPrice: 0,
    warrantyDetails: "",
    warrantyExpires: now,
  };
  if (path.endsWith("/status")) {
    return {
      allowRegistration: true,
      build: { buildTime: now, commit: "glass", version: "1.0.0" },
      demo: true,
      health: true,
      labelPrinting: false,
      latest: { date: now, version: "1.0.0" },
      message: "",
      oidc: { allowLocal: true, autoRedirect: false, buttonText: "", enabled: false },
      telemetry: { enabled: false },
      title: "HomeBox",
      versions: ["1.0.0"],
    };
  }
  if (path.endsWith("/users/self")) return { item: user };
  if (path.endsWith("/users/logout")) return {};
  if (path.endsWith("/groups/all")) return [group];
  if (path.endsWith("/groups/members")) return [];
  if (path.endsWith("/groups/statistics")) {
    return { totalItemPrice: 0, totalItems: 1, totalLocations: 0, totalTags: 0, totalUsers: 1, totalWithWarranty: 0 };
  }
  if (path.endsWith("/currencies")) return [{ code: "USD", decimals: 2, local: "en", name: "US Dollar", symbol: "$" }];
  if (path.endsWith("/groups")) return group;
  if (
    path.endsWith("/tags") ||
    path.endsWith("/entity-types") ||
    path.endsWith("/templates") ||
    path.endsWith("/notifiers")
  ) {
    return [];
  }
  if (path.endsWith("/entities/tree") || path.endsWith("/entities/fields") || path.endsWith("/entities/item-1/path")) {
    return [];
  }
  if (path.endsWith("/entities/item-1")) return item;
  if (path.endsWith("/entities")) {
    const listed = url.searchParams.get("isLocation") === "true" ? [] : [{ ...item, parent: null }];
    return { items: listed, page: 1, pageSize: 5, total: listed.length, totalPrice: 0 };
  }
  if (path.includes("/maintenance")) return [];
  return [];
}
