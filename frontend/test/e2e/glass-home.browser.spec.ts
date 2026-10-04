import { expect, test, type Page, type Route } from "@playwright/test";

expect.configure({ timeout: 30_000 });

/**
 * My Home overview against a mocked API. This checks live routes, empty
 * locations and reflow — not a real collection, and not the later item-details redesign.
 */

const workshopId = "11111111-1111-4111-8111-111111111111";
const spareId = "22222222-2222-4222-8222-222222222222";
const now = "2026-03-02T12:00:00Z";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "hb.auth.session",
      value: "true",
      url: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    },
  ]);
});

test("opens the same item from Home and search, and browses empty locations and tags", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page, "workshop");
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/home", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("home-collection-name")).toHaveText("Workshop", { timeout: 90_000 });
  await expect(page.getByTestId("home-currency")).toContainText("EUR");
  await expect(page.getByTestId("home-stat-items")).toHaveText("2");
  await expect(page.locator("a.glass-brand").first()).toBeVisible();
  await expect(page.getByTestId("shell-scan")).toBeVisible();

  // Both surfaces use bg-secondary, so the neutral fallback must use its
  // paired foreground token rather than low-contrast muted text.
  const photoFallback = page.getByTestId("home-recent-no-photo").first();
  await expect(photoFallback).toBeVisible();
  const secondaryForeground = await page
    .getByTestId("home-recent-location")
    .first()
    .evaluate(element => getComputedStyle(element).color);
  await expect(photoFallback).toHaveCSS("color", secondaryForeground);

  const attic = page.getByTestId("home-location-card").filter({ hasText: "Attic" });
  await expect(attic).toBeVisible();
  await expect(attic.getByTestId("home-location-empty")).toHaveText("No items yet");
  await expect(page.getByTestId("home-location-card").filter({ hasText: "Shelf" })).toHaveCount(0);
  await expect(page.getByTestId("home-location-card").filter({ hasText: "Garage" })).toContainText("12 items");
  await expect(page.getByTestId("home-tags-view-all")).toContainText("All 3");
  await expect(page.getByTestId("home-tags-view-all")).not.toContainText("All 6");

  const cards = page.getByTestId("home-location-card");
  await expect(cards).toHaveCount(4);
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(firstBox && secondBox && Math.abs(firstBox.y - secondBox.y) < 8).toBeTruthy();
  expect(firstBox && secondBox && secondBox.x > firstBox.x + 40).toBeTruthy();
  expect(firstBox?.height).toBeGreaterThanOrEqual(44);

  await page.getByTestId("home-locations-view-all").focus();
  await page.keyboard.press("Tab");
  await expect(cards.first()).toBeFocused();

  const drill = page.getByTestId("home-recent-card").filter({ hasText: "Cordless drill" });
  await expect(drill).toHaveAttribute("href", "/item/item-1");
  await drill.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/item\/item-1\/?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Cordless drill" })).toBeVisible();

  await page.goto("/home");
  await page.getByTestId("home-recent-view-all").click();
  await expect(page).toHaveURL(/\/items\/?$/);
  await page
    .getByRole("link", { name: /Cordless drill/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/item\/item-1\/?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Cordless drill" })).toBeVisible();

  await page.goto("/home");
  await attic.click();
  await expect(page).toHaveURL(/\/location\/attic\/?$/);
  await expect(page.getByTestId("location-items-empty")).toHaveText("This location has no items yet.");

  await page.goto("/home");
  await page.getByTestId("home-locations-view-all").click();
  await expect(page).toHaveURL(/\/locations\/?/);
  const garageRow = page.getByRole("treeitem").filter({ hasText: "Garage" }).first();
  await garageRow.locator("svg").first().click();
  await expect(page.getByRole("link", { name: "Shelf" })).toBeVisible();

  await page.goto("/home");
  await page.getByTestId("home-tag-chip").filter({ hasText: "Tools" }).click();
  await expect(page).toHaveURL(/\/tag\/tools\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tools" })).toBeVisible();

  await page.goto("/home");
  await page.getByTestId("home-tags-view-all").click();
  await expect(page).toHaveURL(/\/tags\/?/);
  await expect(page.getByRole("link", { name: "Appliances" })).toBeVisible();
});

test("reflows at phone and desktop widths without clipping", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page, "workshop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-collection-name")).toHaveText("Workshop", { timeout: 30_000 });
  await expect(page.getByTestId("home-location-card").first()).toBeVisible({ timeout: 30_000 });
  const narrow = page.getByTestId("home-location-card");
  await expect(narrow).toHaveCount(4);
  const narrowFirst = await narrow.nth(0).boundingBox();
  const narrowSecond = await narrow.nth(1).boundingBox();
  expect(narrowFirst && narrowSecond && narrowSecond.y > (narrowFirst.y || 0) + 20).toBeTruthy();
  await expectNoHorizontalClip(page);
  const longName = page.getByTestId("home-location-name").filter({ hasText: "Very long storage location" });
  await expect(longName).toBeVisible();
  const longBox = await longName.boundingBox();
  expect(longBox && longBox.x + longBox.width).toBeLessThanOrEqual(390);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("home-location-card")).toHaveCount(4);
  await expectNoHorizontalClip(page);
  await page.getByTestId("home-tag-chip").first().focus();
  await expect(page.getByTestId("home-tag-chip").first()).toBeFocused();
  const chip = await page.getByTestId("home-tag-chip").first().boundingBox();
  expect(chip?.height).toBeGreaterThanOrEqual(44);
});

test("a failed location request stays an error until retry", async ({ page }) => {
  test.setTimeout(180_000);
  const flags = { failLocations: true };
  await installApi(page, "workshop", flags);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-locations-error")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("home-location-card")).toHaveCount(0);
  await expect(page.getByTestId("home-locations-empty")).toHaveCount(0);
  flags.failLocations = false;
  await page.getByTestId("home-locations-retry").click();
  await expect(page.getByTestId("home-location-card").filter({ hasText: "Attic" })).toBeVisible();
});

test("an empty collection shows zeros and empty areas, and switching collections reloads", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page, "empty");
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-collection-name")).toHaveText("Empty cupboard", { timeout: 90_000 });
  await expect(page.getByTestId("home-stat-items")).toHaveText("0");
  await expect(page.getByTestId("home-stat-locations")).toHaveText("0");
  await expect(page.getByTestId("home-stat-tags")).toHaveText("0");
  await expect(page.getByTestId("home-recent-empty")).toBeVisible();
  await expect(page.getByTestId("home-locations-empty")).toBeVisible();
  await expect(page.getByTestId("home-tags-empty")).toBeVisible();
  await expect(page.getByTestId("home-tags-view-all")).toContainText("All 0");

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Spare room" }).click();
  await expect(page.getByTestId("home-collection-name")).toHaveText("Spare room");
  await expect(page.getByTestId("home-currency")).toContainText("GBP");
  await expect(page.getByTestId("home-location-card")).toHaveCount(1);
  await expect(page.getByTestId("home-location-card")).toContainText("Cupboard");
  await expect(page.getByTestId("home-tag-chip")).toHaveCount(1);
  await expect(page.getByTestId("home-recent-card")).toHaveCount(1);
  await expect(page.getByTestId("home-recent-card")).toContainText("Spare lamp");
  await expect(page.getByTestId("home-recent-card").filter({ hasText: "Cordless drill" })).toHaveCount(0);
});

async function expectNoHorizontalClip(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function installApi(page: Page, scenario: "workshop" | "empty", flags = { failLocations: false }) {
  await page.addInitScript(() => {
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
  await page.route("**/api/v1/**", async route => {
    await fulfill(route, scenario, flags);
  });
}

function tenantOf(route: Route): string {
  const header = route.request().headers()["x-tenant"];
  return header || workshopId;
}

async function fulfill(route: Route, scenario: "workshop" | "empty", flags: { failLocations: boolean }) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/\/$/, "");
  const tenant = tenantOf(route);
  const active = scenario === "empty" && tenant === workshopId ? "empty" : tenant === spareId ? "spare" : "workshop";

  if (path.endsWith("/entities") && url.searchParams.get("isLocation") === "true" && flags.failLocations) {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    return;
  }

  const body = mockApi(path, url, active);
  await route.fulfill({
    status: route.request().method() === "POST" && path.endsWith("/logout") ? 204 : 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function group(id: string, name: string, currency: string) {
  return { id, name, currency, createdAt: now, updatedAt: now };
}

function item(id: string, name: string, parent: { id: string; name: string } | null) {
  return {
    id,
    name,
    description: "",
    archived: false,
    assetId: "000-042",
    attachments: [],
    children: [],
    createdAt: now,
    updatedAt: now,
    entityType: null,
    fields: [],
    insured: false,
    quantity: 1,
    purchasePrice: 129,
    purchaseDate: now,
    purchaseFrom: "",
    parent,
    location: parent,
    tags: [],
    soldDate: now,
    soldNotes: "",
    soldPrice: 0,
    soldTo: "",
    serialNumber: "",
    modelNumber: "",
    manufacturer: "",
    notes: "",
    lifetimeWarranty: false,
    warrantyExpires: now,
    warrantyDetails: "",
    syncChildEntityLocations: false,
    totalPrice: 129,
    imageId: null,
    thumbnailId: null,
  };
}

function location(id: string, name: string, itemCount?: number) {
  const row = item(id, name, null);
  if (itemCount !== undefined) {
    return { ...row, itemCount };
  }
  return row;
}

function tag(id: string, name: string) {
  return {
    id,
    name,
    color: "#336699",
    icon: "tag-outline",
    description: "",
    createdAt: now,
    updatedAt: now,
    children: [],
    parentId: null,
  };
}

function mockApi(path: string, url: URL, active: "workshop" | "spare" | "empty") {
  const workshop = group(workshopId, "Workshop", "EUR");
  const spare = group(spareId, "Spare room", "GBP");
  const empty = group(workshopId, "Empty cupboard", "USD");
  const current = active === "spare" ? spare : active === "empty" ? empty : workshop;
  const drill = item("item-1", "Cordless drill", { id: "garage", name: "Garage" });
  const mixer = item("item-2", "Stand mixer", { id: "kitchen", name: "Kitchen" });
  const lamp = item("lamp-1", "Spare lamp", { id: "cupboard", name: "Cupboard" });
  const user = {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    defaultGroupId: workshopId,
    groupIds: [workshopId, spareId],
    isSuperuser: false,
    oidcIssuer: "",
    oidcSubject: "",
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
  if (path.endsWith("/users/self/settings")) return { item: { theme: "homebox" } };
  if (path.endsWith("/users/self")) return { item: user };
  if (path.endsWith("/users/logout")) return {};
  if (path.endsWith("/groups/all")) return [workshop, spare];
  if (path.endsWith("/groups/members")) return [];
  if (path.endsWith("/groups/statistics")) {
    if (active === "empty") {
      return {
        totalItemPrice: 0,
        totalItems: 0,
        totalLocations: 0,
        totalTags: 0,
        totalUsers: 1,
        totalWithWarranty: 0,
      };
    }
    if (active === "spare") {
      return {
        totalItemPrice: 15,
        totalItems: 1,
        totalLocations: 1,
        totalTags: 1,
        totalUsers: 1,
        totalWithWarranty: 0,
      };
    }
    return {
      totalItemPrice: 1250,
      totalItems: 2,
      totalLocations: 4,
      totalTags: 3,
      totalUsers: 1,
      totalWithWarranty: 0,
    };
  }
  if (path.endsWith("/currencies")) {
    return [
      { code: "EUR", decimals: 2, local: "en", name: "Euro", symbol: "€" },
      { code: "GBP", decimals: 2, local: "en", name: "Pound", symbol: "£" },
      { code: "USD", decimals: 2, local: "en", name: "US Dollar", symbol: "$" },
    ];
  }
  if (path.endsWith("/groups")) return current;

  const tags =
    active === "spare"
      ? [tag("spare-tag", "Spare")]
      : active === "empty"
        ? []
        : [tag("tools", "Tools"), tag("electronics", "Electronics"), tag("appliances", "Appliances")];
  if (path.endsWith("/tags")) return tags;
  if (path.endsWith("/tags/tools")) return tag("tools", "Tools");
  if (path.endsWith("/tags/electronics")) return tag("electronics", "Electronics");
  if (path.endsWith("/tags/appliances")) return tag("appliances", "Appliances");
  if (path.endsWith("/tags/spare-tag")) return tag("spare-tag", "Spare");

  if (path.endsWith("/entity-types") || path.endsWith("/templates") || path.endsWith("/notifiers")) return [];

  const longName = "Very long storage location name that must stay inside the card";
  const roots =
    active === "spare"
      ? [location("cupboard", "Cupboard", 1)]
      : active === "empty"
        ? []
        : [
            location("garage", "Garage", 12),
            location("kitchen", "Kitchen", 8),
            location(longName.replace(/ /g, "-"), longName, 1),
            location("attic", "Attic"),
          ];

  if (path.endsWith("/entities/tree")) {
    return [
      {
        id: "garage",
        name: "Garage",
        type: "location",
        children: [{ id: "shelf", name: "Shelf", type: "location", children: [] }],
      },
      { id: "kitchen", name: "Kitchen", type: "location", children: [] },
      { id: "attic", name: "Attic", type: "location", children: [] },
    ];
  }
  if (path.endsWith("/entities/fields") || path.endsWith("/path")) return [];
  if (path.endsWith("/entities/item-1")) return drill;
  if (path.endsWith("/entities/item-2")) return mixer;
  if (path.endsWith("/entities/lamp-1")) return lamp;
  if (path.endsWith("/entities/attic")) return { ...location("attic", "Attic", 0), children: [] };
  if (path.endsWith("/entities/garage")) return { ...location("garage", "Garage", 12), children: [] };
  if (path.endsWith("/entities/cupboard")) return { ...location("cupboard", "Cupboard", 1), children: [] };

  if (path.endsWith("/entities")) {
    if (url.searchParams.get("isLocation") === "true") {
      const rootsOnly = url.searchParams.get("filterChildren") === "true";
      const listed = rootsOnly ? roots : [...roots, location("shelf", "Shelf", 0)];
      return { items: listed, page: 1, pageSize: listed.length, total: listed.length, totalPrice: 0 };
    }
    const parent = url.searchParams.get("parentIds");
    if (parent === "attic") {
      return { items: [], page: 1, pageSize: 12, total: 0, totalPrice: 0 };
    }
    const listed = active === "spare" ? [lamp] : active === "empty" ? [] : [drill, mixer];
    return { items: listed, page: 1, pageSize: 12, total: listed.length, totalPrice: 0 };
  }
  if (path.includes("/maintenance")) return [];
  return [];
}
