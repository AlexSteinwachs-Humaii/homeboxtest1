import { expect, test } from "@playwright/test";

// UI contract tests use controlled API responses; backend filter/CSV semantics
// are covered by the Go export regression suites.
test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hb.auth.session", value: "true", url: baseURL! }]);
  await page.addInitScript(() =>
    localStorage.setItem(
      "homebox/preferences/location",
      JSON.stringify({ collectionId: "collection-a", language: "en" })
    )
  );
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/v1/users/self")
      body = {
        item: { id: "user", name: "Tester", email: "test@example.com", defaultGroupId: "collection-a", role: "owner" },
      };
    if (path === "/api/v1/users/self/settings") body = { item: {} };
    if (path === "/api/v1/groups/all")
      body = [
        { id: "collection-a", name: "Collection A" },
        { id: "collection-b", name: "Collection B" },
      ];
    if (path === "/api/v1/entities/tree")
      body = [{ id: "room", name: "Room", children: [{ id: "shelf", name: "Shelf", children: [] }] }];
    if (path === "/api/v1/tags") body = [{ id: "tag", name: "Equipment" }];
    if (path === "/api/v1/status") body = { health: true, build: { version: "test" }, oidc: {}, versions: [] };
    if (path === "/api/v1/entities") body = { items: [] };
    await route.fulfill({ json: body });
  });
});

test("basic filters, busy state, all rows, reset and header-only download at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/collection/tools");
  const button = page.getByRole("button", { name: "Download filtered inventory CSV", exact: true });
  await expect(button).toBeEnabled({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "Export full collection", exact: true })).toBeVisible();
  await page.getByLabel("Search inventory (text or #asset-ID)").fill("camera");
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("checkbox", { name: /Shelf/ }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByRole("checkbox", { name: "Equipment" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("switch", { name: "Include archived inventory" }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requests = 0;
  const rows = Array.from({ length: 60 }, (_, i) => `Camera ${i},value ${i}`).join("\n");
  await page.route("**/api/v1/entities/export?**", async route => {
    requests++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("filtered")).toBe("true");
    expect(params.get("tenant")).toBe("collection-a");
    expect(params.get("q")).toBe("camera");
    expect(params.getAll("parentIds")).toEqual(["shelf"]);
    expect(params.getAll("tags")).toEqual(["tag"]);
    expect(params.get("includeArchived")).toBe("true");
    expect(params.has("page")).toBe(false);
    await gate;
    await route.fulfill({ contentType: "text/csv", body: `HB.name,HB.field.Test\n${rows}\n` });
  });
  const downloadPromise = page.waitForEvent("download");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Downloading CSV…" })).toBeDisabled();
  expect(requests).toBe(1);
  release();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^homebox-filtered-inventory-.*\.csv$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(`HB.name,HB.field.Test\n${rows}\n`);
  await expect(button).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Search inventory (text or #asset-ID)")).toHaveValue("");
  await expect(page.getByRole("switch")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Locations", exact: true })).toBeVisible();
  await page.unroute("**/api/v1/entities/export?**");
  await page.route("**/api/v1/entities/export?**", route =>
    route.fulfill({ contentType: "text/csv", body: "HB.name,HB.description\n" })
  );
  const emptyDownload = page.waitForEvent("download");
  await button.click();
  const emptyStream = await (await emptyDownload).createReadStream();
  const emptyChunks = [];
  for await (const chunk of emptyStream!) emptyChunks.push(chunk);
  expect(Buffer.concat(emptyChunks).toString()).toBe("HB.name,HB.description\n");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("failure is visible, produces no download, and restores availability", async ({ page }) => {
  await page.goto("/collection/tools");
  const button = page.getByRole("button", { name: "Download filtered inventory CSV", exact: true });
  await expect(button).toBeEnabled({ timeout: 30000 });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/v1/entities/export?**", route => route.fulfill({ status: 500, json: { error: "failed" } }));
  await button.click();
  await expect(page.getByRole("alert")).toContainText("Could not download inventory CSV");
  await expect(button).toBeEnabled({ timeout: 30000 });
  expect(downloads).toBe(0);
});

test("collection changes clear filters and discard an in-flight old-collection CSV", async ({ page }) => {
  await page.goto("/collection/tools");
  const button = page.getByRole("button", { name: "Download filtered inventory CSV", exact: true });
  await expect(button).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("checkbox", { name: /Shelf/ }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByRole("checkbox", { name: "Equipment" }).check();
  await page.keyboard.press("Escape");
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/v1/entities/export?**", async route => {
    expect(new URL(route.request().url()).searchParams.get("tenant")).toBe("collection-a");
    await gate;
    await route.fulfill({ contentType: "text/csv", body: "HB.name\nOld collection\n" });
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await button.click();
  await expect(page.getByRole("button", { name: "Downloading CSV…" })).toBeDisabled();
  // Simulate a preference update from another tab without a reload so the
  // pending response actually reaches this mounted Tools surface.
  await page.evaluate(() => {
    const key = "homebox/preferences/location";
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify({ ...JSON.parse(oldValue!), collectionId: "collection-b" });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, storageArea: localStorage }));
  });
  await expect(page.getByRole("button", { name: "Locations", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tags", exact: true })).toBeVisible();
  release();
  await expect(button).toBeEnabled({ timeout: 30000 });
  expect(downloads).toBe(0);
  await page.unroute("**/api/v1/entities/export?**");
  await page.route("**/api/v1/entities/export?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("tenant")).toBe("collection-b");
    expect(route.request().headers()["x-tenant"]).toBe("collection-b");
    expect(params.getAll("parentIds")).toEqual([]);
    expect(params.getAll("tags")).toEqual([]);
    await route.fulfill({ contentType: "text/csv", body: "HB.name\nNew collection\n" });
  });
  const download = page.waitForEvent("download");
  await button.click();
  await download;
});
