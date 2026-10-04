import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  activeShellNav,
  inventoryResultsBackHref,
  inventorySearchHref,
  profileActive,
  profileDestination,
  shellNav,
} from "../lib/shell-nav";

const here = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(resolve(here, "../layouts/default.vue"), "utf8");
const selector = readFileSync(resolve(here, "../components/Collection/Selector.vue"), "utf8");
const itemEdit = readFileSync(resolve(here, "../pages/item/[id]/index/edit.vue"), "utf8");
const en = readFileSync(resolve(here, "../locales/en.json"), "utf8");

describe("Glass shell navigation", () => {
  it("keeps every inventory destination and opens Collection on Settings", () => {
    expect(shellNav.map(item => item.id)).toEqual([
      "home",
      "search",
      "locations",
      "tags",
      "templates",
      "maintenance",
      "collection",
    ]);
    expect(shellNav.find(item => item.id === "collection")?.to).toBe("/collection/settings");
    expect(profileDestination).toBe("/profile");
    expect(selector).toContain('to="/collection/settings"');
    expect(selector).not.toContain('to="/collection/members"');
  });

  it("marks item routes and nested administration routes active", () => {
    expect(activeShellNav("/home")).toBe("home");
    expect(activeShellNav("/items")).toBe("search");
    expect(activeShellNav("/items?q=drill")).toBe("search");
    expect(activeShellNav("/item/abc")).toBe("search");
    expect(activeShellNav("/item/abc/edit")).toBe("search");
    expect(activeShellNav("/item/abc/maintenance")).toBe("search");
    expect(activeShellNav("/locations")).toBe("locations");
    expect(activeShellNav("/location/garage/edit")).toBe("locations");
    expect(activeShellNav("/tags")).toBe("tags");
    expect(activeShellNav("/tag/tools")).toBe("tags");
    expect(activeShellNav("/templates")).toBe("templates");
    expect(activeShellNav("/template/pack")).toBe("templates");
    expect(activeShellNav("/maintenance")).toBe("maintenance");
    expect(activeShellNav("/collection/settings")).toBe("collection");
    expect(activeShellNav("/collection/members")).toBe("collection");
    expect(activeShellNav("/collection/invites")).toBe("collection");
    expect(activeShellNav("/collection/notifiers")).toBe("collection");
    expect(activeShellNav("/collection/entity-types")).toBe("collection");
    expect(activeShellNav("/collection/tools")).toBe("collection");
    expect(activeShellNav("/items")).not.toBe("home");
    expect(profileActive("/profile")).toBe(true);
    expect(profileActive("/home")).toBe(false);
  });

  it("sends an empty global search into inventory browsing", () => {
    expect(inventorySearchHref("")).toBe("/items");
    expect(inventorySearchHref("   ")).toBe("/items");
    expect(inventorySearchHref("cordless drill")).toBe("/items?q=cordless%20drill");
    expect(inventorySearchHref("a&b")).toBe("/items?q=a%26b");
  });

  it("keeps a previous inventory search and otherwise falls back to /items", () => {
    expect(inventoryResultsBackHref(undefined)).toBe("/items");
    expect(inventoryResultsBackHref(null)).toBe("/items");
    expect(inventoryResultsBackHref("/items")).toBe("/items");
    expect(inventoryResultsBackHref("/items?q=drill&page=2")).toBe("/items?q=drill&page=2");
    expect(inventoryResultsBackHref("  /items?q=shelf  ")).toBe("/items?q=shelf");
    expect(inventoryResultsBackHref("/items?q=drill#results")).toBe("/items?q=drill");
    expect(inventoryResultsBackHref("/item/abc")).toBe("/items");
    expect(inventoryResultsBackHref("/item/abc/edit")).toBe("/items");
    expect(inventoryResultsBackHref("/home")).toBe("/items");
    expect(inventoryResultsBackHref("/items/extra")).toBe("/items");
    expect(inventoryResultsBackHref("https://evil.example/items?q=drill")).toBe("/items");
    expect(inventoryResultsBackHref("//evil.example/items")).toBe("/items");
    expect(inventoryResultsBackHref("/items/../admin")).toBe("/items");
    expect(inventoryResultsBackHref("/items?next=https://evil.example")).toBe("/items");
    expect(inventoryResultsBackHref("/items?q=a b")).toBe("/items");
  });

  it("keeps search, scan permission handling, create, profile and sign-out in the shell", () => {
    expect(layout).toContain("inventorySearchHref");
    expect(layout).toContain("navigator.mediaDevices");
    expect(layout).toContain("scanner.permission_denied");
    expect(layout).toContain("DialogID.Scanner");
    expect(layout).toContain("DialogID.CreateEntity");
    expect(layout).toContain("CollectionCreateModal");
    expect(layout).toContain("CollectionJoinModal");
    expect(layout).toContain("DialogID.JoinCollection");
    expect(selector).toContain("DialogID.CreateCollection");
    expect(selector).toContain("DialogID.JoinCollection");
    expect(layout).toContain('data-testid="logout-button"');
    expect(layout).toContain("profileDestination");
    expect(layout).toContain('variant="floating"');
    expect(layout).not.toContain("lg:hidden");
    expect(layout).toContain('role="search"');
    expect(layout).toContain("$t('menu.scanner')");
    expect(en).toContain('"scanner": "Scanner"');
    expect(en).toContain('"sign_out": "Sign Out"');
  });

  it("offsets item-edit sticky actions by the shell header height", () => {
    expect(itemEdit).toContain("top-[calc(var(--header-height-mobile)+0.25rem)]");
    expect(itemEdit).toContain("sm:top-[calc(var(--header-height)+0.25rem)]");
    expect(itemEdit).not.toContain("'top-1': preferences.displayLegacyHeader");
    expect(layout).toContain("z-20");
    expect(layout).toContain("h-[var(--header-height)]");
  });
});
