import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/**
 * My Home overview with mocked collection data. This is not real-iPad hardware
 * validation, and it does not judge later item-detail styling.
 */

const ITEM_ID = "item-drill";
const GROUP_ID = "group-workshop";
const SPARE_ID = "group-spare";
const ATTIC_ID = "loc-attic";
const GARAGE_ID = "loc-garage";
const LONG_LOCATION = "North wall cabinet with the spare filters and the extension cords that must wrap";

const now = "2024-06-01T00:00:00Z";

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("missing bounding box");
  }
  return box;
}

function entity(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: "",
    assetId: "000-042",
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
    purchasePrice: 129,
    quantity: 1,
    serialNumber: "",
    soldDate: "0001-01-01T00:00:00Z",
    soldNotes: "",
    soldPrice: 0,
    soldTo: "",
    syncChildEntityLocations: false,
    tags: [],
    thumbnailId: null,
    totalPrice: 129,
    warrantyDetails: "",
    warrantyExpires: "0001-01-01T00:00:00Z",
    ...extra,
  };
}

function collection(id: string) {
  const spare = id === SPARE_ID;
  return {
    group: {
      id,
      name: spare ? "Spare room" : "Workshop",
      currency: spare ? "GBP" : "EUR",
      createdAt: now,
      updatedAt: now,
    },
    stats: {
      totalItemPrice: spare ? 40 : 1250,
      totalItems: spare ? 1 : 1,
      totalLocations: spare ? 1 : 3,
      totalTags: spare ? 1 : 2,
      totalUsers: 1,
      totalWithWarranty: 0,
    },
    item: entity(ITEM_ID, spare ? "Spare bulb" : "Cordless drill", {
      purchasePrice: spare ? 40 : 129,
      totalPrice: spare ? 40 : 129,
    }),
    locations: spare
      ? [{ id: "loc-cellar", name: "Cellar", itemCount: 3, description: "", createdAt: now, updatedAt: now }]
      : [
          { id: GARAGE_ID, name: "Garage", itemCount: 12, description: "", createdAt: now, updatedAt: now },
          { id: ATTIC_ID, name: "Attic", description: "", createdAt: now, updatedAt: now },
          {
            id: "loc-long",
            name: LONG_LOCATION,
            itemCount: 1,
            description: "",
            createdAt: now,
            updatedAt: now,
          },
        ],
    tags: spare
      ? [{ id: "tag-spare", name: "Spare parts", color: "", icon: "", description: "", createdAt: now, updatedAt: now }]
      : [
          {
            id: "tag-tools",
            name: "Tools",
            color: "#2f6f4e",
            icon: "wrench-outline",
            description: "",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "tag-long",
            name: "Appliances stored along the east wall of the workshop",
            color: "",
            icon: "tag-outline",
            description: "",
            createdAt: now,
            updatedAt: now,
          },
        ],
  };
}

async function mockApi(page: Page, state: { failLocations: boolean }) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const tenant = request.headers()["x-tenant"] || GROUP_ID;
    const data = collection(tenant);
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/status")) {
      return json({
        allowRegistration: true,
        build: { buildTime: now, commit: "glass-home", version: "v0.0.0" },
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
    if (path.endsWith("/users/self")) {
      return json({
        item: {
          id: "user-1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          isSuperuser: false,
          groupIds: [GROUP_ID, SPARE_ID],
          defaultGroupId: GROUP_ID,
          oidcIssuer: "",
          oidcSubject: "",
        },
      });
    }
    if (path.endsWith("/users/logout")) return json({});
    if (path.endsWith("/groups/all")) return json([collection(GROUP_ID).group, collection(SPARE_ID).group]);
    if (path.includes("/groups/statistics")) return json(data.stats);
    if (path.endsWith("/groups")) return json(data.group);
    if (path.endsWith("/groups/members")) return json([]);
    if (path.endsWith("/groups/invitations")) return json([]);
    if (path.endsWith("/currencies")) {
      return json([
        { code: "EUR", decimals: 2, local: "en-US", name: "Euro", symbol: "€" },
        { code: "GBP", decimals: 2, local: "en-GB", name: "Pound", symbol: "£" },
      ]);
    }
    if (path.endsWith("/tags")) return json(data.tags);
    if (path.includes("/tags/")) {
      const id = path.split("/").pop();
      return json(data.tags.find(tag => tag.id === id) ?? data.tags[0]);
    }
    if (path.includes("/entities/tree")) {
      return json(
        data.locations.map(location => ({
          id: location.id,
          name: location.name,
          type: "location",
          children: [],
        }))
      );
    }
    if (path.endsWith("/entities") && url.searchParams.get("isLocation") === "true") {
      if (state.failLocations) {
        return json({ error: "locations unavailable" }, 500);
      }
      return json({
        items: data.locations,
        page: 1,
        pageSize: data.locations.length,
        total: data.locations.length,
        totalPrice: 0,
      });
    }
    if (path.endsWith("/entities")) {
      const parent = url.searchParams.get("parentIds");
      if (parent === ATTIC_ID || parent === ITEM_ID) {
        return json({ items: [], page: 1, pageSize: 10, total: 0, totalPrice: 0 });
      }
      return json({
        items: [data.item],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPrice: data.item.totalPrice,
      });
    }
    if (path.endsWith("/path")) return json([]);
    if (path.includes(`/entities/${ITEM_ID}`)) return json(data.item);
    if (path.includes(`/entities/${ATTIC_ID}`)) {
      return json(
        entity(ATTIC_ID, "Attic", { itemCount: 0, entityType: { id: "et-loc", name: "Location", isLocation: true } })
      );
    }
    if (path.includes("/entities/")) {
      const id = path.split("/").filter(Boolean).pop() ?? "";
      const location = data.locations.find(item => item.id === id);
      if (location) {
        return json(
          entity(location.id, location.name, { itemCount: "itemCount" in location ? location.itemCount : 0 })
        );
      }
    }
    if (
      path.endsWith("/entity-types") ||
      path.endsWith("/templates") ||
      path.endsWith("/notifiers") ||
      path.endsWith("/maintenance")
    ) {
      return json([]);
    }
    return json(request.method() === "GET" ? [] : {});
  });
}

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
}

async function expectNoHorizontalClip(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > viewportWidth + 1 || rect.left < -1)) {
        offenders.push(
          `${el.tagName}.${String(el.className).slice(0, 80)} ${Math.round(rect.left)}-${Math.round(rect.right)}`
        );
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: viewportWidth,
      offenders: offenders.slice(0, 8),
    };
  });
  expect(metrics.scrollWidth, `${label}: ${metrics.offenders.join(" | ")}`).toBeLessThanOrEqual(
    metrics.clientWidth + 1
  );
}

test.describe("Glass v5 My Home overview", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3000";
    page.setDefaultTimeout(20_000);
    await page.context().addCookies([{ name: "hb.auth.session", value: "true", url: origin }]);
    await signedIn(page);
  });

  test("browses real locations and tags, including an empty location, and opens the same item", async ({ page }) => {
    test.setTimeout(120_000);
    const state = { failLocations: false };
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto("/home");

    await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-collection-name")).toHaveText("Workshop");
    await expect(page.getByTestId("home-currency")).toContainText("EUR");
    await expect(page.getByTestId("home-stat-value")).not.toContainText("$2,480");
    await expect(page.getByTestId("home-stat-value")).toContainText("1,250");
    const valueBox = await boxOf(page.getByTestId("home-stat-value"));
    expect(valueBox.height, "ordinary collection value fits on one line at iPad width").toBeLessThan(40);

    const grid = page.getByTestId("home-locations-grid");
    await expect(grid).toBeVisible();
    const garage = page.getByTestId(`home-location-card-${GARAGE_ID}`);
    const attic = page.getByTestId(`home-location-card-${ATTIC_ID}`);
    await expect(garage).toBeVisible();
    await expect(attic).toBeVisible();
    await expect(attic).toContainText("No items yet");
    await expect(garage).toContainText("12 items");
    await expect(page.getByText("All 6")).toHaveCount(0);

    const garageBox = await boxOf(garage);
    const atticBox = await boxOf(attic);
    expect(Math.abs(garageBox.y - atticBox.y)).toBeLessThan(8);
    expect(atticBox.x).toBeGreaterThan(garageBox.x + garageBox.width - 4);
    expect(garageBox.height).toBeGreaterThanOrEqual(44);
    expect(atticBox.width).toBeGreaterThanOrEqual(44);

    await expect(page.getByTestId("home-tags-view-all")).toContainText("All 2");
    await expect(page.getByTestId("home-tag-tag-tools")).toBeVisible();
    await expectNoHorizontalClip(page, "ipad home");

    await garage.focus();
    await expect(garage).toBeFocused();
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, shadow: style.boxShadow };
    });
    const visible =
      (focus?.outline && focus.outline !== "none" && focus.outlineWidth !== "0px") ||
      (focus?.shadow && focus.shadow !== "none");
    expect(visible, "location card focus").toBe(true);
    await page.keyboard.press("Tab");
    await expect(attic).toBeFocused();

    await page.getByTestId("home-recent-card-" + ITEM_ID).click();
    await expect(page).toHaveURL(new RegExp(`/item/${ITEM_ID}$`), { timeout: 20_000 });
    await expect(page.getByTestId("shell-search")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Cordless drill" })).toBeVisible();

    await page.goto("/items");
    await expect(page.getByTestId("shell-search")).toBeVisible();
    await page.getByRole("link", { name: "Cordless drill" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/item/${ITEM_ID}$`), { timeout: 20_000 });
    await expect(page.getByTestId("shell-search")).toBeVisible();

    await page.goto("/home");
    await page.getByTestId(`home-location-card-${ATTIC_ID}`).click();
    await expect(page).toHaveURL(new RegExp(`/location/${ATTIC_ID}$`), { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Attic" })).toBeVisible();
    await expect(page.getByTestId("location-items-empty")).toHaveText("This location has no items yet.");
    await expect(page.getByTestId("shell-search")).toBeVisible();

    await page.goto("/home");
    await page.getByTestId("home-locations-view-all").click();
    await expect(page).toHaveURL(/\/locations/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();

    await page.goto("/home");
    await page.getByTestId("home-tags-view-all").click();
    await expect(page).toHaveURL(/\/tags$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();

    await page.goto("/home");
    await page.getByTestId("home-tag-tag-tools").click();
    await expect(page).toHaveURL(/\/tag\/tag-tools/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();
  });

  test("reflows on a narrow viewport and stacks the location grid", async ({ page }) => {
    test.setTimeout(60_000);
    await mockApi(page, { failLocations: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    await expect(page.getByTestId(`home-location-card-${GARAGE_ID}`)).toBeVisible();
    const garage = await boxOf(page.getByTestId(`home-location-card-${GARAGE_ID}`));
    const attic = await boxOf(page.getByTestId(`home-location-card-${ATTIC_ID}`));
    expect(Math.abs(garage.x - attic.x)).toBeLessThan(8);
    expect(attic.y).toBeGreaterThan(garage.y + 8);
    await expectNoHorizontalClip(page, "narrow home");

    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoHorizontalClip(page, "wide home");
  });

  test("shows a location error instead of an empty collection, then recovers", async ({ page }) => {
    test.setTimeout(60_000);
    const state = { failLocations: true };
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto("/home");
    await expect(page.getByTestId("home-locations-error")).toBeVisible();
    await expect(page.getByTestId("home-locations-grid")).toHaveCount(0);
    await expect(page.getByTestId("home-location-empty")).toHaveCount(0);
    await expect(page.getByTestId("home-tags-view-all")).toContainText("All 2");

    state.failLocations = false;
    await page.getByTestId("home-locations-retry").click();
    await expect(page.getByTestId(`home-location-card-${ATTIC_ID}`)).toBeVisible();
    await expect(page.getByTestId(`home-location-card-${ATTIC_ID}`)).toContainText("No items yet");
  });

  test("reloads another collection's locations instead of keeping the previous ones", async ({ page }) => {
    test.setTimeout(90_000);
    await mockApi(page, { failLocations: false });
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto("/home");
    await expect(page.getByTestId(`home-location-card-${GARAGE_ID}`)).toBeVisible();

    await page.getByRole("combobox", { name: /select collection/i }).click();
    await page.getByRole("option", { name: "Spare room" }).click();
    await expect(page.getByTestId("home-collection-name")).toHaveText("Spare room", { timeout: 20_000 });
    await expect(page.getByTestId("home-location-card-loc-cellar")).toBeVisible();
    await expect(page.getByTestId(`home-location-card-${GARAGE_ID}`)).toHaveCount(0);
    await expect(page.getByTestId("home-currency")).toContainText("GBP");
  });
});
