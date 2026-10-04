import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_HREF, SHELL_NAV, inventorySearchHref, isProfileActive, isShellNavActive } from "../lib/shell-nav";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("shell navigation", () => {
  it("keeps the drawn destinations and sends Collection to settings", () => {
    expect(SHELL_NAV.map(item => item.id)).toEqual([
      "home",
      "search",
      "locations",
      "tags",
      "templates",
      "maintenance",
      "collection",
    ]);
    expect(SHELL_NAV.find(item => item.id === "collection")?.to).toBe("/collection/settings");
    expect(SHELL_NAV.find(item => item.id === "search")?.to).toBe("/items");
    expect(PROFILE_HREF).toBe("/profile");
  });

  it("marks item routes as Search and nested administration as Collection", () => {
    expect(isShellNavActive("home", "/home")).toBe(true);
    expect(isShellNavActive("home", "/items")).toBe(false);

    expect(isShellNavActive("search", "/items")).toBe(true);
    expect(isShellNavActive("search", "/items?q=drill")).toBe(true);
    expect(isShellNavActive("search", "/item/item-1")).toBe(true);
    expect(isShellNavActive("search", "/item/item-1/edit")).toBe(true);
    expect(isShellNavActive("search", "/item/item-1/maintenance")).toBe(true);
    expect(isShellNavActive("maintenance", "/item/item-1/maintenance")).toBe(false);
    expect(isShellNavActive("maintenance", "/maintenance")).toBe(true);

    expect(isShellNavActive("locations", "/location/garage")).toBe(true);
    expect(isShellNavActive("locations", "/location/garage/edit")).toBe(true);
    expect(isShellNavActive("tags", "/tag/tools")).toBe(true);
    expect(isShellNavActive("templates", "/template/tmpl-1")).toBe(true);

    expect(isShellNavActive("collection", "/collection/settings")).toBe(true);
    expect(isShellNavActive("collection", "/collection/members")).toBe(true);
    expect(isShellNavActive("collection", "/collection/entity-types")).toBe(true);
    expect(isShellNavActive("search", "/collection/settings")).toBe(false);
    expect(isProfileActive("/profile")).toBe(true);
    expect(isShellNavActive("home", "/profile")).toBe(false);
  });

  it("submits empty search into browsing and encodes queries", () => {
    expect(inventorySearchHref("")).toBe("/items");
    expect(inventorySearchHref("   ")).toBe("/items");
    expect(inventorySearchHref("cordless drill")).toBe("/items?q=cordless%20drill");
    expect(inventorySearchHref("a/b?c")).toBe("/items?q=a%2Fb%3Fc");
  });

  it("keeps existing dialogs, scanner permission handling and shell anchors", () => {
    const layout = read("layouts/default.vue");
    const selector = read("components/Collection/Selector.vue");
    const css = read("assets/css/main.css");

    expect(layout).toContain('variant="floating"');
    expect(layout).toContain("DialogID.Scanner");
    expect(layout).toContain("DialogID.CreateEntity");
    expect(layout).toContain("DialogID.JoinCollection");
    expect(layout).toContain("navigator.mediaDevices");
    expect(layout).toContain("scanner.permission_denied");
    expect(layout).toContain("scanner.unsupported");
    expect(layout).toContain("CollectionCreateModal");
    expect(layout).toContain("CollectionJoinModal");
    expect(layout).toContain("AppQuickMenuModal");
    expect(layout).toContain('data-testid="logout-button"');
    expect(layout).toContain('data-testid="shell-search"');
    expect(layout).toContain('data-testid="shell-scan"');
    expect(layout).toContain('href="/profile"');
    expect(layout).not.toContain("preferences.displayLegacyHeader");
    expect(layout).not.toContain("lg:hidden");
    expect(selector).toContain('to="/collection/settings"');
    expect(selector).toContain("DialogID.CreateCollection");
    expect(selector).toContain("DialogID.JoinCollection");
    expect(css).toContain("--header-height: 4rem");
    expect(css).toContain("--header-height-mobile: 4rem");
    expect(read("pages/item/[id]/index/edit.vue")).toContain("var(--header-height)");
    expect(read("pages/item/[id]/index/edit.vue")).not.toContain("displayLegacyHeader");
    expect(read("pages/location/[id]/index/edit.vue")).not.toContain("'top-1': preferences.displayLegacyHeader");
  });
});
