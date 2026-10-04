import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { effectScope } from "vue";
import { describe, expect, it } from "vitest";
import { registerInventorySearch, submitMountedInventorySearch } from "./use-inventory-search";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("inventory search coordination", () => {
  it("hands a shell query to the mounted Search page and releases it on unmount", () => {
    const seen: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      registerInventorySearch(query => {
        seen.push(query);
      });
    });

    expect(submitMountedInventorySearch("cordless drill")).toBe(true);
    expect(submitMountedInventorySearch("#000-042")).toBe(true);
    expect(seen).toEqual(["cordless drill", "#000-042"]);

    scope.stop();
    expect(submitMountedInventorySearch("later")).toBe(false);
  });

  it("keeps shell navigation as the fallback and does not invent a tips route", () => {
    const layout = read("layouts/default.vue");
    const page = read("pages/items.vue");
    const selectable = read("components/Item/View/Selectable.vue");

    expect(layout).toContain("submitMountedInventorySearch");
    expect(layout).toContain("inventorySearchHref");
    expect(page).toContain("registerInventorySearch");
    expect(page).toContain('presentation="search"');
    expect(page).toContain("DialogID.CreateEntity");
    expect(page).toContain('baseType: "item"');
    expect(page).toContain("items.tips");
    expect(page).toContain("items.tip_1");
    expect(page).not.toContain('to="/tips"');
    expect(page).not.toContain("itemsPerTablePage =");
    expect(page).toContain("itemDisplayView");
    expect(page).toContain("fieldSelector");
    expect(page).toContain("onlyWithoutPhoto");
    expect(page).toContain('data-testid="search-empty"');
    expect(page).toContain('data-testid="search-error"');
    expect(page).toContain('data-testid="search-retry"');
    expect(page).toContain("items.search_loading");
    expect(page).toContain('data-testid="search-view-card"');
    expect(page).toContain('data-testid="search-view-table"');
    expect(selectable).toContain('id="selectable-subtitle"');
    expect(selectable).toContain("presentation");
  });
});
