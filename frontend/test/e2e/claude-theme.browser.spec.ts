import { expect as baseExpect, test } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(120000);

const itemId = "11111111-1111-4111-8111-111111111111";
const asset = {
  id: itemId,
  name: "Theme test asset",
  description: "Inventory details",
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

// Exercise the real selector, preference synchronization and pages, without a live API.
test("selects, persists, and renders Claude-inspired Dark independently of device appearance", async ({
  page,
  context,
  baseURL,
}) => {
  let settings: Record<string, unknown> = {
    theme: "homebox",
    showEmpty: false,
  };
  await context.addCookies([{ name: "hb.auth.session", value: "true", url: baseURL! }]);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/users/self/settings")) {
      if (route.request().method() === "PUT") settings = route.request().postDataJSON();
      body = { item: settings };
    } else if (path.endsWith("/users/self")) {
      body = {
        item: {
          id: "user",
          name: "Theme tester",
          email: "theme@example.com",
          groupIds: ["group"],
          defaultGroupId: "group",
        },
      };
    } else if (path.endsWith("/status")) {
      body = {
        health: true,
        build: { version: "test" },
        oidc: { enabled: false },
        versions: [],
      };
    } else if (path.endsWith("/groups/all")) {
      body = [{ id: "group", name: "Test collection", currency: "USD" }];
    } else if (path.endsWith("/groups")) {
      body = { id: "group", name: "Test collection", currency: "USD" };
    } else if (path.endsWith(`/entities/${itemId}`)) {
      body = asset;
    } else if (path.endsWith("/entities")) {
      body = { items: [asset], total: 1 };
    }
    await route.fulfill({ json: body });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/profile");
  const option = page.getByRole("button", {
    name: "Claude-inspired Dark",
    exact: true,
  });
  await expect(page.getByRole("button", { name: "Homebox", exact: true })).toBeVisible({ timeout: 20000 });
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "claude-dark");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location")!).theme))
    .toBe("claude-dark");
  await expect.poll(() => settings.theme).toBe("claude-dark");
  expect(settings.showEmpty).toBe(false);
  await page.reload();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/theme-claude-dark/);
  expect(await page.locator("html").evaluate(el => getComputedStyle(el).colorScheme)).toBe("dark");

  await page.goto("/items");
  await expect(page.getByText("Theme test asset", { exact: true }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "claude-dark");
  await page.goto(`/item/${itemId}`);
  await page.getByRole("button", { name: /more.actions/i }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(49, 46, 43)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Record disposal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const colors = await dialog.evaluate(el => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, text: style.color };
  });
  expect(colors.background).toBe("rgb(35, 33, 31)");
  expect(colors.text).toBe("rgb(239, 236, 230)");
  await page.getByLabel("Disposal route").selectOption("destruction");
  const method = page.getByLabel("Destruction method", { exact: true });
  await method.focus();
  expect(await method.evaluate(el => getComputedStyle(el).color)).toBe("rgb(239, 236, 230)");
  await page.screenshot({ path: "test-results/claude-dark-dialog.png" });
  await expect(page.getByRole("button", { name: "Submit destruction declaration" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // Other themes stay selectable, and switching removes the dark-only class.
  await page.goto("/profile");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveClass(/theme-claude-dark/);
});
