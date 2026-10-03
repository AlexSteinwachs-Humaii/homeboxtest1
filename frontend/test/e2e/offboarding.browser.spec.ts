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

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hb.auth.session", value: "true", url: baseURL! }]);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/users/self"))
      body = { item: { id: userId, name: "Custodian", groupIds: [], defaultGroupId: "group" } };
    else if (path.endsWith("/status"))
      body = { health: true, build: { version: "test" }, oidc: { enabled: false }, versions: [] };
    else if (path.endsWith("/groups/members")) body = [{ id: userId, name: "Custodian" }];
    else if (path.endsWith("/groups/all")) body = [{ id: "group", name: "Test collection", currency: "USD" }];
    else if (path.endsWith("/groups")) body = { id: "group", name: "Test collection", currency: "USD" };
    else if (path.endsWith(`/entities/${id}`)) body = asset;
    else if (path.endsWith("/entities")) body = { items: [], total: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto(`/item/${id}`);
  await page.getByRole("button", { name: "Record disposal", exact: true }).click();
});

for (const disposalRoute of ["sale", "donation", "recycling"]) {
  test(`records ${disposalRoute} and shows retained server metadata`, async ({ page }) => {
    await page.route("**/offboarding", async route => {
      expect(route.request().postDataJSON()).toEqual({ route: disposalRoute });
      await route.fulfill({ json: { route: disposalRoute, submittedBy: userId, submittedAt: "2026-10-03T12:00:00Z" } });
    });
    await page.getByLabel("Disposal route").selectOption(disposalRoute);
    await page.getByRole("button", { name: "Confirm disposal", exact: true }).click();
    const panel = page.getByTestId("offboarding");
    await expect(panel.getByText("Offboarded", { exact: true })).toBeVisible();
    await expect(panel.getByText(userId)).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Disposal history" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record disposal", exact: true })).toHaveCount(0);
  });
}

test("cancel does not submit disposal", async ({ page }) => {
  let requests = 0;
  await page.route("**/offboarding", route => {
    requests++;
    return route.fulfill({ status: 500 });
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("offboarding").getByText("Active", { exact: true })).toBeVisible();
  expect(requests).toBe(0);
});

test("destruction validates, surfaces upload errors, selects evidence and retains declaration", async ({ page }) => {
  await page.getByLabel("Disposal route").selectOption("destruction");
  await page.getByRole("button", { name: "Submit destruction declaration" }).click();
  await expect(page.getByText("Accept the destruction declaration.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a valid destruction date.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter the destruction method.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Select at least one uploaded photo or destruction certificate belonging to this asset.", {
      exact: true,
    })
  ).toBeVisible();
  const file = { name: "evidence.png", mimeType: "image/png", buffer: Buffer.from("test upload") };
  await page.route("**/attachments", route => route.fulfill({ status: 500, json: { message: "upload failed" } }));
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.getByRole("alert").filter({ hasText: "Evidence upload failed" })).toBeVisible();
  await expect(page.getByTestId("offboarding").getByText("Active", { exact: true })).toBeVisible();
  await page.route("**/attachments", route =>
    route.fulfill({
      json: {
        id,
        name: "Test asset",
        description: "",
        assetId: "000-001",
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
        disposed: false,
        disposalHistory: [],
        tags: [],
        fields: [],
        children: [],
        attachments: [
          { id: "evidence", title: "evidence.png", type: "photo", mimeType: "image/png", path: "uploaded.png" },
        ],
      },
    })
  );
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByLabel(destructionDeclaration, { exact: true }).check();
  await page.getByLabel("Destruction date", { exact: true }).fill("2026-10-02");
  await page.getByLabel("Destruction method", { exact: true }).fill("Shredded");
  await page.getByLabel("evidence.png (photo)", { exact: true }).check();
  await page.route("**/offboarding", async route => {
    expect(route.request().postDataJSON()).toEqual({
      route: "destruction",
      destruction: {
        declared: true,
        date: "2026-10-02",
        method: "Shredded",
        evidence: [{ attachmentId: "evidence", kind: "photo" }],
      },
    });
    await route.fulfill({
      json: {
        route: "destruction",
        submittedBy: userId,
        submittedAt: "2026-10-03T12:00:00Z",
        destruction: {
          declaration: destructionDeclaration,
          date: "2026-10-02",
          method: "Shredded",
          evidence: [{ attachmentId: "evidence", kind: "photo" }],
        },
      },
    });
  });
  await page.getByRole("button", { name: "Submit destruction declaration" }).click();
  const panel = page.getByTestId("offboarding");
  await expect(panel.getByText("Offboarded", { exact: true })).toBeVisible();
  await expect(panel.getByText(destructionDeclaration, { exact: true })).toBeVisible();
  await expect(panel.getByText("Shredded", { exact: true })).toBeVisible();
  await expect(panel.getByText("Custodian —", { exact: true })).toBeVisible();
  await expect(panel.locator("dd").filter({ hasText: "2026" })).toHaveCount(2);
  await expect(panel.getByText(userId)).toBeVisible();
  await expect(panel.locator("a[download]")).toHaveAttribute(
    "href",
    new RegExp(`/entities/${id}/attachments/evidence`)
  );
});

test("loads a retained destruction record with evidence and no disposal controls", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.route(`**/entities/${id}`, route =>
    route.fulfill({
      json: {
        ...asset,
        disposed: true,
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
      },
    })
  );
  await page.reload();
  const panel = page.getByTestId("offboarding");
  await expect(panel.getByText("Offboarded", { exact: true })).toBeVisible();
  await expect(panel.getByText(destructionDeclaration, { exact: true })).toBeVisible();
  await expect(panel.getByText("Shredded", { exact: true })).toBeVisible();
  await expect(panel.getByText(userId, { exact: true })).toBeVisible();
  await expect(panel.locator("dd").filter({ hasText: "2026" })).toHaveCount(2);
  await expect(panel.locator("a[download]")).toHaveAttribute(
    "href",
    new RegExp(`/entities/${id}/attachments/certificate`)
  );
  await expect(page.getByRole("button", { name: "Record disposal", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button")).toHaveCount(0);
});

test("server rejection keeps dialog open and asset active", async ({ page }) => {
  await page.route("**/offboarding", route => route.fulfill({ status: 409, json: { message: "conflict" } }));
  await page.getByRole("button", { name: "Confirm disposal", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Disposal was not confirmed" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("offboarding").getByText("Active", { exact: true })).toBeVisible();
});
