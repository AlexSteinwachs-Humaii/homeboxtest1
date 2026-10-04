import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/**
 * Collection administration with intercepted group, currency and membership
 * responses. Nothing here calls a live delete or leave endpoint.
 */

const USER_ID = "user-1";
const OTHER_ID = "user-2";
const GROUP_ID = "group-workshop";
const SPARE_ID = "group-spare";
const NOW = "2024-06-01T00:00:00Z";

const SECTIONS = [
  { id: "members", path: "/collection/members", label: "Members" },
  { id: "invites", path: "/collection/invites", label: "Invites" },
  { id: "notifiers", path: "/collection/notifiers", label: "Notifiers" },
  { id: "settings", path: "/collection/settings", label: "Settings" },
  { id: "entity-types", path: "/collection/entity-types", label: "Entity Types" },
  { id: "tools", path: "/collection/tools", label: "Tools" },
] as const;

type GroupRecord = { id: string; name: string; currency: string; createdAt: string; updatedAt: string };

type MembershipMode = "multi" | "only" | "fail" | "hold";

type Recorded = {
  method: string;
  path: string;
  tenant: string;
  body: unknown;
};

type ApiState = {
  groups: Record<string, GroupRecord>;
  membership: MembershipMode;
  failGet: boolean;
  failUpdate: boolean;
  holdMembers: Promise<void> | null;
  holdSave: Promise<void> | null;
  calls: Recorded[];
};

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };

function group(id: string, name: string, currency: string): GroupRecord {
  return { id, name, currency, createdAt: NOW, updatedAt: NOW };
}

function freshState(): ApiState {
  return {
    groups: {
      [GROUP_ID]: group(GROUP_ID, "Workshop", "EUR"),
      [SPARE_ID]: group(SPARE_ID, "Spare room", "USD"),
    },
    membership: "multi",
    failGet: false,
    failUpdate: false,
    holdMembers: null,
    holdSave: null,
    calls: [],
  };
}

function user(id: string, name: string, email: string) {
  return { id, name, email, isSuperuser: false };
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("missing bounding box");
  }
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}

function rowsOf(boxes: Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const box of boxes) {
    const row = rows.find(group => Math.abs(group[0]!.y - box.y) < 8);
    if (row) {
      row.push(box);
    } else {
      rows.push([box]);
    }
  }
  return rows;
}

async function expectNoHorizontalClip(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll("[data-testid='collection-admin'] *")) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) {
        continue;
      }
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        offenders.push(
          `${el.tagName}.${String(el.className).slice(0, 80)} ${Math.round(rect.left)}-${Math.round(rect.right)}`
        );
      }
    }
    return { offenders: offenders.slice(0, 8) };
  });
  expect(metrics.offenders, label).toEqual([]);
}

async function mockApi(page: Page, state: ApiState) {
  const ada = user(USER_ID, "Ada Lovelace", "ada@example.com");
  const grace = user(OTHER_ID, "Grace Hopper", "grace@example.com");

  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const tenant = request.headers()["x-tenant"] || "";
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    const record = () => {
      let body: unknown = null;
      if (method !== "GET" && method !== "HEAD") {
        try {
          body = request.postDataJSON();
        } catch {
          body = request.postData();
        }
      }
      state.calls.push({ method, path, tenant, body });
    };

    if (path.endsWith("/status")) {
      return json({
        allowRegistration: true,
        build: { buildTime: NOW, commit: "glass-collection", version: "v0.0.0" },
        demo: false,
        health: true,
        labelPrinting: false,
        latest: { date: NOW, version: "v0.0.0" },
        message: "",
        oidc: { allowLocal: true, autoRedirect: false, buttonText: "", enabled: false },
        title: "Homebox",
        versions: [],
      });
    }

    if (path.endsWith("/users/self/settings")) {
      return json({ error: "no remote settings" }, method === "GET" ? 404 : 200);
    }
    if (path.endsWith("/users/self")) {
      return json({
        item: {
          ...ada,
          groupIds: [GROUP_ID, SPARE_ID],
          defaultGroupId: GROUP_ID,
          oidcIssuer: "",
          oidcSubject: "",
        },
      });
    }
    if (path.endsWith("/users/logout")) return json({});
    if (path.endsWith("/currencies")) {
      return json([
        { code: "EUR", decimals: 2, local: "en-US", name: "Euro", symbol: "€" },
        { code: "GBP", decimals: 2, local: "en-GB", name: "Pound", symbol: "£" },
        { code: "USD", decimals: 2, local: "en-US", name: "US Dollar", symbol: "$" },
      ]);
    }
    if (path.endsWith("/groups/all")) {
      return json(Object.values(state.groups));
    }
    if (path.includes("/groups/members")) {
      record();
      if (state.holdMembers) {
        await state.holdMembers;
      }
      if (state.membership === "fail" && method === "GET") {
        return json({ error: "members unavailable" }, 500);
      }
      const active = tenant || GROUP_ID;
      if (method === "DELETE") {
        return json({ error: "not authorized to leave this collection" }, 403);
      }
      if (state.membership === "only" && active === GROUP_ID) {
        return json([ada]);
      }
      return json([ada, grace]);
    }
    if (path.includes("/groups/invitations")) {
      record();
      return json([]);
    }
    if (path.endsWith("/groups")) {
      record();
      const active = tenant || GROUP_ID;
      const current = state.groups[active] ?? state.groups[GROUP_ID]!;
      if (method === "GET") {
        if (state.failGet) {
          return json({ error: "settings unavailable" }, 500);
        }
        return json(current);
      }
      if (method === "PUT") {
        if (state.holdSave) {
          await state.holdSave;
        }
        if (state.failUpdate) {
          return json({ error: "validation failed", fields: { name: "could not be saved" } }, 422);
        }
        const body = (request.postDataJSON() ?? {}) as { name?: string; currency?: string };
        const next = {
          ...current,
          name: body.name || current.name,
          currency: body.currency || current.currency,
          updatedAt: NOW,
        };
        state.groups[active] = next;
        return json(next);
      }
      if (method === "DELETE") {
        return json({ error: "delete refused in this check" }, 403);
      }
      return json(current);
    }
    if (path.endsWith("/notifiers") || path.endsWith("/entity-types") || path.endsWith("/templates")) {
      record();
      return json([]);
    }
    if (path.endsWith("/group/exports") || path.includes("/group/exports")) {
      record();
      return json({ items: [] });
    }
    if (path.includes("/entities/tree") || path.endsWith("/tags") || path.endsWith("/maintenance")) {
      return json([]);
    }
    if (path.includes("/entities")) {
      return json({ items: [], page: 1, pageSize: 10, total: 0, totalPrice: 0 });
    }
    if (path.includes("/groups/statistics")) {
      return json({
        totalItemPrice: 0,
        totalItems: 0,
        totalLocations: 0,
        totalTags: 0,
        totalUsers: 1,
        totalWithWarranty: 0,
      });
    }
    return json(method === "GET" ? [] : {});
  });
}

async function openSettings(page: Page) {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/collection/settings");
  await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("collection-admin")).toBeVisible();
}

async function navBoxes(page: Page): Promise<Box[]> {
  const items = page.locator("[data-collection-nav-item]");
  await expect(items).toHaveCount(6);
  const boxes: Box[] = [];
  for (let index = 0; index < 6; index += 1) {
    boxes.push(await boxOf(items.nth(index)));
  }
  return boxes;
}

test.describe("Glass v5 collection administration", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3000";
    page.setDefaultTimeout(20_000);
    await page.context().addCookies([{ name: "hb.auth.session", value: "true", url: origin }]);
    await page.addInitScript(() => {
      const media = {
        getUserMedia: () => Promise.resolve({ getTracks: () => [] }),
        enumerateDevices: () => Promise.resolve([]),
      };
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
      if (!sessionStorage.getItem("hb-collection-e2e")) {
        localStorage.removeItem("homebox/preferences/location");
        sessionStorage.setItem("hb-collection-e2e", "1");
      }
    });
  });

  test("wraps six destinations, keeps collection context and 44px targets at 834×1112", async ({ page }) => {
    test.setTimeout(120_000);
    const state = freshState();
    await mockApi(page, state);
    await openSettings(page);

    await expect(page.getByText("Manage / Workshop")).toBeVisible();
    await expect(page.getByTestId("collection-admin-settings")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");
    await expect(page.getByTestId("collection-settings-example")).toContainText("€");
    await expect(page.getByTestId("collection-settings-example")).not.toContainText("$1,000.00");

    const boxes = await navBoxes(page);
    const rows = rowsOf(boxes);
    expect(rows, "two wrapped rows").toHaveLength(2);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(3);
    expect(rows[1]![0]!.y).toBeGreaterThan(rows[0]![0]!.y + 40);
    for (const [index, box] of boxes.entries()) {
      expect(box.width, `${SECTIONS[index]!.label} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${SECTIONS[index]!.label} height`).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(834 + 1);
    }
    await expectNoHorizontalClip(page, "ipad administration");

    const gets = () => state.calls.filter(call => call.method === "GET" && call.path.endsWith("/groups"));
    await expect.poll(() => gets().some(call => call.tenant === GROUP_ID)).toBe(true);

    for (const section of SECTIONS) {
      await page.getByTestId(`collection-admin-${section.id}`).click();
      await expect(page).toHaveURL(new RegExp(`${section.path}$`));
      await expect(page.getByTestId(`collection-admin-${section.id}`)).toHaveAttribute("aria-current", "page");
      await expect(page.getByText("Manage / Workshop")).toBeVisible();
      const link = page.getByTestId(`collection-admin-${section.id}`);
      await expect(link).toHaveAttribute("href", section.path);
      await expect(link).toContainText(section.label);
    }

    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await expect(page.getByText("Import/Export", { exact: true })).toBeVisible();
    await expect(page.getByTestId("collection-danger-zone")).toHaveCount(0);
    await expect(page.getByTestId("collection-settings-save")).toHaveCount(0);

    await page.getByTestId("collection-admin-entity-types").click();
    await expect(page.getByText("No entity types defined yet.")).toBeVisible();

    await page.getByTestId("collection-admin-notifiers").click();
    await expect(page.getByRole("heading", { name: "Notifiers" })).toBeVisible();
    await expect(page.getByText("No notifiers configured")).toBeVisible();

    await page.getByTestId("collection-admin-invites").click();
    await expect(page.getByText("No invites")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Invite" })).toBeVisible();

    await page.getByTestId("collection-admin-members").click();
    await expect(page.getByRole("cell", { name: "Ada Lovelace" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Grace Hopper" })).toBeVisible();

    await page.goto("/home");
    await expect(page.getByTestId("shell-search")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Collection", exact: true }).click();
    await expect(page).toHaveURL(/\/collection\/settings$/);
    await expect(page.getByTestId("collection-settings-form")).toBeVisible();

    await page.goto("/collection");
    await expect(page).toHaveURL(/\/collection\/settings$/);
  });

  test("stays usable by keyboard and at narrow and wide widths", async ({ page }) => {
    test.setTimeout(90_000);
    const state = freshState();
    await mockApi(page, state);
    await openSettings(page);

    const name = page.locator("#collection-settings-name");
    await name.focus();
    await expect(name).toBeFocused();
    const nameFocus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, shadow: style.boxShadow };
    });
    const nameVisible =
      (nameFocus?.outline && nameFocus.outline !== "none" && nameFocus.outlineWidth !== "0px") ||
      (nameFocus?.shadow && nameFocus.shadow !== "none");
    expect(nameVisible, "name field focus").toBe(true);

    await page.getByTestId("collection-settings-currency").focus();
    await expect(page.getByTestId("collection-settings-currency")).toBeFocused();
    await page.getByTestId("collection-settings-save").focus();
    await expect(page.getByTestId("collection-settings-save")).toBeFocused();
    await page.getByTestId("collection-admin-members").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/collection\/members$/);
    await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/collection/settings");
    await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop", { timeout: 20_000 });
    const narrow = rowsOf(await navBoxes(page));
    expect(narrow).toHaveLength(3);
    expect(narrow.every(row => row.length === 2)).toBe(true);
    await expectNoHorizontalClip(page, "narrow administration");

    await page.setViewportSize({ width: 320, height: 700 });
    await expect(page.getByTestId("collection-admin-nav")).toBeVisible();
    const stacked = rowsOf(await navBoxes(page));
    expect(stacked).toHaveLength(6);
    expect(stacked.every(row => row.length === 1)).toBe(true);
    for (const box of stacked.flat()) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalClip(page, "stacked administration");

    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = rowsOf(await navBoxes(page));
    expect(wide).toHaveLength(2);
    expect(wide[0]).toHaveLength(3);
    await expect(page.getByTestId("collection-settings-form")).toBeVisible();
    await expectNoHorizontalClip(page, "wide administration");
  });

  test("saves name and currency through the existing API and keeps them after reload and collection switch", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const state = freshState();
    await mockApi(page, state);
    await openSettings(page);

    const name = page.locator("#collection-settings-name");
    const example = page.getByTestId("collection-settings-example");
    await name.fill("North workshop");
    await page.getByTestId("collection-settings-currency").click();
    await page.getByRole("option", { name: "US Dollar" }).click();
    await page.getByTestId("collection-settings-currency").click();
    await page.getByRole("option", { name: "Pound" }).click();
    await expect(example).toContainText("£");
    await expect(example).not.toContainText("$1,000.00");
    await expect(example).not.toContainText("€");

    await page.getByTestId("collection-settings-save").click();
    await expect(page.getByText("Group updated")).toBeVisible();
    await expect(page.getByText("Manage / North workshop")).toBeVisible();
    await expect(page.getByText("Choose a name and currency format for North workshop.")).toBeVisible();

    const updates = state.calls.filter(call => call.method === "PUT" && call.path.endsWith("/groups"));
    expect(updates).toHaveLength(1);
    expect(updates[0]!.tenant).toBe(GROUP_ID);
    expect(updates[0]!.body).toEqual({ name: "North workshop", currency: "GBP" });

    await page.reload();
    await expect(name).toHaveValue("North workshop");
    await expect(example).toContainText("£");
    await expect(page.getByRole("combobox", { name: "Select Collection" })).toContainText("North workshop");
    const reloaded = state.calls.filter(
      call => call.method === "GET" && call.path.endsWith("/groups") && call.tenant === GROUP_ID
    );
    expect(reloaded.length).toBeGreaterThan(0);

    await page.getByRole("combobox", { name: "Select Collection" }).click();
    await page.getByRole("option", { name: "Spare room" }).click();
    await expect(name).toHaveValue("Spare room", { timeout: 20_000 });
    await expect(example).toContainText("$");
    await expect(example).not.toContainText("£");
    await expect(page.getByText("Manage / Spare room")).toBeVisible();
    await expect
      .poll(() =>
        state.calls.some(call => call.method === "GET" && call.path.endsWith("/groups") && call.tenant === SPARE_ID)
      )
      .toBe(true);

    await name.fill("Cellar");
    await page.getByTestId("collection-settings-save").click();
    await expect(page.getByText("Group updated").last()).toBeVisible();
    const spareUpdates = state.calls.filter(call => call.method === "PUT" && call.tenant === SPARE_ID);
    expect(spareUpdates).toHaveLength(1);
    expect(spareUpdates[0]!.body).toMatchObject({ name: "Cellar", currency: "USD" });
    expect(state.groups[GROUP_ID]!.name).toBe("North workshop");

    await page.reload();
    await expect(name).toHaveValue("Cellar");
    await page.getByRole("combobox", { name: "Select Collection" }).click();
    await page.getByRole("option", { name: "North workshop" }).click();
    await expect(name).toHaveValue("North workshop", { timeout: 20_000 });
    await expect(example).toContainText("£");
  });

  test("keeps failed load and save visible without discarding input or accepting a second submit", async ({ page }) => {
    test.setTimeout(90_000);
    const state = freshState();
    state.failGet = true;
    await mockApi(page, state);
    await openSettings(page);

    await expect(page.getByTestId("collection-settings-load-error")).toBeVisible();
    await expect(page.getByTestId("collection-settings-load-error")).toContainText("Backend API call failed");
    await expect(page.getByTestId("collection-settings-form")).toHaveCount(0);
    await expect(page.getByTestId("collection-settings-save")).toHaveCount(0);

    state.failGet = false;
    await page.getByTestId("collection-settings-retry").click();
    const name = page.locator("#collection-settings-name");
    await expect(name).toHaveValue("Workshop");

    state.failUpdate = true;
    await name.fill("Workshop draft");
    await page.getByTestId("collection-settings-currency").click();
    await page.getByRole("option", { name: "Pound" }).click();
    await page.getByTestId("collection-settings-save").click();
    const error = page.getByTestId("collection-settings-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Failed to update group");
    await expect(error).toContainText("could not be saved");
    await expect(name).toHaveValue("Workshop draft");
    await expect(page.getByTestId("collection-settings-currency")).toContainText("Pound");
    expect(state.groups[GROUP_ID]!.name).toBe("Workshop");

    state.failUpdate = false;
    let releaseSave = () => {};
    state.holdSave = new Promise(resolve => {
      releaseSave = resolve;
    });
    const before = state.calls.filter(call => call.method === "PUT").length;
    await page.getByTestId("collection-settings-save").click();
    await expect(page.getByTestId("collection-settings-save")).toBeDisabled();
    await expect.poll(() => state.calls.filter(call => call.method === "PUT").length).toBe(before + 1);
    await page.getByTestId("collection-settings-save").click({ force: true });
    await name.press("Enter");
    expect(state.calls.filter(call => call.method === "PUT").length).toBe(before + 1);
    releaseSave();
    await expect(page.getByText("Group updated")).toBeVisible();
    await expect(name).toHaveValue("Workshop draft");
    expect(state.groups[GROUP_ID]!.name).toBe("Workshop draft");
    expect(state.groups[GROUP_ID]!.currency).toBe("GBP");
  });

  test("cancels leave, keeps only-member delete distinct, and stays safe when membership or authorization fails", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const state = freshState();
    let releaseMembers = () => {};
    state.holdMembers = new Promise(resolve => {
      releaseMembers = resolve;
    });
    await mockApi(page, state);
    await openSettings(page);

    const danger = page.getByTestId("collection-danger-action");
    const save = page.getByTestId("collection-settings-save");
    await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");
    await expect(danger).toBeDisabled();
    await expect(danger).toContainText("Checking membership");
    await expect(danger).not.toContainText("Leave Collection");
    await expect(danger).not.toContainText("Delete Collection");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const saveBox = await boxOf(save);
    const dangerBox = await boxOf(danger);
    expect(dangerBox.y).toBeGreaterThan(saveBox.bottom - 1);
    expect(dangerBox.height).toBeGreaterThanOrEqual(44);
    expect(saveBox.height).toBeGreaterThanOrEqual(44);

    releaseMembers();
    state.holdMembers = null;
    await expect(danger).toBeEnabled();
    await expect(danger).toContainText("Leave Collection");
    await expect(page.getByRole("heading", { name: "Leave this collection" })).toBeVisible();
    await expect(danger).not.toContainText("Delete Collection");

    await danger.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Are you sure you want to leave this collection?");
    await expect(dialog).not.toContainText("delete this collection");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(state.calls.filter(call => call.method === "DELETE")).toHaveLength(0);

    await danger.click();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Backend API call failed")).toBeVisible();
    await expect(page).toHaveURL(/\/collection\/settings$/);
    await expect(page.locator("#collection-settings-name")).toHaveValue("Workshop");
    await expect(danger).toBeEnabled();
    const leaveAttempts = state.calls.filter(call => call.method === "DELETE");
    expect(leaveAttempts).toHaveLength(1);
    expect(leaveAttempts[0]!.path).toContain(`/groups/members/${USER_ID}`);
    expect(leaveAttempts[0]!.path.endsWith("/groups")).toBe(false);
    expect(state.groups[GROUP_ID]!.name).toBe("Workshop");

    state.membership = "fail";
    state.calls.length = 0;
    await page.reload();
    await expect(danger).toContainText("Leave Collection");
    await expect(danger).not.toContainText("Delete Collection");
    await expect(page.getByRole("heading", { name: "Delete this collection" })).toHaveCount(0);

    state.membership = "only";
    await page.reload();
    await expect(danger).toContainText("Delete Collection");
    await expect(danger).not.toContainText("Leave Collection");
    await expect(page.getByRole("heading", { name: "Delete this collection" })).toBeVisible();
    await expect(page.getByText("You are the only member")).toBeVisible();
    await danger.click();
    await expect(dialog).toContainText(
      "Are you sure you want to delete this collection? This action cannot be undone."
    );
    await expect(dialog).not.toContainText("leave this collection");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(state.calls.filter(call => call.method === "DELETE")).toHaveLength(0);
    expect(state.groups[GROUP_ID]).toBeTruthy();
    await expect(page.getByTestId("collection-settings-save")).toBeEnabled();
  });
});
