import { expect as baseExpect, test, type Locator, type Page, type Route } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 20_000 });

/**
 * Search results at the 834×1112 reference, with the API mocked.
 * This is an emulated viewport, not a real iPad, and it does not restyle Table mode.
 */

const GROUP_ID = "group-workshop";
const LONG_NAME = "Extension cord stored along the north wall cabinet with the spare filters that must wrap";

const now = "2024-06-01T00:00:00Z";

type Item = ReturnType<typeof item>;

function item(
  id: string,
  name: string,
  extra: {
    assetId?: string;
    insured?: boolean;
    quantity?: number;
    price?: number;
    locationId?: string;
    locationName?: string;
    photo?: string | null;
    tagId?: string;
  } = {}
) {
  return {
    id,
    name,
    description: "",
    assetId: extra.assetId ?? "000-100",
    archived: false,
    createdAt: now,
    updatedAt: now,
    entityType: null,
    imageId: extra.photo ?? null,
    insured: extra.insured === true,
    itemCount: 0,
    quantity: extra.quantity ?? 1,
    purchasePrice: extra.price ?? 10,
    totalPrice: extra.price ?? 10,
    thumbnailId: extra.photo ?? null,
    parent: extra.locationId ? { id: extra.locationId, name: extra.locationName ?? "Garage" } : null,
    tags: extra.tagId ? [{ id: extra.tagId, name: "Tools" }] : [],
  };
}

const ITEMS: Item[] = [
  item("item-drill", "Cordless drill", {
    assetId: "000-042",
    insured: true,
    price: 129,
    locationId: "loc-garage",
    locationName: "Garage",
    photo: "thumb-drill",
    tagId: "tag-tools",
  }),
  item("item-toolbox", "Toolbox", {
    assetId: "000-043",
    insured: false,
    price: 45.5,
    locationId: "loc-garage",
    locationName: "Garage",
    photo: null,
  }),
  item("item-mixer", "Stand mixer", {
    assetId: "000-044",
    insured: true,
    price: 349,
    locationId: "loc-kitchen",
    locationName: "Kitchen",
    photo: "thumb-mixer",
  }),
  item("item-coffee", "Coffee machine", {
    assetId: "000-045",
    insured: true,
    price: 199,
    locationId: "loc-kitchen",
    locationName: "Kitchen",
  }),
  item("item-cord", LONG_NAME, {
    assetId: "000-046",
    insured: false,
    price: 18,
    locationId: "loc-garage",
    locationName: "Garage",
    photo: null,
  }),
  item("item-bulb", "Spare bulb", {
    assetId: "000-047",
    insured: false,
    price: 4,
    locationId: "loc-cellar",
    locationName: "Cellar",
  }),
];

type MockState = {
  failItems: boolean;
  holdItems: Promise<void> | null;
  requests: { page: string; pageSize: string; q: string; parentIds: string }[];
};

function filteredItems(url: URL) {
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const parents = url.searchParams.getAll("parentIds");
  let rows = ITEMS;
  if (q.startsWith("#")) {
    const asset = q.replace("#", "").replace(/-/g, "");
    rows = rows.filter(row => row.assetId.replace(/-/g, "") === asset);
  } else if (q) {
    rows = rows.filter(row => row.name.toLowerCase().includes(q));
  }
  if (parents.length > 0) {
    rows = rows.filter(row => row.parent && parents.includes(row.parent.id));
  }
  return rows;
}

async function mockApi(page: Page, state: MockState) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  await page.route("**/entities/**/attachments/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: png })
  );
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/status")) {
      return json({
        allowRegistration: true,
        build: { buildTime: now, commit: "glass-search", version: "v0.0.0" },
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
          groupIds: [GROUP_ID],
          defaultGroupId: GROUP_ID,
          oidcIssuer: "",
          oidcSubject: "",
        },
      });
    }
    if (path.endsWith("/users/logout")) return json({});
    if (path.endsWith("/groups/all")) {
      return json([{ id: GROUP_ID, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now }]);
    }
    if (path.includes("/groups/statistics")) {
      return json({
        totalItemPrice: 744.5,
        totalItems: ITEMS.length,
        totalLocations: 3,
        totalTags: 1,
        totalUsers: 1,
        totalWithWarranty: 0,
      });
    }
    if (path.endsWith("/groups")) {
      return json({ id: GROUP_ID, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now });
    }
    if (path.endsWith("/groups/members") || path.endsWith("/groups/invitations")) return json([]);
    if (path.endsWith("/currencies")) {
      return json([{ code: "EUR", decimals: 2, local: "en-US", name: "Euro", symbol: "€" }]);
    }
    if (path.endsWith("/tags")) {
      return json([
        {
          id: "tag-tools",
          name: "Tools",
          color: "#2f6f4e",
          icon: "",
          description: "",
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    if (path.includes("/entities/tree")) {
      return json([
        { id: "loc-garage", name: "Garage", type: "location", children: [] },
        { id: "loc-kitchen", name: "Kitchen", type: "location", children: [] },
        { id: "loc-cellar", name: "Cellar", type: "location", children: [] },
      ]);
    }
    if (path.endsWith("/entities/fields")) return json([]);
    if (path.endsWith("/entities") && url.searchParams.get("isLocation") === "true") {
      return json({
        items: [
          { id: "loc-garage", name: "Garage" },
          { id: "loc-kitchen", name: "Kitchen" },
          { id: "loc-cellar", name: "Cellar" },
        ],
        page: 1,
        pageSize: 50,
        total: 3,
        totalPrice: 0,
      });
    }
    if (path.endsWith("/entities")) {
      if (state.holdItems) {
        await state.holdItems;
      }
      if (state.failItems) {
        return json({ error: "search unavailable" }, 500);
      }
      const pageNumber = Number(url.searchParams.get("page") || "1");
      const pageSize = Number(url.searchParams.get("pageSize") || "12");
      state.requests.push({
        page: String(pageNumber),
        pageSize: String(pageSize),
        q: url.searchParams.get("q") || "",
        parentIds: url.searchParams.getAll("parentIds").join(","),
      });
      const rows = filteredItems(url);
      const start = Math.max(0, (pageNumber - 1) * pageSize);
      return json({
        items: rows.slice(start, start + pageSize),
        page: pageNumber,
        pageSize,
        total: rows.length,
        totalPrice: 0,
      });
    }
    if (path.includes("/entities/item-")) {
      const id = path.split("/").filter(Boolean).pop() ?? "";
      return json(ITEMS.find(row => row.id === id) ?? ITEMS[0]);
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

async function signedIn(page: Page, preferences: Record<string, unknown>) {
  await page.addInitScript(prefs => {
    localStorage.setItem("homebox/preferences/location", JSON.stringify(prefs));
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  }, preferences);
}

async function savedPageSize(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("homebox/preferences/location");
    if (!raw) return null;
    return JSON.parse(raw).itemsPerTablePage as number;
  });
}

function card(page: Page, id: string) {
  return page.getByTestId(`search-result-card-${id}`);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing bounding box");
  return box;
}

test.describe("Glass v5 Search pagination", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3000";
    page.setDefaultTimeout(20_000);
    await page.context().addCookies([{ name: "hb.auth.session", value: "true", url: origin }]);
  });

  test("pages four cards from the API total and keeps the table page size", async ({ page }) => {
    test.setTimeout(120_000);
    const state: MockState = { failItems: false, holdItems: null, requests: [] };
    await signedIn(page, {
      itemDisplayView: "card",
      itemsPerTablePage: 24,
      quickActions: { enabled: true },
    });
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto("/items");

    await expect(page.getByTestId("search-heading")).toBeVisible();
    await expect(page.getByTestId("search-count")).toHaveText("6 results");
    await expect(page.getByTestId("search-range")).toHaveText(/Showing 1-4 of 6/);
    await expect(page.getByTestId("search-selected")).toHaveText("0 selected");
    await expect(page.getByTestId("search-page-status")).toHaveText("1 of 2");
    await expect(page.getByTestId("search-page-prev")).toBeDisabled();
    await expect(page.getByTestId("search-page-next")).toBeEnabled();
    expect(state.requests.some(request => request.pageSize === "4" && request.page === "1")).toBe(true);
    expect(state.requests.some(request => request.pageSize === "24")).toBe(false);

    const drill = card(page, "item-drill");
    const toolbox = card(page, "item-toolbox");
    await expect(drill).toBeVisible();
    await expect(drill.getByTestId("search-card-name")).toHaveText("Cordless drill");
    await expect(drill.getByTestId("search-card-asset")).toHaveText("000-042");
    await expect(drill.getByTestId("search-card-insured")).toHaveText("Insured");
    await expect(drill.getByTestId("search-card-location")).toHaveText("Garage");
    await expect(drill.getByTestId("search-card-value")).toContainText("129");
    await expect(drill.getByTestId("search-card-value")).toContainText("€");
    await expect(drill.getByTestId("search-card-value")).not.toContainText("$129.00");
    await expect(drill.getByTestId("search-card-photo")).toBeVisible();
    await expect(toolbox.getByTestId("search-card-no-photo")).toBeVisible();
    await expect(toolbox.getByTestId("search-card-insured")).toHaveText("Not insured");

    const drillBox = await boxOf(drill);
    const toolboxBox = await boxOf(toolbox);
    expect(Math.abs(drillBox.y - toolboxBox.y)).toBeLessThan(8);
    expect(toolboxBox.x).toBeGreaterThan(drillBox.x + 40);
    const select = drill.getByTestId("search-card-select-item-drill");
    const selectBox = await boxOf(select);
    expect(selectBox.width).toBeGreaterThanOrEqual(44);
    expect(selectBox.height).toBeGreaterThanOrEqual(44);

    await page.getByTestId("search-table-settings").click();
    await expect(page.getByTestId("search-page-size-locked")).toContainText("24");
    await expect(page.getByTestId("table-page-size")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByTestId("search-page-next").click();
    await expect(page.getByTestId("search-page-status")).toHaveText("2 of 2");
    await expect(page.getByTestId("search-range")).toHaveText(/Showing 5-6 of 6/);
    await expect(page.getByTestId("search-page-next")).toBeDisabled();
    await expect(page.getByTestId("search-page-prev")).toBeEnabled();
    await expect(page.getByTestId("search-selected")).toHaveText("0 selected");
    await expect(card(page, "item-cord")).toBeVisible();
    await expect(card(page, "item-cord").getByTestId("search-card-name")).toHaveText(LONG_NAME);
    await expect(card(page, "item-drill")).toHaveCount(0);
    expect(state.requests.at(-1)?.pageSize).toBe("4");
    expect(state.requests.at(-1)?.page).toBe("2");

    await page.getByTestId("search-page-prev").click();
    await expect(page.getByTestId("search-page-status")).toHaveText("1 of 2");
    await select.focus();
    await expect(select).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/items/);
    await expect(page.getByTestId("search-selected")).toHaveText("1 selected");
    await page.keyboard.press("Tab");
    await expect(drill.getByTestId("search-card-link-item-drill")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/item\/item-drill$/);

    await page.goto("/items");
    await expect(page.getByTestId("search-page-status")).toHaveText("1 of 2");
    await page.getByTestId("search-card-select-item-drill").click();
    await expect(page.getByTestId("search-selected")).toHaveText("1 selected");
    await page.getByTestId("search-page-next").click();
    await expect(page.getByTestId("search-selected")).toHaveText("0 selected");
    await expect(page.getByTestId("search-card-select-item-cord")).not.toBeChecked();

    await page.getByTestId("search-query").fill("mixer");
    await page.getByTestId("search-query").press("Enter");
    await expect(page.getByTestId("search-count")).toHaveText("1 results");
    await expect(page.getByTestId("search-range")).toHaveText(/Showing 1-1 of 1/);
    await expect(page.getByTestId("search-page-status")).toHaveText("1 of 1");
    await expect(page.getByTestId("search-page-next")).toBeDisabled();
    await expect(card(page, "item-mixer")).toBeVisible();
    await expect(card(page, "item-drill")).toHaveCount(0);

    await page.getByTestId("search-query").fill("");
    await page.getByTestId("search-query").press("Enter");
    await expect(page.getByTestId("search-count")).toHaveText("6 results");
    await page.getByTestId("search-locations").click();
    await page.getByRole("dialog", { name: "Locations" }).getByRole("checkbox", { name: "Garage" }).click();
    await expect(page.getByTestId("search-count")).toHaveText("3 results");
    await expect(page.getByTestId("search-range")).toHaveText(/Showing 1-3 of 3/);
    await expect(page.getByTestId("search-page-status")).toHaveCount(1);
    await expect(page.getByTestId("search-page-status")).toHaveText("1 of 1");
    expect(state.requests.some(request => request.parentIds.includes("loc-garage"))).toBe(true);

    await page.getByTestId("search-view-table").click();
    await expect.poll(() => state.requests.at(-1)?.pageSize).toBe("24");
    expect(await savedPageSize(page)).toBe(24);
    await page.reload();
    await expect.poll(() => state.requests.at(-1)?.pageSize).toBe("24");
    expect(await savedPageSize(page)).toBe(24);

    await page.getByTestId("search-view-card").click();
    await expect.poll(() => state.requests.at(-1)?.pageSize).toBe("4");
    expect(await savedPageSize(page)).toBe(24);
  });

  test("clamps an impossible page and shows an empty range without a page fraction", async ({ page }) => {
    test.setTimeout(90_000);
    const state: MockState = { failItems: false, holdItems: null, requests: [] };
    await signedIn(page, { itemDisplayView: "card", itemsPerTablePage: 12, quickActions: { enabled: true } });
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });

    await page.goto("/items?page=9");
    await expect(page.getByTestId("search-range")).toHaveText(/Showing 5-6 of 6/);
    await expect(page.getByTestId("search-page-status")).toHaveText("2 of 2");
    await expect(page.getByTestId("search-page-next")).toBeDisabled();
    expect(state.requests.some(request => request.page === "2" && request.pageSize === "4")).toBe(true);

    await page.goto("/items?q=zzzz-none&page=3");
    await expect(page.getByTestId("search-empty")).toBeVisible();
    await expect(page.getByTestId("search-error")).toHaveCount(0);
    await expect(page.getByTestId("search-range")).toHaveText("Showing 0 of 0 · 0 selected");
    await expect(page.getByTestId("search-page-status")).toHaveCount(0);
    await expect(page.getByTestId("search-page-prev")).toBeDisabled();
    await expect(page.getByTestId("search-page-next")).toBeDisabled();
    await expect(page.getByTestId("search-range")).not.toContainText("-");
  });

  test("keeps loading and error distinct, and reaches filters from the keyboard", async ({ page }) => {
    test.setTimeout(90_000);
    let release = () => {};
    const state: MockState = {
      failItems: false,
      holdItems: new Promise(resolve => {
        release = resolve;
      }),
      requests: [],
    };
    await signedIn(page, { itemDisplayView: "card", itemsPerTablePage: 24, quickActions: { enabled: false } });
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });
    const firstSearch = page.waitForRequest(
      request => request.url().includes("/entities") && request.url().includes("pageSize=")
    );
    await page.goto("/items");
    await firstSearch;
    await expect(page.getByTestId("search-loading")).toBeAttached();
    await expect(page.getByTestId("search-error")).toHaveCount(0);
    await expect(page.getByTestId("search-empty")).toHaveCount(0);
    release();
    state.holdItems = null;
    await expect(card(page, "item-drill")).toBeVisible();
    await expect(card(page, "item-drill").getByTestId("search-card-select-off")).toBeVisible();
    await expect(card(page, "item-drill").getByTestId("search-card-select-item-drill")).toHaveCount(0);

    state.failItems = true;
    await page.getByTestId("search-query").fill("drill");
    await page.getByTestId("search-query").press("Enter");
    await expect(page.getByTestId("search-error")).toBeVisible();
    await expect(page.getByTestId("search-empty")).toHaveCount(0);
    await expect(page.getByTestId("search-page-status")).toHaveCount(0);
    await expect(page.getByTestId("search-page-next")).toBeDisabled();
    await page.waitForTimeout(1200);

    state.failItems = false;
    await page.getByTestId("search-retry").click();
    await expect(card(page, "item-drill")).toBeVisible();
    await expect(page.getByTestId("search-error")).toHaveCount(0);
    await page.getByTestId("search-query").fill("");
    await page.getByTestId("search-query").press("Enter");
    await expect(page.getByTestId("search-page-next")).toBeEnabled();

    const locations = page.getByTestId("search-locations");
    await locations.focus();
    await expect(locations).toBeFocused();
    await page.keyboard.press("Enter");
    const locationDialog = page.getByRole("dialog", { name: "Locations" });
    await expect(locationDialog.getByRole("checkbox", { name: "Garage" })).toBeVisible();
    await page.keyboard.press("Escape");
    const next = page.getByTestId("search-page-next");
    await next.focus();
    await expect(next).toBeFocused();
  });
});
