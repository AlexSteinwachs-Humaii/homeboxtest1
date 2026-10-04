import { expect, test } from "@playwright/test";
import { destructionDeclaration } from "../../lib/items/destruction";

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const asset = {
  id,
  name: "Test asset",
  description: "",
  assetId: "000-001",
  disposed: false,
  disposalHistory: [],
  attachments: [],
  fields: [],
  tags: [],
  children: [],
  quantity: 1,
  notes: "",
  purchasePrice: 0,
  soldPrice: 0,
  serialNumber: "",
  modelNumber: "",
  manufacturer: "",
  purchaseFrom: "",
  soldTo: "",
  soldNotes: "",
  warrantyDetails: "",
  lifetimeWarranty: false,
  insured: false,
  totalPrice: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

const historical = {
  ...asset,
  name: "Historical laptop",
  disposed: true,
  archived: true,
  attachments: [
    {
      id: "certificate",
      title: "Destruction certificate.pdf",
      type: "attachment",
      mimeType: "application/pdf",
      path: "certificate.pdf",
    },
  ],
  disposalHistory: [
    {
      route: "destruction",
      submittedBy: userId,
      submittedAt: "2026-10-03T12:00:00Z",
      destruction: {
        declaration: destructionDeclaration,
        date: "2026-10-02",
        method: "Shredded",
        evidence: [{ attachmentId: "certificate", kind: "certificate" }],
      },
    },
  ],
};

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hb.auth.session", value: "true", url: baseURL! }]);
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = [];
    if (path.endsWith("/users/self"))
      body = { item: { id: userId, name: "Custodian", groupIds: [], defaultGroupId: "group" } };
    else if (path.endsWith("/status"))
      body = { health: true, build: { version: "test" }, oidc: { enabled: false }, versions: [] };
    else if (path.endsWith("/groups/members")) body = [{ id: userId, name: "Custodian" }];
    else if (path.endsWith("/groups/all")) body = [{ id: "group", name: "Test collection", currency: "USD" }];
    else if (path.endsWith("/groups")) body = { id: "group", name: "Test collection", currency: "USD" };
    else if (path.endsWith(`/entities/${id}`)) body = historical;
    else if (path.endsWith("/entities")) {
      const history = url.searchParams.get("onlyOffboarded") === "true";
      const item = history
        ? historical
        : { ...asset, id: "33333333-3333-4333-8333-333333333333", name: "Active laptop" };
      body = {
        items: url.searchParams.has("isLocation") ? [] : [item],
        total: url.searchParams.has("isLocation") ? 0 : 1,
        page: 1,
        pageSize: 10,
      };
    }
    await route.fulfill({ json: body });
  });
});

test("switches from active to history, persists the route and opens retained evidence", async ({ page }) => {
  await page.goto("/items");
  await expect(page.getByText("Active laptop", { exact: true })).toBeVisible();
  await expect(page.getByText("Historical laptop", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Options", exact: true }).click();
  const request = page.waitForRequest(
    r => r.url().includes("/entities?") && new URL(r.url()).searchParams.get("onlyOffboarded") === "true"
  );
  await page.getByRole("switch", { name: "Offboarded assets (includes archived)" }).click();
  expect(new URL((await request).url()).searchParams.get("page")).toBe("1");
  await expect(page).toHaveURL(/offboarded=true/);
  await expect(page.getByText("Historical laptop", { exact: true })).toBeVisible();
  await expect(page.getByText("Active laptop", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("Historical laptop", { exact: true })).toBeVisible();
  await page.getByText("Historical laptop", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/item/${id}`));
  const panel = page.getByTestId("offboarding");
  await expect(panel.getByText("Offboarded", { exact: true })).toBeVisible();
  await expect(panel.getByText(destructionDeclaration, { exact: true })).toBeVisible();
  await expect(panel.getByText("Shredded", { exact: true })).toBeVisible();
  await expect(panel.locator("a[download]")).toHaveAttribute(
    "href",
    new RegExp(`/entities/${id}/attachments/certificate`)
  );
});

test("historical search preserves text and archive route filters", async ({ page }) => {
  const request = page.waitForRequest(
    r => r.url().includes("/entities?") && new URL(r.url()).searchParams.get("q") === "laptop"
  );
  await page.goto("/items?offboarded=true&archived=true&q=laptop&page=1");
  const params = new URL((await request).url()).searchParams;
  expect(params.get("onlyOffboarded")).toBe("true");
  expect(params.get("includeArchived")).toBe("true");
  await expect(page.getByText("Historical laptop", { exact: true })).toBeVisible();
});
