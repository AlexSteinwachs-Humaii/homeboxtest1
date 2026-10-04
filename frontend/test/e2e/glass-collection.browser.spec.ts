import { expect as playwrightExpect, test, type Locator, type Page, type Route } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30_000 });

/**
 * Collection administration against a mocked API. These checks guard the
 * Glass v5 settings and navigation changes: routes, persistence, and the
 * leave/delete safeguards. They do not delete a live collection.
 */

const workshopId = "group-workshop";
const spareId = "group-spare";
const userId = "user-ada";
const now = "2026-03-02T12:00:00Z";

const sections = [
  { id: "members", path: "/collection/members", label: "Members" },
  { id: "invites", path: "/collection/invites", label: "Invites" },
  { id: "notifiers", path: "/collection/notifiers", label: "Notifiers" },
  { id: "settings", path: "/collection/settings", label: "Settings" },
  { id: "entity-types", path: "/collection/entity-types", label: "Entity Types" },
  { id: "tools", path: "/collection/tools", label: "Tools" },
] as const;

type MembershipMode = "multi" | "only" | "fail";

type ApiCall = {
  method: string;
  path: string;
  tenant: string;
  body: string;
};

type GroupState = {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type Harness = {
  calls: ApiCall[];
  groups: Map<string, GroupState>;
  membership: MembershipMode;
  failGroupGet: boolean;
  failNextSave: boolean;
  holdMembers: Promise<void> | null;
  holdSave: Promise<void> | null;
  holdGroupGet: Promise<void> | null;
};

function currencies() {
  return [
    { code: "EUR", decimals: 2, local: "en", name: "Euro", symbol: "€" },
    { code: "USD", decimals: 2, local: "en", name: "US Dollar", symbol: "$" },
    { code: "GBP", decimals: 2, local: "en", name: "British Pound", symbol: "£" },
  ];
}

function user() {
  return {
    id: userId,
    name: "Ada Lovelace",
    email: "ada@example.com",
    defaultGroupId: workshopId,
    groupIds: [workshopId, spareId],
    isSuperuser: false,
    oidcIssuer: "",
    oidcSubject: "",
  };
}

function membersFor(mode: MembershipMode) {
  const ada = { id: userId, name: "Ada Lovelace", email: "ada@example.com", isSuperuser: false, isOwner: true };
  const bob = { id: "user-bob", name: "Bob Builder", email: "bob@example.com", isSuperuser: false, isOwner: false };
  return mode === "only" ? [ada] : [ada, bob];
}

function createHarness(): Harness {
  return {
    calls: [],
    groups: new Map([
      [workshopId, { id: workshopId, name: "Workshop", currency: "EUR", createdAt: now, updatedAt: now }],
      [spareId, { id: spareId, name: "Spare room", currency: "GBP", createdAt: now, updatedAt: now }],
    ]),
    membership: "multi",
    failGroupGet: false,
    failNextSave: false,
    holdMembers: null,
    holdSave: null,
    holdGroupGet: null,
  };
}

function apiPath(url: string) {
  return new URL(url).pathname.replace(/\/$/, "") || "/";
}

function tenantOf(route: Route) {
  return route.request().headers()["x-tenant"] || "";
}

async function fulfill(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function handleApi(route: Route, harness: Harness) {
  const request = route.request();
  const path = apiPath(request.url());
  const method = request.method();
  const tenant = tenantOf(route);
  const rawBody = request.postData() || "";
  harness.calls.push({ method, path, tenant, body: rawBody });

  if (path.endsWith("/status")) {
    await fulfill(route, 200, {
      allowRegistration: true,
      build: { buildTime: now, commit: "glass", version: "1.0.0" },
      demo: false,
      health: true,
      labelPrinting: false,
      latest: { date: now, version: "1.0.0" },
      message: "",
      oidc: { allowLocal: true, autoRedirect: false, buttonText: "", enabled: false },
      telemetry: { enabled: false },
      title: "HomeBox",
      versions: ["1.0.0"],
    });
    return;
  }

  if (path.endsWith("/users/self/settings")) {
    await fulfill(route, 200, { item: { theme: "homebox" } });
    return;
  }
  if (path.endsWith("/users/self")) {
    await fulfill(route, 200, { item: user() });
    return;
  }
  if (path.endsWith("/users/logout")) {
    await route.fulfill({ status: 204, body: "" });
    return;
  }
  if (path.endsWith("/groups/all")) {
    await fulfill(route, 200, [...harness.groups.values()]);
    return;
  }
  if (path.endsWith("/groups/statistics")) {
    await fulfill(route, 200, {
      totalItemPrice: 0,
      totalItems: 0,
      totalLocations: 0,
      totalTags: 0,
      totalUsers: harness.membership === "only" ? 1 : 2,
      totalWithWarranty: 0,
    });
    return;
  }
  if (path.endsWith("/groups/members") && method === "GET") {
    if (harness.holdMembers) {
      await harness.holdMembers;
    }
    if (harness.membership === "fail") {
      await fulfill(route, 500, { error: "membership unavailable" });
      return;
    }
    await fulfill(route, 200, membersFor(harness.membership));
    return;
  }
  if (path.includes("/groups/members/") && method === "DELETE") {
    await fulfill(route, 403, { error: "not authorized to leave" });
    return;
  }
  if (path.endsWith("/groups/invitations")) {
    await fulfill(route, 200, []);
    return;
  }
  if (path.endsWith("/currencies")) {
    await fulfill(route, 200, currencies());
    return;
  }
  if (path.endsWith("/groups") && method === "GET") {
    if (harness.holdGroupGet) {
      await harness.holdGroupGet;
    }
    if (harness.failGroupGet) {
      await fulfill(route, 400, { error: "settings unavailable" });
      return;
    }
    const group = harness.groups.get(tenant) || harness.groups.get(workshopId);
    await fulfill(route, 200, group);
    return;
  }
  if (path.endsWith("/groups") && method === "PUT") {
    if (harness.holdSave) {
      await harness.holdSave;
    }
    const parsed = rawBody ? (JSON.parse(rawBody) as { name?: string; currency?: string }) : {};
    if (harness.failNextSave) {
      harness.failNextSave = false;
      await fulfill(route, 400, {
        error: "Validation Error",
        fields: { currency: "currency is not supported" },
      });
      return;
    }
    if (!parsed.name?.trim() || !parsed.currency?.trim()) {
      await fulfill(route, 400, { error: "Unknown Error" });
      return;
    }
    const current = harness.groups.get(tenant);
    if (!current) {
      await fulfill(route, 404, { error: "group not found" });
      return;
    }
    const updated = {
      ...current,
      name: parsed.name,
      currency: parsed.currency,
      updatedAt: "2026-03-02T12:05:00Z",
    };
    harness.groups.set(tenant, updated);
    await fulfill(route, 200, updated);
    return;
  }
  if (path.endsWith("/groups") && method === "DELETE") {
    await fulfill(route, 403, { error: "delete was not expected" });
    return;
  }
  if (path.endsWith("/group/exports")) {
    await fulfill(route, 200, { items: [] });
    return;
  }
  if (path.endsWith("/entities")) {
    await fulfill(route, 200, { items: [], page: 1, pageSize: 50, total: 0, totalPrice: 0 });
    return;
  }
  if (
    path.endsWith("/tags") ||
    path.endsWith("/entity-types") ||
    path.endsWith("/templates") ||
    path.endsWith("/notifiers") ||
    path.endsWith("/entities/tree") ||
    path.endsWith("/entities/fields") ||
    path.includes("/maintenance")
  ) {
    await fulfill(route, 200, []);
    return;
  }

  await fulfill(route, 200, []);
}

async function installApi(page: Page, harness: Harness) {
  await page.context().addCookies([
    {
      name: "hb.auth.session",
      value: "true",
      url: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    },
  ]);
  await page.context().route("**/api/v1/**", async route => {
    try {
      await handleApi(route, harness);
    } catch (error) {
      console.log("MOCK", route.request().method(), route.request().url(), error);
      await route
        .fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "mock failure" }),
        })
        .catch(() => undefined);
    }
  });
  await page.addInitScript(defaultId => {
    const marker = "glass-collection-prefs-reset";
    if (!sessionStorage.getItem(marker)) {
      localStorage.removeItem("homebox/preferences/location");
      sessionStorage.setItem(marker, "1");
    }
    if (!localStorage.getItem("homebox/preferences/location")) {
      localStorage.setItem("homebox/preferences/location", JSON.stringify({ collectionId: defaultId }));
    }
  }, workshopId);
}

async function openSettings(page: Page) {
  await page.goto("/collection/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("collection-admin")).toBeVisible();
}

async function waitForForm(page: Page) {
  await expect(page.getByTestId("collection-settings-form")).toBeVisible();
  await expect(page.locator("#collection-settings-name")).toBeVisible();
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return {
    x: value!.x,
    y: value!.y,
    width: value!.width,
    height: value!.height,
    right: value!.x + value!.width,
    bottom: value!.y + value!.height,
  };
}

function mutations(harness: Harness, method: string, path: string) {
  return harness.calls.filter(call => call.method === method && call.path === path);
}

test.describe.configure({ mode: "serial" });

test("wraps six administration destinations with collection context and 44px targets", async ({ page }) => {
  test.setTimeout(180_000);
  const harness = createHarness();
  await installApi(page, harness);
  await page.setViewportSize({ width: 834, height: 1112 });
  await openSettings(page);
  await waitForForm(page);

  await expect(page).toHaveURL(/\/collection\/settings\/?$/);
  await expect(page.getByTestId("collection-kicker")).toContainText("Workshop");
  await expect(page.getByTestId("collection-heading")).toHaveText("Collection");
  await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");
  await expect(page.getByTestId("collection-settings-example")).not.toContainText("$1,000.00");

  const groupGets = mutations(harness, "GET", "/api/v1/groups");
  expect(groupGets.some(call => call.tenant === workshopId)).toBeTruthy();

  const nav = page.getByTestId("collection-admin");
  const links = [];
  for (const section of sections) {
    const link = page.getByTestId(`collection-admin-${section.id}`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", section.path);
    await expect(link).toContainText(section.label);
    const rect = await box(link);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
    links.push(rect);
  }

  const [members, invites, notifiers, settings, entityTypes, tools] = links;
  expect(Math.abs(members!.y - invites!.y)).toBeLessThan(8);
  expect(Math.abs(invites!.y - notifiers!.y)).toBeLessThan(8);
  expect(invites!.x).toBeGreaterThan(members!.x + 40);
  expect(notifiers!.x).toBeGreaterThan(invites!.x + 40);
  expect(settings!.y).toBeGreaterThan(members!.y + 36);
  expect(Math.abs(settings!.y - entityTypes!.y)).toBeLessThan(8);
  expect(Math.abs(entityTypes!.y - tools!.y)).toBeLessThan(8);
  const navBox = await box(nav);
  expect(navBox.right).toBeLessThanOrEqual(834 + 1);

  await expect(page.getByTestId("collection-admin-settings")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("collection-danger-zone")).toBeVisible();
  const save = await box(page.getByTestId("collection-settings-save"));
  const danger = await box(page.getByTestId("collection-danger-zone"));
  expect(danger.y).toBeGreaterThan(save.y + 20);

  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar.getByRole("link", { name: "Collection" })).toHaveAttribute("href", "/collection/settings");

  await page.getByTestId("collection-admin-members").click();
  await expect(page).toHaveURL(/\/collection\/members\/?$/);
  await expect(page.getByTestId("collection-admin-members")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("collection-kicker")).toContainText("Workshop");
  await expect(page.getByText("Ada Lovelace").first()).toBeVisible();
  await expect(page.getByText("Bob Builder").first()).toBeVisible();
  await expect(page.getByTestId("collection-danger-zone")).toHaveCount(0);
  await expect(page.getByTestId("collection-settings-save")).toHaveCount(0);

  await page.getByTestId("collection-admin-invites").click();
  await expect(page).toHaveURL(/\/collection\/invites\/?$/);
  await expect(page.getByTestId("collection-admin-invites")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Create Invite" })).toBeVisible();
  await expect(page.getByText("No invites")).toBeVisible();

  await page.getByTestId("collection-admin-notifiers").click();
  await expect(page).toHaveURL(/\/collection\/notifiers\/?$/);
  await expect(page.getByRole("heading", { name: "Notifiers" })).toBeVisible();
  await expect(page.getByText("No notifiers configured")).toBeVisible();

  await page.getByTestId("collection-admin-entity-types").click();
  await expect(page).toHaveURL(/\/collection\/entity-types\/?$/);
  await expect(page.getByRole("heading", { name: "Entity Types" })).toBeVisible();
  await expect(page.getByText("No entity types defined yet.")).toBeVisible();

  await page.getByTestId("collection-admin-tools").click();
  await expect(page).toHaveURL(/\/collection\/tools\/?$/);
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import/Export", exact: true })).toBeVisible();
  await expect(page.getByTestId("collection-danger-zone")).toHaveCount(0);

  await page.getByTestId("collection-admin-settings").click();
  await expect(page).toHaveURL(/\/collection\/settings\/?$/);
  await waitForForm(page);
  await expect(page.getByTestId("collection-admin-settings")).toHaveAttribute("aria-current", "page");

  await page.goto("/collection");
  await expect(page).toHaveURL(/\/collection\/settings\/?$/);
  await expect(page.getByTestId("collection-admin-settings")).toHaveAttribute("aria-current", "page");
});

test("saves name and currency through the API and keeps them after reload and switch", async ({ page }) => {
  test.setTimeout(180_000);
  const harness = createHarness();
  await installApi(page, harness);
  await page.setViewportSize({ width: 834, height: 1112 });
  await openSettings(page);
  await waitForForm(page);

  await page.locator("#collection-settings-name").fill("Workshop renamed");
  await page.getByTestId("collection-settings-currency").click();
  await page.getByRole("option", { name: "US Dollar" }).click();
  await expect(page.getByTestId("collection-settings-example")).toContainText(/\$|USD/);
  await page.getByTestId("collection-settings-currency").click();
  await page.getByRole("option", { name: "British Pound" }).click();
  await expect(page.getByTestId("collection-settings-example")).toContainText(/£|GBP/);
  await expect(page.getByTestId("collection-settings-example")).not.toContainText("$1,000.00");

  const before = mutations(harness, "PUT", "/api/v1/groups").length;
  await page.getByTestId("collection-settings-save").click();
  await expect(page.getByText("Group updated").first()).toBeVisible();
  const saved = mutations(harness, "PUT", "/api/v1/groups").slice(before);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.tenant).toBe(workshopId);
  expect(saved[0]?.body).toContain("Workshop renamed");
  expect(saved[0]?.body).toContain("GBP");
  await expect(page.getByTestId("collection-kicker")).toContainText("Workshop renamed");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await waitForForm(page);
  await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop renamed");
  await expect(page.getByTestId("collection-settings-example")).toContainText(/£|GBP/);
  await expect(page.getByTestId("collection-kicker")).toContainText("Workshop renamed");
  expect(mutations(harness, "GET", "/api/v1/groups").some(call => call.tenant === workshopId)).toBeTruthy();

  await page.getByRole("combobox", { name: "Select Collection" }).click();
  await page.getByRole("option", { name: "Spare room" }).click();
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await waitForForm(page);
  await expect(page.getByTestId("collection-kicker")).toContainText("Spare room");
  await expect(page.locator("#collection-settings-name")).toHaveValue("Spare room");
  await expect(page.getByTestId("collection-settings-example")).toContainText(/£|GBP/);
  expect(mutations(harness, "GET", "/api/v1/groups").some(call => call.tenant === spareId)).toBeTruthy();
  expect(harness.groups.get(spareId)?.name).toBe("Spare room");
  expect(harness.groups.get(spareId)?.currency).toBe("GBP");

  await page.getByRole("combobox", { name: "Select Collection" }).click();
  await page.getByRole("option", { name: "Workshop renamed" }).click();
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await waitForForm(page);
  await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop renamed");
  await expect(page.getByTestId("collection-settings-example")).toContainText(/£|GBP/);
});

test("keeps failed load and save visible without discarding input or double-submitting", async ({ page }) => {
  test.setTimeout(180_000);
  const harness = createHarness();
  harness.failGroupGet = true;
  let releaseGroupGet = () => {};
  harness.holdGroupGet = new Promise(resolve => {
    releaseGroupGet = resolve;
  });
  await installApi(page, harness);
  await page.setViewportSize({ width: 834, height: 1112 });
  await openSettings(page);

  await expect(page.getByTestId("collection-settings-loading")).toBeVisible();
  releaseGroupGet();
  harness.holdGroupGet = null;
  await expect(page.getByTestId("collection-settings-load-error")).toBeVisible();
  await expect(page.getByTestId("collection-settings-load-error")).toContainText("settings unavailable");
  await expect(page.getByTestId("collection-settings-form")).toHaveCount(0);
  await expect(page.getByTestId("collection-settings-save")).toHaveCount(0);

  harness.failGroupGet = false;
  await page.getByTestId("collection-settings-retry").click();
  await waitForForm(page);
  await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");

  await page.locator("#collection-settings-name").fill("Keep this draft");
  await page.getByTestId("collection-settings-currency").click();
  await page.getByRole("option", { name: "US Dollar" }).click();
  harness.failNextSave = true;
  await page.getByTestId("collection-settings-save").click();
  await expect(page.getByTestId("collection-settings-error")).toContainText("currency: currency is not supported");
  await expect(page.getByText("Failed to update group").first()).toBeVisible();
  await expect(page.locator("#collection-settings-name")).toHaveValue("Keep this draft");
  await expect(page.getByTestId("collection-settings-example")).toContainText(/\$|USD/);
  expect(harness.groups.get(workshopId)?.name).toBe("Workshop");

  await page.locator("#collection-settings-name").fill("");
  await page.getByTestId("collection-settings-save").click();
  await expect(page.getByTestId("collection-settings-error")).toContainText("Failed to update group");
  await expect(page.locator("#collection-settings-name")).toHaveValue("");

  await page.locator("#collection-settings-name").fill("Keep this draft");
  let releaseSave = () => {};
  harness.holdSave = new Promise(resolve => {
    releaseSave = resolve;
  });
  const putsBefore = mutations(harness, "PUT", "/api/v1/groups").length;
  await page.getByTestId("collection-settings-save").click();
  await expect(page.getByTestId("collection-settings-save")).toBeDisabled();
  await expect(page.getByTestId("collection-settings-save")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("collection-settings")).toHaveAttribute("data-phase", "saving");
  await page.locator("#collection-settings-name").press("Enter");
  await expect.poll(() => mutations(harness, "PUT", "/api/v1/groups").length).toBe(putsBefore + 1);
  await page.locator("#collection-settings-name").press("Enter");
  expect(mutations(harness, "PUT", "/api/v1/groups")).toHaveLength(putsBefore + 1);
  releaseSave();
  await expect(page.getByText("Group updated").first()).toBeVisible();
  await expect(page.locator("#collection-settings-name")).toHaveValue("Keep this draft");
  expect(mutations(harness, "PUT", "/api/v1/groups")).toHaveLength(putsBefore + 1);
});

test("cancels leave and delete without a mutation and keeps denied or loading actions safe", async ({ page }) => {
  test.setTimeout(180_000);
  const harness = createHarness();
  let releaseMembers = () => {};
  harness.holdMembers = new Promise(resolve => {
    releaseMembers = resolve;
  });
  await installApi(page, harness);
  await page.setViewportSize({ width: 834, height: 1112 });
  await openSettings(page);
  await waitForForm(page);

  const checking = page.getByTestId("collection-danger-action");
  await expect(checking).toHaveText("Checking membership");
  await expect(checking).toBeDisabled();
  await expect(page.getByTestId("collection-danger-zone")).toHaveAttribute("data-action", "checking");
  releaseMembers();
  harness.holdMembers = null;
  await expect(checking).toHaveText("Leave Collection");
  await expect(checking).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Leave this collection" })).toBeVisible();

  const deletesBefore = harness.calls.filter(call => call.method === "DELETE").length;
  await checking.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Are you sure you want to leave this collection?");
  await expect(dialog).not.toContainText("delete this collection");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(harness.calls.filter(call => call.method === "DELETE")).toHaveLength(deletesBefore);
  await expect(page).toHaveURL(/\/collection\/settings/);
  await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");

  await checking.click();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Backend API call failed").first()).toBeVisible();
  await expect(page).toHaveURL(/\/collection\/settings/);
  await expect(page.getByTestId("collection-kicker")).toContainText("Workshop");
  await expect(checking).toBeEnabled();
  await expect(checking).toHaveText("Leave Collection");
  expect(harness.groups.has(workshopId)).toBeTruthy();
  expect(mutations(harness, "DELETE", "/api/v1/groups")).toHaveLength(0);

  harness.membership = "fail";
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("collection-danger-action")).toHaveText("Leave Collection");
  await expect(page.getByTestId("collection-danger-action")).not.toHaveText("Delete Collection");
  await expect(page.getByText("Backend API call failed").first()).toBeVisible();

  harness.membership = "only";
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await waitForForm(page);
  const destroy = page.getByTestId("collection-danger-action");
  await expect(destroy).toHaveText("Delete Collection");
  await expect(page.getByRole("heading", { name: "Delete this collection" })).toBeVisible();
  await expect(page.getByText("You are the only member of this collection.")).toBeVisible();
  await expect(destroy).not.toHaveText("Leave Collection");

  const deleteCalls = mutations(harness, "DELETE", "/api/v1/groups").length;
  await destroy.click();
  await expect(dialog).toContainText("Are you sure you want to delete this collection? This action cannot be undone.");
  await expect(dialog).not.toContainText("leave this collection");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(mutations(harness, "DELETE", "/api/v1/groups")).toHaveLength(deleteCalls);
  await expect(page).toHaveURL(/\/collection\/settings/);
  await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");
  expect(harness.groups.has(workshopId)).toBeTruthy();
});

test("stays usable by keyboard and at narrow and wide widths", async ({ page }) => {
  test.setTimeout(180_000);
  const harness = createHarness();
  await installApi(page, harness);
  await page.setViewportSize({ width: 834, height: 1112 });
  await openSettings(page);
  await waitForForm(page);

  const members = page.getByTestId("collection-admin-members");
  await members.focus();
  await expect(members).toBeFocused();
  const focusRing = await members.evaluate(element => {
    const style = getComputedStyle(element);
    return Number.parseFloat(style.outlineWidth) >= 2 || style.boxShadow !== "none";
  });
  expect(focusRing).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/collection\/members\/?$/);
  await expect(page.getByText("Ada Lovelace").first()).toBeVisible();

  await page.getByTestId("collection-admin-settings").focus();
  await page.keyboard.press("Enter");
  await waitForForm(page);
  const name = page.locator("#collection-settings-name");
  await name.focus();
  await expect(name).toBeFocused();
  await name.fill("Keyboard draft");
  await expect(name).toHaveValue("Keyboard draft");

  const currency = page.getByTestId("collection-settings-currency");
  await currency.focus();
  await page.keyboard.press("Enter");
  const pound = page.getByRole("option", { name: "British Pound" });
  await expect(pound).toBeVisible();
  await pound.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("collection-settings-example")).toContainText(/£|GBP/);

  const save = page.getByTestId("collection-settings-save");
  await save.focus();
  await expect(save).toBeFocused();
  await expect(page.getByText("Name").first()).toBeVisible();
  await expect(page.getByText("Currency Format", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/collection/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 90_000 });
  await waitForForm(page);
  const phoneMembers = await box(page.getByTestId("collection-admin-members"));
  const phoneInvites = await box(page.getByTestId("collection-admin-invites"));
  const phoneNotifiers = await box(page.getByTestId("collection-admin-notifiers"));
  expect(Math.abs(phoneMembers.y - phoneInvites.y)).toBeLessThan(8);
  expect(phoneInvites.x).toBeGreaterThan(phoneMembers.x + 20);
  expect(phoneNotifiers.y).toBeGreaterThan(phoneMembers.y + 36);
  expect(phoneNotifiers.x).toBeLessThan(phoneInvites.x);
  const phoneNav = await box(page.getByTestId("collection-admin"));
  expect(phoneNav.x).toBeGreaterThanOrEqual(-1);
  expect(phoneNav.right).toBeLessThanOrEqual(391);
  await expect(page.locator("#collection-settings-name")).toBeVisible();
  await expect(page.getByTestId("collection-settings-save")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByTestId("collection-admin")).toBeVisible();
  const compact = [];
  for (const section of sections) {
    compact.push(await box(page.getByTestId(`collection-admin-${section.id}`)));
  }
  for (let index = 1; index < compact.length; index += 1) {
    expect(compact[index]!.y).toBeGreaterThan(compact[index - 1]!.y + 36);
    expect(Math.abs(compact[index]!.x - compact[0]!.x)).toBeLessThan(8);
  }
  const compactNav = await box(page.getByTestId("collection-admin"));
  expect(compactNav.right).toBeLessThanOrEqual(321);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("collection-admin-tools")).toBeVisible();
  const wideMembers = await box(page.getByTestId("collection-admin-members"));
  const wideNotifiers = await box(page.getByTestId("collection-admin-notifiers"));
  const wideSettings = await box(page.getByTestId("collection-admin-settings"));
  expect(Math.abs(wideMembers.y - wideNotifiers.y)).toBeLessThan(8);
  expect(wideSettings.y).toBeGreaterThan(wideMembers.y + 36);
  await expect(page.locator('[data-sidebar="sidebar"]').getByRole("link", { name: "Collection" })).toBeVisible();
});
