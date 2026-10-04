import { expect, test, type Page, type Route } from "@playwright/test";

expect.configure({ timeout: 30_000 });

/**
 * Search at the reference iPad viewport against a mocked API.
 * Pagination, selection and preferences are checked here; a real collection is not.
 */

const workshopId = "11111111-1111-4111-8111-111111111111";
const now = "2026-03-02T12:00:00Z";
const longName = "Very long cordless drill name that must stay inside the card without clipping the page";
const longLocation = "Very long storage location name that must stay inside the card";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "hb.auth.session",
      value: "true",
      url: process.env.E2E_BASE_URL || "http://localhost:3000",
    },
  ]);
});

test("pages four compact cards from the API and keeps selection off the item link", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page);
  await seedPreferences(page, true);
  await page.setViewportSize({ width: 834, height: 1112 });

  const firstList = page.waitForRequest(
    req => isItemList(req.url()) && new URL(req.url()).searchParams.get("pageSize") === "4"
  );
  await page.goto("/items", { waitUntil: "domcontentloaded" });
  await firstList;
  await expect(page.getByTestId("search-heading")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("search-card-grid")).toBeVisible();
  await expect(page.getByTestId("search-result-card")).toHaveCount(4);
  await expect(page.getByTestId("search-range")).toHaveText("1–4 of 6");
  await expect(page.getByTestId("search-page-status")).toHaveText("Page 1 of 2");
  await expect(page.getByTestId("search-prev")).toBeDisabled();
  await expect(page.getByTestId("search-next")).toBeEnabled();
  await expect(page.getByTestId("search-status")).toContainText("6");

  const first = page.getByTestId("search-result-card").nth(0);
  const second = page.getByTestId("search-result-card").nth(1);
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox && secondBox && Math.abs(firstBox.y - secondBox.y) < 8).toBeTruthy();
  expect(firstBox && secondBox && secondBox.x > firstBox.x + 40).toBeTruthy();
  await expectNoHorizontalClip(page);

  await expect(first.getByTestId("search-card-name")).toHaveText("Cordless drill");
  await expect(first.getByTestId("search-card-asset")).toContainText("000-042");
  await expect(first.getByTestId("search-card-quantity")).toBeVisible();
  await expect(first.getByTestId("search-card-insurance")).toHaveText("Insured");
  await expect(first.getByTestId("search-card-location")).toContainText("Garage");
  await expect(first.getByTestId("search-card-value")).toContainText("€", { timeout: 15_000 });
  await expect(first.getByTestId("search-card-photo")).toHaveAttribute("src", /attachments\/thumb-1/);
  await expect(second.getByTestId("search-card-no-photo")).toBeVisible();
  await expect(second.getByTestId("search-card-insurance")).toHaveText("Not insured");
  await expect(page.getByTestId("search-card-name").filter({ hasText: longName })).toBeVisible();
  const longBox = await page.getByTestId("search-card-name").filter({ hasText: longName }).boundingBox();
  expect(longBox && longBox.x + longBox.width).toBeLessThanOrEqual(834);

  const strip = first.getByTestId("search-selection-strip");
  const stripBox = await strip.boundingBox();
  expect(stripBox?.height).toBeGreaterThanOrEqual(48);
  const select = first.getByTestId("search-card-select");
  const selectBox = await select.boundingBox();
  expect(selectBox?.width).toBeGreaterThanOrEqual(48);
  expect(selectBox?.height).toBeGreaterThanOrEqual(48);

  await select.focus();
  await page.keyboard.press("Space");
  await expect(select).toBeChecked();
  await expect(page).toHaveURL(/\/items/);
  await expect(second.getByTestId("search-card-select")).not.toBeChecked();

  const link = second.getByTestId("search-card-link");
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/item\/item-2\/?$/);
  await page.goBack();
  await expect(page.getByTestId("search-result-card")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByTestId("search-result-card").nth(1).getByTestId("search-card-select")).not.toBeChecked();

  await page.getByTestId("search-next").click();
  await expect(page.getByTestId("search-range")).toHaveText("5–6 of 6");
  await expect(page.getByTestId("search-page-status")).toHaveText("Page 2 of 2");
  await expect(page.getByTestId("search-result-card")).toHaveCount(2);
  await expect(page.getByTestId("search-next")).toBeDisabled();
  await expect(page.getByTestId("search-prev")).toBeEnabled();
  await expect(page.getByTestId("search-card-select").first()).not.toBeChecked();
  await expect(page.getByTestId("search-card-select").nth(1)).not.toBeChecked();

  await page.getByTestId("search-prev").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("search-range")).toHaveText("1–4 of 6");
  await expect(page.getByTestId("search-prev")).toBeDisabled();

  await page.getByTestId("search-query").fill("zzzz-no-match");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-empty")).toBeVisible();
  await expect(page.getByTestId("search-range")).toHaveText("0–0 of 0");
  await expect(page.getByTestId("search-page-status")).not.toHaveText(/Page/);
  await expect(page.getByTestId("search-prev")).toBeDisabled();
  await expect(page.getByTestId("search-next")).toBeDisabled();
  await expect(page.getByTestId("search-error")).toHaveCount(0);

  await page.goto("/items?page=999", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("search-range")).toHaveText("5–6 of 6", { timeout: 30_000 });
  await expect(page.getByTestId("search-page-status")).toHaveText("Page 2 of 2");
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByTestId("search-status")).toContainText("6");
  await expect(page.getByTestId("search-empty")).toHaveCount(0);
});

test("filters reset the page and table preferences survive card density", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page);
  await seedPreferences(page, true);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/items", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("search-next")).toBeEnabled({ timeout: 90_000 });
  await page.getByTestId("search-next").click();
  await expect(page.getByTestId("search-page-status")).toHaveText("Page 2 of 2");

  await page.getByRole("button", { name: "Locations" }).click();
  const filtered = page.waitForRequest(req => {
    if (!isItemList(req.url())) return false;
    const url = new URL(req.url());
    return url.searchParams.get("parentIds") === "garage" && url.searchParams.get("page") === "1";
  });
  await page.getByLabel("Locations").getByText("Garage", { exact: true }).click();
  await filtered;
  await expect(page.getByTestId("search-range")).toHaveText("1–3 of 3");
  await expect(page).toHaveURL(/loc=/);

  const shelled = page.waitForRequest(req => {
    if (!isItemList(req.url())) return false;
    const url = new URL(req.url());
    return url.searchParams.get("q") === "mixer" && url.searchParams.get("parentIds") === "garage";
  });
  await page.getByTestId("shell-search").locator("input[name='q']").fill("mixer");
  await page.getByTestId("shell-search").locator("button[type='submit']").click();
  await shelled;
  await expect(page.getByTestId("search-query")).toHaveValue("mixer");
  await expect(page).toHaveURL(/loc=/);

  await page.getByTestId("search-query").fill("");
  await page.getByTestId("search-submit").click();
  await page.getByRole("button", { name: /Locations/ }).click();
  await page.getByLabel("Locations").getByText("Garage", { exact: true }).click();
  await expect(page.getByTestId("search-range")).toHaveText("1–4 of 6", { timeout: 30_000 });

  await page.getByTestId("table-settings").click();
  await expect(page.getByTestId("search-page-size-locked")).toBeVisible();
  await expect(page.getByTestId("rows-per-page")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).first().click();

  const tableRequest = page.waitForRequest(
    req => isItemList(req.url()) && new URL(req.url()).searchParams.get("pageSize") === "24"
  );
  await page.getByTestId("search-view-table").click();
  await tableRequest;
  await expect(page.getByTestId("search-result-card")).toHaveCount(0);

  await page.getByTestId("table-settings").click();
  await expect(page.getByTestId("rows-per-page")).toBeVisible();
  await page.getByTestId("rows-per-page").click();
  await page.getByRole("option", { name: "48", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location") || "{}").itemsPerTablePage)
    )
    .toBe(48);
  await page.getByRole("button", { name: "Close" }).first().click();

  const cardRequest = page.waitForRequest(
    req => isItemList(req.url()) && new URL(req.url()).searchParams.get("pageSize") === "4"
  );
  await page.getByTestId("search-view-card").click();
  await cardRequest;
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location") || "{}").itemsPerTablePage)
    )
    .toBe(48);

  await page.reload();
  await expect(page.getByTestId("search-result-card")).toHaveCount(4, { timeout: 30_000 });
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location") || "{}").itemsPerTablePage)
    )
    .toBe(48);
  const tableAgain = page.waitForRequest(
    req => isItemList(req.url()) && new URL(req.url()).searchParams.get("pageSize") === "48"
  );
  await page.getByTestId("search-view-table").click();
  await tableAgain;
});

test("loading and error stay distinct, and disabled quick actions keep the saved page size", async ({ page }) => {
  test.setTimeout(180_000);
  const flags = { failItems: false, delayItems: true };
  await installApi(page, flags);
  await seedPreferences(page, false);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/items", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("search-status")).toHaveText("Searching inventory…", { timeout: 90_000 });
  await expect(page.getByTestId("search-next")).toBeDisabled();
  await expect(page.getByTestId("search-empty")).toHaveCount(0);
  flags.delayItems = false;
  await expect(page.getByTestId("search-result-card")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByTestId("search-card-select")).toHaveCount(0);
  await expect(page.getByTestId("search-selection-strip").first()).toBeVisible();
  await expect(page.getByTestId("search-card-link").first()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location") || "{}").itemsPerTablePage)
    )
    .toBe(24);

  flags.failItems = true;
  await page.getByTestId("search-query").fill("drill");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-error")).toBeVisible();
  await expect(page.getByTestId("search-retry")).toBeVisible();
  await expect(page.getByTestId("search-empty")).toHaveCount(0);
  await expect(page).not.toHaveURL(/page=0/);
  await page.getByTestId("search-retry").focus();
  flags.failItems = false;
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("search-card-name").filter({ hasText: /^Cordless drill$/ })).toBeVisible();
  await expect(page.getByTestId("search-error")).toHaveCount(0);

  await page.getByTestId("table-settings").click();
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByTestId("search-card-select").first()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location") || "{}").itemsPerTablePage)
    )
    .toBe(24);
});

async function seedPreferences(page: Page, quickActions: boolean) {
  await page.addInitScript(enabled => {
    if (localStorage.getItem("homebox/preferences/location")) {
      return;
    }
    localStorage.setItem(
      "homebox/preferences/location",
      JSON.stringify({ itemsPerTablePage: 24, itemDisplayView: "card", quickActions: { enabled } })
    );
  }, quickActions);
}

function isItemList(url: string) {
  const parsed = new URL(url);
  return parsed.pathname.replace(/\/$/, "").endsWith("/entities") && parsed.searchParams.get("isLocation") !== "true";
}

async function installApi(page: Page, flags = { failItems: false, delayItems: false }) {
  await page.addInitScript(() => {
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
  await page.route("**/api/v1/**", async route => {
    await fulfill(route, flags);
  });
  await page.route("**/entities/**/attachments/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    });
  });
}

async function fulfill(route: Route, flags: { failItems: boolean; delayItems: boolean }) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/\/$/, "");
  if (path.endsWith("/entities") && url.searchParams.get("isLocation") !== "true") {
    if (flags.delayItems) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    if (flags.failItems) {
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return;
    }
  }
  await route.fulfill({
    status: route.request().method() === "POST" && path.endsWith("/logout") ? 204 : 200,
    contentType: "application/json",
    body: JSON.stringify(mockApi(path, url)),
  });
}

function mockApi(path: string, url: URL) {
  const user = {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    defaultGroupId: workshopId,
    groupIds: [workshopId],
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
  if (path.endsWith("/groups/all"))
    return [{ id: workshopId, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now }];
  if (path.endsWith("/groups/members")) return [];
  if (path.endsWith("/groups/statistics")) {
    return { totalItemPrice: 0, totalItems: 6, totalLocations: 2, totalTags: 1, totalUsers: 1, totalWithWarranty: 0 };
  }
  if (path.endsWith("/currencies")) {
    return [{ code: "EUR", decimals: 2, local: "en", name: "Euro", symbol: "€" }];
  }
  if (path.endsWith("/groups"))
    return { id: workshopId, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now };
  if (path.endsWith("/tags")) return [{ id: "tools", name: "Tools", color: "#336699" }];
  if (path.endsWith("/entity-types") || path.endsWith("/templates") || path.endsWith("/notifiers")) return [];
  if (path.endsWith("/entities/fields") || path.endsWith("/path")) return [];
  if (path.endsWith("/entities/tree")) {
    return [{ id: "garage", name: "Garage", type: "location", children: [] }];
  }
  if (path.endsWith("/entities/item-1")) return catalog()[0];
  if (path.endsWith("/entities/item-2")) return catalog()[1];
  if (path.endsWith("/entities")) {
    if (url.searchParams.get("isLocation") === "true") {
      return {
        items: [
          { id: "garage", name: "Garage", itemCount: 3 },
          { id: "kitchen", name: "Kitchen", itemCount: 1 },
          { id: longLocation.replace(/ /g, "-"), name: longLocation, itemCount: 1 },
        ],
        page: 1,
        pageSize: 50,
        total: 3,
        totalPrice: 0,
      };
    }
    return listItems(url);
  }
  if (path.includes("/maintenance")) return [];
  return [];
}

function listItems(url: URL) {
  const query = url.searchParams.get("q") || "";
  const parent = url.searchParams.get("parentIds") || "";
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Number(url.searchParams.get("pageSize") || "12");
  let items = catalog();
  if (query.startsWith("#")) {
    const wanted = query.replace("#", "").replace(/-/g, "");
    items = items.filter(item => item.assetId.replace(/-/g, "") === wanted);
  } else if (query) {
    items = items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  }
  if (parent) {
    items = items.filter(item => item.parent?.id === parent);
  }
  const total = items.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const slice = start >= total ? [] : items.slice(start, start + pageSize);
  return { items: slice, page, pageSize, total, totalPrice: 0 };
}

function catalog() {
  return [
    item("item-1", "Cordless drill", "000-042", true, 129, { id: "garage", name: "Garage" }, "thumb-1"),
    item("item-2", "Stand mixer", "000-018", false, 89.5, { id: "kitchen", name: "Kitchen" }, null),
    item("item-3", longName, "000-100", false, 1234567.89, { id: "shelf", name: longLocation }, null),
    item("item-4", "Spare lamp", "000-007", true, 15, { id: "attic", name: "Attic" }, null),
    item("item-5", "Hammer", "000-003", false, 22, { id: "garage", name: "Garage" }, "thumb-5"),
    item("item-6", "Extension cord", "000-009", false, 11, { id: "garage", name: "Garage" }, null),
  ];
}

function item(
  id: string,
  name: string,
  assetId: string,
  insured: boolean,
  purchasePrice: number,
  parent: { id: string; name: string },
  thumbnailId: string | null
) {
  return {
    id,
    name,
    description: "",
    archived: false,
    assetId,
    attachments: [],
    children: [],
    createdAt: now,
    updatedAt: now,
    entityType: null,
    fields: [],
    insured,
    quantity: 1,
    purchasePrice,
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
    totalPrice: purchasePrice,
    imageId: thumbnailId,
    thumbnailId,
  };
}

async function expectNoHorizontalClip(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
