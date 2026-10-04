import { expect as baseExpect, test, type Page, type Route } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 30_000 });

/**
 * Connected item inspection against a mocked API.
 * Home and Search open the same record; photos stay conditional.
 * A real collection and a physical printer are not part of this check.
 */

const workshopId = "11111111-1111-4111-8111-111111111111";
const now = "2026-03-02T12:00:00Z";
const drillId = "item-drill";
const mixerId = "item-mixer";
const missingId = "item-missing";
const childId = "child-bit";
const longName =
  "Very long cordless drill name that must stay inside the page without covering the edit or more controls";
const longNote =
  "Very long maintenance note that must wrap inside the details panel rather than forcing the page to scroll sideways on a narrow phone.";
const longUrl = "https://example.invalid/invoices/" + "segment/".repeat(12) + "receipt";

type Gate = {
  hold: Set<string>;
  fail: Set<string>;
};

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

test("home and search open the same record and keep inspection controls usable", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page);
  await seedPreferences(page, false);
  await page.setViewportSize({ width: 834, height: 1112 });

  await page.goto("/home", { waitUntil: "domcontentloaded" });
  const recent = page.getByTestId("home-recent-card").filter({ hasText: longName });
  await expect(recent).toBeVisible({ timeout: 90_000 });
  await Promise.all([page.waitForURL(new RegExp(`/item/${drillId}/?$`)), recent.click()]);
  await expect(page.getByTestId("item-name")).toContainText("cordless drill");
  await expect(page.getByTestId("item-back-to-search")).toHaveAttribute("href", "/items");
  await expect(page.locator('[data-sidebar="menu-button"][href="/items"]')).toHaveAttribute("data-active", "true");

  await page.getByTestId("item-back-to-search").click();
  await expect(page).toHaveURL(/\/items\/?$/);
  await page.getByTestId("search-query").fill("cordless");
  await page.getByTestId("search-submit").click();
  const result = page.getByTestId("search-result-card").filter({ hasText: "cordless drill" });
  await expect(result).toBeVisible();
  await expect(result.getByTestId("search-card-select")).toHaveCount(0);
  await expect(page).toHaveURL(/\/items\?.*q=cordless/);
  await openSearchResult(result);
  await expect(page).toHaveURL(new RegExp(`/item/${drillId}/?$`));
  await expect(page.getByTestId("item-back-to-search")).toHaveAttribute("href", /\/items\?.*q=cordless/);
  await page.getByTestId("item-back-to-search").click();
  await expect(page).toHaveURL(/\/items\?.*q=cordless/);
  await openSearchResult(result);
  await expect(page.getByTestId("item-name")).toBeVisible();

  await expect(page.getByTestId("item-location")).toContainText("Garage");
  await expect(page.getByTestId("item-asset-id")).toContainText("000-042");
  await expect(page.getByTestId("item-asset-id")).not.toContainText("Not recorded");
  const tags = page.getByTestId("item-tags");
  await expect(tags.getByRole("link", { name: "Power tools" })).not.toHaveClass(/italic/);
  await expect(tags.getByRole("link", { name: "Tools", exact: true })).toHaveClass(/italic/);
  await expect(tags.getByRole("link", { name: "Tools", exact: true })).toHaveClass(/border-dashed/);
  await expect(page.getByTestId("item-description")).toContainText("Workshop drill");
  await expect(page.getByTestId("item-purchase")).toContainText("€");
  await expect(page.getByTestId("item-purchase")).toContainText(/6\/12\/2026|12\/06\/2026|Jun/);
  await expect(page.getByTestId("item-details")).not.toContainText("Serial Number");
  await expect(page.getByText(longNote)).toBeVisible();
  await expect(page.getByRole("link", { name: longUrl })).toBeVisible();

  const showEmpty = page.getByTestId("item-show-empty").getByRole("switch");
  await showEmpty.click();
  await expect(page.getByTestId("item-details")).toContainText("Serial Number");
  await showEmpty.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("item-details")).not.toContainText("Serial Number");

  const detailsToggle = page.getByRole("button", { name: "Details", exact: true });
  await detailsToggle.focus();
  await page.keyboard.press("Enter");
  await expect(detailsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("item-quantity-decrease")).toBeHidden();
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Tab");
    const focusedQuantity = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") === "item-quantity-decrease"
    );
    expect(focusedQuantity).toBe(false);
  }
  await detailsToggle.focus();
  await page.keyboard.press("Space");
  await expect(detailsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("item-quantity-decrease")).toBeVisible();

  const purchaseToggle = page.getByRole("button", { name: "Purchase Details" });
  await purchaseToggle.click();
  await expect(purchaseToggle).toHaveAttribute("aria-expanded", "false");
  await purchaseToggle.click();
  await expect(purchaseToggle).toHaveAttribute("aria-expanded", "true");

  const photos = page.getByTestId("item-photo");
  await expect(photos).toHaveCount(2);
  await expect(photos.nth(0).getByTestId("item-photo-image")).toHaveAttribute("src", /thumb-1/);
  await expect(photos.nth(1).getByTestId("item-photo-image")).toHaveAttribute("src", /photo-2/);
  const firstBox = await photos.nth(0).boundingBox();
  expect(firstBox?.width).toBeGreaterThanOrEqual(44);
  expect(firstBox?.height).toBeGreaterThanOrEqual(44);
  await photos.nth(0).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("source")).toHaveAttribute("srcset", /photo-1/);
  await expect(dialog.locator("img")).toHaveAttribute("src", /thumb-1/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await photos.nth(1).click();
  await expect(page.getByRole("dialog").locator("img")).toHaveAttribute("src", /photo-2/);
  await expect(page.getByRole("dialog").locator("source")).toHaveAttribute("srcset", /photo-2/);
  await page.keyboard.press("Escape");

  const files = page.getByTestId("item-attachments");
  await expect(files.getByText("Drill manual")).toBeVisible();
  await expect(files.getByText("Store receipt")).toBeVisible();
  await expect(files.getByText("Warranty card")).toBeVisible();
  await expect(files.getByText("Spec sheet")).toBeVisible();
  await expect(files.locator("[data-attachment-id='manual-1'] a").first()).toHaveAttribute("href", /manual-1/);
  await expect(files.locator("[data-attachment-id='receipt-1'] a").first()).toHaveAttribute("href", /receipt-1/);
  await expect(files.locator("[data-attachment-id='warranty-1'] a").first()).toHaveAttribute("href", /warranty-1/);

  await expect(page.getByTestId("item-children").getByRole("link", { name: "Drill bit set" })).toHaveAttribute(
    "href",
    `/item/${childId}`
  );

  await page.getByTestId("item-more").click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save as Template" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("item-labels")).toBeVisible();
  await page.getByTestId("item-create-subitem").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("item-edit").click();
  await expect(page).toHaveURL(new RegExp(`/item/${drillId}/edit`));
  await expect(page.getByTestId("item-name")).toContainText("cordless drill");
  await expect(page.getByLabel("Name")).toHaveValue(longName);
  await page.getByTestId("item-sections").getByRole("link", { name: "Details" }).click();
  await expect(page).toHaveURL(new RegExp(`/item/${drillId}/?$`));
  await page.getByTestId("item-sections").getByRole("link", { name: "Maintenance" }).click();
  await expect(page).toHaveURL(new RegExp(`/item/${drillId}/maintenance`));
  await expect(page.getByText("Total Entries")).toBeVisible();
  await expect(page.getByTestId("item-name")).toContainText("cordless drill");
  await page.getByTestId("item-sections").getByRole("link", { name: "Details" }).click();

  await expectNoHorizontalClip(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("item-name")).toBeVisible();
  await expect(page.getByTestId("item-edit")).toBeVisible();
  await expectNoHorizontalClip(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByTestId("item-summary")).toBeVisible();
  await expectNoHorizontalClip(page);
  const nameBox = await page.getByTestId("item-name").boundingBox();
  expect(nameBox && nameBox.x + nameBox.width).toBeLessThanOrEqual(320);
});

test("a no-photo record never gains an invented photos section", async ({ page }) => {
  test.setTimeout(180_000);
  await installApi(page);
  await seedPreferences(page, false);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto(`/item/${mixerId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("item-name")).toHaveText("Stand mixer", { timeout: 90_000 });
  await expect(page.getByTestId("item-photos")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Photos" })).toHaveCount(0);
  await expect(page.getByTestId("item-asset-id")).toHaveText("Not recorded");
  await page.getByTestId("item-show-empty").getByRole("switch").click();
  await expect(page.getByTestId("item-photos")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Photos" })).toHaveCount(0);
  await expect(page.getByTestId("item-attachments")).toContainText("No attachments found");
});

test("loading and failed retrieval stay honest", async ({ page }) => {
  test.setTimeout(180_000);
  const gate = createGate();
  gate.hold.add(drillId);
  await installApi(page, gate);
  await seedPreferences(page, false);
  await page.setViewportSize({ width: 834, height: 1112 });

  await page.goto(`/item/${drillId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("item-loading")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("item-loading")).toContainText("Loading item");
  await expect(page.getByTestId("item-name")).toHaveCount(0);
  await expect(page.getByTestId("item-purchase")).toHaveCount(0);
  gate.hold.delete(drillId);
  await expect(page.getByTestId("item-name")).toContainText("cordless drill");
  await expect(page.getByTestId("item-loading")).toHaveCount(0);

  await page.evaluate(id => {
    const root = document.querySelector("#__nuxt") as {
      __vue_app__?: { config: { globalProperties: { $router?: { push: (path: string) => Promise<unknown> } } } };
    } | null;
    return root?.__vue_app__?.config.globalProperties.$router?.push(`/item/${id}`);
  }, missingId);
  await expect(page.getByText("Failed to load item").first()).toBeVisible();
  await expect(page).toHaveURL(/\/home\/?$/);
  await expect(page.getByTestId("item-name")).toHaveCount(0);
  await expect(page.getByTestId("shell-header")).toBeVisible();
});

async function openSearchResult(result: ReturnType<Page["getByTestId"]>) {
  const link = result.getByTestId("search-card-link");
  await link.evaluate(element => {
    element.scrollIntoView({ block: "center" });
    if (element instanceof HTMLElement) {
      element.click();
    }
  });
}

function createGate(): Gate {
  return { hold: new Set(), fail: new Set() };
}

async function seedPreferences(page: Page, showEmpty: boolean) {
  await page.addInitScript(empty => {
    localStorage.setItem(
      "homebox/preferences/location",
      JSON.stringify({
        itemsPerTablePage: 24,
        itemDisplayView: "card",
        showEmpty: empty,
        quickActions: { enabled: false },
        theme: "homebox",
      })
    );
  }, showEmpty);
}

async function installApi(page: Page, gate: Gate = createGate()) {
  await page.addInitScript(() => {
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
  await page.route("**/api/v1/**", async route => {
    await fulfill(route, gate);
  });
  await page.route("**/entities/**/attachments/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    });
  });
}

async function fulfill(route: Route, gate: Gate) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/\/$/, "");
  const itemId = itemGetId(path);
  if (itemId && gate.hold.has(itemId)) {
    while (gate.hold.has(itemId)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  if (itemId && gate.fail.has(itemId)) {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    return;
  }
  if (itemId === missingId) {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    return;
  }
  await route.fulfill({
    status: route.request().method() === "POST" && path.endsWith("/logout") ? 204 : 200,
    contentType: "application/json",
    body: JSON.stringify(mockApi(path, url)),
  });
}

function itemGetId(path: string) {
  const match = path.match(/\/entities\/([^/]+)$/);
  return match?.[1] ?? null;
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
  if (path.endsWith("/groups/all")) {
    return [{ id: workshopId, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now }];
  }
  if (path.endsWith("/groups/members")) return [];
  if (path.endsWith("/groups/statistics")) {
    return { totalItemPrice: 129, totalItems: 2, totalLocations: 1, totalTags: 2, totalUsers: 1, totalWithWarranty: 0 };
  }
  if (path.endsWith("/currencies")) {
    return [{ code: "EUR", decimals: 2, local: "en", name: "Euro", symbol: "€" }];
  }
  if (path.endsWith("/groups")) {
    return { id: workshopId, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now };
  }
  if (path.endsWith("/tags")) return tags();
  if (path.endsWith("/entity-types") || path.endsWith("/templates") || path.endsWith("/notifiers")) return [];
  if (path.endsWith("/entities/fields") || path.endsWith("/entities/tree")) return [];
  if (path.includes("/maintenance")) return [];
  if (path.endsWith(`/entities/${drillId}/path`)) {
    return [
      { id: "garage", name: "Garage", type: "location" },
      { id: drillId, name: longName, type: "item" },
    ];
  }
  if (path.endsWith(`/entities/${mixerId}/path`) || path.endsWith(`/entities/${childId}/path`)) return [];
  if (path.endsWith(`/entities/${drillId}`)) return drill();
  if (path.endsWith(`/entities/${mixerId}`)) return mixer();
  if (path.endsWith(`/entities/${childId}`)) return child();
  if (path.endsWith("/entities")) {
    if (url.searchParams.get("isLocation") === "true") {
      return { items: [{ id: "garage", name: "Garage", itemCount: 1 }], page: 1, pageSize: 50, total: 1 };
    }
    if (url.searchParams.get("parentIds")) {
      const parent = url.searchParams.get("parentIds");
      return {
        items: parent === drillId ? [childSummary()] : [],
        page: 1,
        pageSize: 12,
        total: parent === drillId ? 1 : 0,
      };
    }
    return listItems(url);
  }
  return [];
}

function listItems(url: URL) {
  const query = (url.searchParams.get("q") || "").toLowerCase();
  let items = [drillSummary(), mixerSummary(), missingSummary()];
  if (query) {
    items = items.filter(item => item.name.toLowerCase().includes(query));
  }
  return {
    items,
    page: 1,
    pageSize: Number(url.searchParams.get("pageSize") || "12"),
    total: items.length,
    totalPrice: 129,
  };
}

function tags() {
  return [
    {
      id: "tools",
      name: "Tools",
      color: "#336699",
      icon: "",
      description: "",
      createdAt: now,
      updatedAt: now,
      children: [],
      parentId: null,
    },
    {
      id: "power-tools",
      name: "Power tools",
      color: "#225577",
      icon: "",
      description: "",
      createdAt: now,
      updatedAt: now,
      children: [],
      parentId: "tools",
    },
  ];
}

function drillSummary() {
  return summary(drillId, longName, "000-042", true, 129, "2026-10-04T12:00:00Z", "thumb-1");
}

function mixerSummary() {
  return summary(mixerId, "Stand mixer", "000-000", false, 40, now, null);
}

function missingSummary() {
  return summary(missingId, "Unavailable lamp", "000-099", false, 10, "2026-01-01T12:00:00Z", null);
}

function childSummary() {
  return summary(childId, "Drill bit set", "000-043", false, 12, now, null);
}

function summary(
  id: string,
  name: string,
  assetId: string,
  insured: boolean,
  purchasePrice: number,
  createdAt: string,
  thumbnailId: string | null
) {
  return {
    id,
    name,
    description: "",
    archived: false,
    assetId,
    createdAt,
    updatedAt: createdAt,
    insured,
    quantity: 1,
    purchasePrice,
    parent: { id: "garage", name: "Garage" },
    location: { id: "garage", name: "Garage" },
    tags: [],
    imageId: thumbnailId,
    thumbnailId,
    entityType: null,
  };
}

function attachment(id: string, type: string, mimeType: string, title: string, thumbnail?: { id: string }) {
  return {
    id,
    type,
    mimeType,
    title,
    path: `/entities/${drillId}/attachments/${id}`,
    thumbnail,
  };
}

function drill() {
  return {
    ...baseEntity(drillId, longName, "000-042", true, 129),
    description: "Workshop drill kept above the bench.",
    notes: longNote,
    manufacturer: "Bosch",
    modelNumber: "GSB-18",
    serialNumber: "",
    purchaseFrom: "Local hardware",
    purchasePrice: 129,
    purchaseDate: "2026-06-12",
    tags: [{ id: "power-tools", name: "Power tools", color: "#225577" }],
    fields: [{ id: "field-1", name: "Invoice URL", type: "text", textValue: longUrl }],
    attachments: [
      attachment("photo-1", "photo", "image/jpeg", "Front", { id: "thumb-1" }),
      attachment("photo-2", "photo", "image/jpeg", "Side"),
      attachment("manual-1", "manual", "application/pdf", "Drill manual"),
      attachment("receipt-1", "receipt", "application/pdf", "Store receipt"),
      attachment("warranty-1", "warranty", "application/pdf", "Warranty card"),
      attachment("doc-1", "attachment", "application/pdf", "Spec sheet"),
    ],
  };
}

function mixer() {
  return {
    ...baseEntity(mixerId, "Stand mixer", "", false, 0),
    assetId: "000-000",
    description: "",
    attachments: [],
    fields: [],
    tags: [],
    purchaseFrom: "",
    purchasePrice: 0,
    purchaseDate: "",
  };
}

function child() {
  return {
    ...baseEntity(childId, "Drill bit set", "000-043", false, 12),
    attachments: [],
    fields: [],
    tags: [],
    parent: { id: drillId, name: longName },
  };
}

function baseEntity(id: string, name: string, assetId: string, insured: boolean, purchasePrice: number) {
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
    purchaseDate: "",
    purchaseFrom: "",
    parent: { id: "garage", name: "Garage" },
    location: { id: "garage", name: "Garage" },
    tags: [],
    soldDate: "",
    soldNotes: "",
    soldPrice: 0,
    soldTo: "",
    serialNumber: "",
    modelNumber: "",
    manufacturer: "",
    notes: "",
    lifetimeWarranty: false,
    warrantyExpires: "",
    warrantyDetails: "",
    syncChildEntityLocations: false,
    totalPrice: purchasePrice,
    imageId: null,
    thumbnailId: null,
  };
}

async function expectNoHorizontalClip(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
