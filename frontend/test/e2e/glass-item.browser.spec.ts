import { expect as baseExpect, test, type Locator, type Page, type Route } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 20_000 });

/**
 * Item inspection with the API mocked. Viewports are emulated, not a real iPad.
 * Destructive actions (delete item, delete photo) are not exercised.
 */

const DRILL_ID = "item-drill";
const TOOLBOX_ID = "item-toolbox";
const CHILD_ID = "item-battery";
const GROUP_ID = "group-workshop";
const LONG_NOTE =
  "Stored on the north wall shelf behind the spare filters, extension cords and the charger that must wrap without covering Edit";

const now = "2024-06-01T00:00:00Z";
const purchaseDate = "2026-06-12";

type MockState = {
  holdItemId: string | null;
  hold: Promise<void> | null;
  failItemId: string | null;
  maintenanceFor: string[];
};

function attachment(id: string, type: string, title: string, thumbnailId?: string) {
  return {
    id,
    type,
    title,
    mimeType: type === "photo" ? "image/png" : "application/pdf",
    path: "",
    primary: false,
    createdAt: now,
    updatedAt: now,
    thumbnail: thumbnailId ? { id: thumbnailId } : null,
  };
}

function summary(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: "",
    assetId: "000-042",
    archived: false,
    createdAt: now,
    updatedAt: now,
    entityType: null,
    imageId: null,
    insured: true,
    itemCount: 0,
    quantity: 1,
    purchasePrice: 129,
    totalPrice: 129,
    parent: { id: "loc-garage", name: "Garage" },
    tags: [{ id: "tag-tools", name: "Tools" }],
    ...extra,
  };
}

function entity(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: "",
    assetId: "000-000",
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
    location: { id: "loc-garage", name: "Garage" },
    manufacturer: "",
    modelNumber: "",
    notes: "",
    parent: { id: "loc-shelf", name: "Tool shelf" },
    purchaseDate: "0001-01-01T00:00:00Z",
    purchaseFrom: "",
    purchasePrice: 0,
    quantity: 1,
    serialNumber: "",
    soldDate: "0001-01-01T00:00:00Z",
    soldNotes: "",
    soldPrice: 0,
    soldTo: "",
    syncChildEntityLocations: false,
    tags: [],
    thumbnailId: null,
    totalPrice: 0,
    warrantyDetails: "",
    warrantyExpires: "0001-01-01T00:00:00Z",
    ...extra,
  };
}

const drill = entity(DRILL_ID, "Cordless drill", {
  description: "18V cordless drill with charger and two batteries.",
  assetId: "000-042",
  insured: true,
  manufacturer: "Bosch",
  modelNumber: "PSB 18 LI-2",
  quantity: 1,
  purchaseFrom: "Local hardware store",
  purchasePrice: 129,
  purchaseDate,
  totalPrice: 129,
  tags: [{ id: "tag-tools", name: "Tools", color: "#2f6f4e" }],
  fields: [
    {
      id: "field-note",
      name: "Shelf note",
      textValue: LONG_NOTE,
      booleanValue: false,
      numberValue: 0,
      type: "text",
    },
  ],
  attachments: [
    attachment("photo-thumb", "photo", "Drill front", "thumb-drill"),
    attachment("photo-plain", "photo", "Drill side"),
    attachment("file-manual", "manual", "Drill manual"),
    attachment("file-receipt", "receipt", "Store receipt"),
    attachment("file-warranty", "warranty", "Warranty card"),
  ],
});

const toolbox = entity(TOOLBOX_ID, "Toolbox", {
  assetId: "000-000",
  parent: { id: "loc-garage", name: "Garage" },
  location: { id: "loc-garage", name: "Garage" },
});

const battery = entity(CHILD_ID, "Spare battery", {
  assetId: "000-099",
  parent: { id: DRILL_ID, name: "Cordless drill" },
});

const RECORDS: Record<string, ReturnType<typeof entity>> = {
  [DRILL_ID]: drill,
  [TOOLBOX_ID]: toolbox,
  [CHILD_ID]: battery,
};

function entityTail(path: string) {
  const parts = path.split("/").filter(Boolean);
  const index = parts.indexOf("entities");
  if (index < 0 || !parts[index + 1]) {
    return null;
  }
  return { id: parts[index + 1] ?? "", rest: parts.slice(index + 2).join("/") };
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
        build: { buildTime: now, commit: "glass-item", version: "v0.0.0" },
        demo: false,
        health: true,
        labelPrinting: false,
        latest: { date: now, version: "v0.0.0" },
        oidc: { allowLocal: true, autoRedirect: false, buttonText: "", enabled: false },
        title: "Homebox",
        versions: [],
        message: "",
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
        totalItemPrice: 129,
        totalItems: 2,
        totalLocations: 2,
        totalTags: 2,
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
          id: "tag-home",
          name: "Home",
          color: "",
          icon: "",
          description: "",
          parentId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "tag-tools",
          name: "Tools",
          color: "#2f6f4e",
          icon: "",
          description: "",
          parentId: "tag-home",
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    if (path.includes("/tags/")) {
      return json({
        id: "tag-tools",
        name: "Tools",
        color: "#2f6f4e",
        icon: "",
        description: "",
        parentId: "tag-home",
        createdAt: now,
        updatedAt: now,
      });
    }
    if (path.endsWith("/entity-types")) {
      return json([
        {
          id: "et-item",
          name: "Item",
          color: "",
          icon: "",
          isLocation: false,
          description: "",
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    if (path.includes("/entities/tree")) {
      return json([
        { id: "loc-garage", name: "Garage", type: "location", children: [] },
        { id: "loc-shelf", name: "Tool shelf", type: "location", children: [] },
      ]);
    }
    if (path.endsWith("/entities/fields")) return json([]);
    if (path.endsWith("/entities") && url.searchParams.get("isLocation") === "true") {
      return json({
        items: [
          { id: "loc-garage", name: "Garage", itemCount: 2 },
          { id: "loc-shelf", name: "Tool shelf", itemCount: 1 },
        ],
        page: 1,
        pageSize: 50,
        total: 2,
        totalPrice: 0,
      });
    }
    if (path.endsWith("/entities") && request.method() === "GET") {
      const parents = url.searchParams.getAll("parentIds");
      if (parents.length > 0) {
        const items = parents.includes(DRILL_ID)
          ? [
              summary(CHILD_ID, "Spare battery", {
                assetId: "000-099",
                purchasePrice: 24,
                totalPrice: 24,
                imageId: null,
              }),
            ]
          : [];
        return json({
          items,
          page: 1,
          pageSize: 10,
          total: items.length,
          totalPrice: items.length ? 24 : 0,
        });
      }
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      let rows = [
        summary(DRILL_ID, "Cordless drill", { imageId: "photo-thumb", thumbnailId: "thumb-drill" }),
        summary(TOOLBOX_ID, "Toolbox", {
          assetId: "000-000",
          insured: false,
          purchasePrice: 0,
          totalPrice: 0,
          imageId: null,
          tags: [],
        }),
      ];
      if (q) {
        rows = rows.filter(
          row => row.name.toLowerCase().includes(q) || row.assetId.replace(/-/g, "").includes(q.replace("#", ""))
        );
      }
      return json({ items: rows, page: 1, pageSize: rows.length, total: rows.length, totalPrice: 129 });
    }

    const tail = entityTail(path);
    if (tail?.rest === "maintenance") {
      state.maintenanceFor.push(tail.id);
      if (tail.id === DRILL_ID) {
        return json([
          {
            id: "mnt-1",
            name: "Bit replacement",
            description: "",
            cost: "0",
            itemID: DRILL_ID,
            itemName: "Cordless drill",
            completedDate: "0001-01-01T00:00:00Z",
            scheduledDate: "2026-07-01",
          },
        ]);
      }
      return json([]);
    }
    if (tail?.rest === "path") {
      return json([
        { id: "loc-garage", name: "Garage", type: "location" },
        { id: "loc-shelf", name: "Tool shelf", type: "location" },
        { id: tail.id, name: RECORDS[tail.id]?.name ?? "Item", type: "item" },
      ]);
    }
    if (tail && !tail.rest && request.method() === "GET") {
      if (state.hold && state.holdItemId === tail.id) {
        await state.hold;
      }
      if (state.failItemId === tail.id) {
        return json({ error: "item unavailable" }, 500);
      }
      return json(RECORDS[tail.id] ?? entity(tail.id, "Missing item"));
    }
    if (path.endsWith("/templates") || path.endsWith("/notifiers") || path.endsWith("/maintenance")) {
      return json([]);
    }
    return json(request.method() === "GET" ? [] : {});
  });
}

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "homebox/preferences/location",
      JSON.stringify({
        showEmpty: false,
        itemDisplayView: "card",
        itemsPerTablePage: 24,
        quickActions: { enabled: false },
        language: "en",
      })
    );
    const media = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [] }),
      enumerateDevices: () => Promise.resolve([]),
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  });
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing bounding box");
  return box;
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth, label).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test.describe("Glass v5 item inspection", () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3000";
    page.setDefaultTimeout(20_000);
    await page.context().addCookies([{ name: "hb.auth.session", value: "true", url: origin }]);
    await signedIn(page);
  });

  test("opens the same record from Home and Search and keeps real inspection data", async ({ page }) => {
    test.setTimeout(180_000);
    const state: MockState = { holdItemId: null, hold: null, failItemId: null, maintenanceFor: [] };
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });

    await page.goto("/home");
    await expect(page.getByTestId("home-recent-card-" + DRILL_ID)).toBeVisible();
    await page.getByTestId("home-recent-card-" + DRILL_ID).click();
    await expect(page).toHaveURL(new RegExp(`/item/${DRILL_ID}$`));
    await expect(page.getByTestId("item-name")).toHaveText("Cordless drill");
    await expect(page.getByTestId("item-asset-id")).toHaveText("000-042");
    await expect(page.getByTestId("shell-search")).toBeVisible();

    await page.getByTestId("item-back-to-search").click();
    await expect(page).toHaveURL(/\/items$/);
    await expect(page.getByTestId("search-card-link-" + DRILL_ID)).toBeVisible();

    await page.goto("/items?q=drill");
    await expect(page.getByTestId("search-card-link-" + DRILL_ID)).toBeVisible();
    await expect(page.getByTestId("search-card-link-" + TOOLBOX_ID)).toHaveCount(0);
    await page.getByTestId("search-card-link-" + DRILL_ID).click();
    await expect(page).toHaveURL(new RegExp(`/item/${DRILL_ID}$`));
    await expect(page.getByTestId("item-name")).toHaveText("Cordless drill");
    await page.getByTestId("item-back-to-search").click();
    await expect(page).toHaveURL(/\/items\?q=drill/);

    await page.goto(`/item/${DRILL_ID}`);
    await expect(page.getByTestId("item-location")).toContainText("Garage");
    await expect(page.getByTestId("item-location")).toContainText("Tool shelf");
    const tags = page.getByTestId("item-tags");
    await expect(tags.getByRole("link", { name: "Tools" })).toBeVisible();
    await expect(tags.getByRole("link", { name: "Home" })).toHaveClass(/border-dashed/);
    await expect(tags.getByRole("link", { name: "Home" })).toHaveClass(/italic/);
    await expect(page.getByTestId("item-description")).toContainText("18V cordless drill");
    await expect(page.getByTestId("item-insured")).toHaveText("Insured");

    const purchase = page.getByTestId("item-purchase");
    await expect(purchase).toContainText("Local hardware store");
    await expect(purchase).toContainText("129");
    await expect(purchase).toContainText("€");
    await expect(purchase).not.toContainText("$129.00");
    await expect(purchase).toContainText("2026");
    await expect(purchase).not.toContainText("06/11/2026");
    await expect(purchase).not.toContainText("6/11/2026");
    await expect(purchase).not.toContainText("11/06/2026");
    await expect(page.getByTestId("item-details")).toContainText("Bosch");
    await expect(page.getByTestId("item-details")).toContainText(LONG_NOTE);
    await expect(page.getByTestId("item-details")).not.toContainText("Serial Number");

    const showEmpty = page.getByTestId("item-show-empty");
    await showEmpty.tap();
    await expect(page.getByTestId("item-details")).toContainText("Serial Number");
    await showEmpty.focus();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("item-details")).not.toContainText("Serial Number");

    const detailsToggle = page.getByTestId("item-details").getByRole("button", { name: "Details" });
    await detailsToggle.focus();
    await page.keyboard.press("Enter");
    await expect(detailsToggle).toHaveAttribute("aria-expanded", "false");
    const collapsed = await page.evaluate(() => {
      const hidden = document.querySelector("[data-testid='item-details'] [hidden]");
      return {
        present: Boolean(hidden),
        inert: hidden?.hasAttribute("inert") ?? false,
      };
    });
    expect(collapsed.present).toBe(true);
    expect(collapsed.inert).toBe(true);
    await page.keyboard.press("Tab");
    const focusInsideCollapsed = await page.evaluate(() => {
      const hidden = document.querySelector("[data-testid='item-details'] [hidden]");
      return Boolean(hidden && document.activeElement && hidden.contains(document.activeElement));
    });
    expect(focusInsideCollapsed).toBe(false);
    await detailsToggle.tap();
    await expect(detailsToggle).toHaveAttribute("aria-expanded", "true");

    const increase = page.getByTestId("item-quantity-increase");
    const increaseBox = await boxOf(increase);
    expect(increaseBox.width).toBeGreaterThanOrEqual(44);
    expect(increaseBox.height).toBeGreaterThanOrEqual(44);

    await expect(page.getByTestId("item-photos")).toBeVisible();
    const thumb = page.getByTestId("item-photo-photo-thumb").locator("img");
    const plain = page.getByTestId("item-photo-photo-plain").locator("img");
    await expect(thumb).toHaveAttribute("src", /thumb-drill/);
    await expect(plain).toHaveAttribute("src", /attachments\/photo-plain/);
    await expect(plain).not.toHaveAttribute("src", /thumb-/);
    const photoBox = await boxOf(page.getByTestId("item-photo-photo-plain"));
    expect(photoBox.width).toBeGreaterThanOrEqual(44);
    expect(photoBox.height).toBeGreaterThanOrEqual(44);

    await page.getByTestId("item-photo-photo-thumb").click();
    const dialog = page.locator("picture").filter({ has: page.locator("img[alt='attachment image']") });
    await expect(dialog.locator("source")).toHaveAttribute("srcset", /attachments\/photo-thumb/);
    await expect(dialog.locator("img")).toHaveAttribute("src", /thumb-drill/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByTestId("item-photo-photo-plain").click();
    const fallback = page.locator("picture").filter({ has: page.locator("img[alt='attachment image']") });
    await expect(fallback.locator("source")).toHaveAttribute("srcset", /attachments\/photo-plain/);
    await expect(fallback.locator("img")).toHaveAttribute("src", /attachments\/photo-plain/);
    await page.keyboard.press("Escape");

    const files = page.getByTestId("item-attachments");
    await expect(files).toContainText("Drill manual");
    await expect(files).toContainText("Store receipt");
    await expect(files).toContainText("Warranty card");
    await expect(page.getByTestId("item-children")).toContainText("Spare battery");

    await page.getByTestId("item-more").click();
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("item-create-subitem").click();
    await expect(page.getByRole("dialog")).toContainText("Create");
    await page.keyboard.press("Escape");

    for (const viewport of [
      { name: "ipad", width: 834, height: 1112 },
      { name: "mobile", width: 390, height: 844 },
      { name: "narrow", width: 320, height: 700 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByTestId("item-name")).toBeVisible();
      await expectNoHorizontalScroll(page, viewport.name);
      const edit = await boxOf(page.getByTestId("item-edit"));
      expect(edit.x).toBeGreaterThanOrEqual(-1);
      expect(edit.x + edit.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(edit.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("does not invent a photo section or asset id for a no-photo item", async ({ page }) => {
    test.setTimeout(90_000);
    const state: MockState = { holdItemId: null, hold: null, failItemId: null, maintenanceFor: [] };
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto(`/item/${TOOLBOX_ID}`);
    await expect(page.getByTestId("item-name")).toHaveText("Toolbox");
    await expect(page.getByTestId("item-photos")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Photos" })).toHaveCount(0);
    await expect(page.getByTestId("item-asset-id")).toHaveText("Not recorded");
    await expect(page.getByTestId("item-asset-id")).not.toContainText("000-000");
    await expect(page.getByTestId("item-purchase")).toHaveCount(0);
    await expect(page.getByTestId("item-children")).toHaveCount(0);
    await expect(page.getByTestId("item-edit")).toBeVisible();
    await expect(page.getByTestId("item-sections").getByRole("link", { name: "Maintenance" })).toHaveAttribute(
      "href",
      `/item/${TOOLBOX_ID}/maintenance`
    );
  });

  test("loading and failed retrieval do not render fake fields", async ({ page }) => {
    test.setTimeout(90_000);
    let release = () => {};
    const state: MockState = {
      holdItemId: DRILL_ID,
      hold: new Promise(resolve => {
        release = resolve;
      }),
      failItemId: null,
      maintenanceFor: [],
    };
    await mockApi(page, state);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/item/${DRILL_ID}`);
    await expect(page.getByTestId("item-loading")).toBeVisible();
    await expect(page.getByTestId("item-loading")).toContainText("Loading item");
    await expect(page.getByTestId("item-page")).toHaveCount(0);
    await expect(page.getByText("Bosch")).toHaveCount(0);
    await expect(page.getByText("000-042")).toHaveCount(0);
    await expect(page.getByTestId("item-load-error")).toHaveCount(0);
    release();
    state.hold = null;
    state.holdItemId = null;
    await expect(page.getByTestId("item-name")).toHaveText("Cordless drill");
    await expect(page.getByTestId("item-loading")).toHaveCount(0);

    state.failItemId = "item-missing";
    await page.goto("/item/item-missing");
    await expect(page.getByText("Failed to load item").first()).toBeVisible();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId("item-page")).toHaveCount(0);
    await expect(page.getByTestId("item-name")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Missing item" })).toHaveCount(0);
    await expect(page.getByTestId("home-recent-card-" + DRILL_ID)).toBeVisible();
  });

  test("nested edit and maintenance receive the current item", async ({ page }) => {
    test.setTimeout(120_000);
    const state: MockState = { holdItemId: null, hold: null, failItemId: null, maintenanceFor: [] };
    await mockApi(page, state);
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.goto(`/item/${DRILL_ID}`);
    await page.getByTestId("item-edit").click();
    await expect(page).toHaveURL(new RegExp(`/item/${DRILL_ID}/edit$`));
    await expect(page.getByTestId("item-name")).toHaveText("Cordless drill");
    await expect(page.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Cordless drill");
    const sticky = page.locator(".sticky").first();
    await expect(sticky).toBeVisible();
    await expect.poll(async () => sticky.evaluate(el => getComputedStyle(el).position)).toBe("sticky");

    await page.getByTestId("item-sections").getByRole("link", { name: "Maintenance" }).click();
    await expect(page).toHaveURL(new RegExp(`/item/${DRILL_ID}/maintenance$`));
    await expect(page.getByText("Bit replacement")).toBeVisible();
    expect(state.maintenanceFor).toContain(DRILL_ID);
    await expect(page.getByTestId("item-photos")).toHaveCount(0);
  });
});
