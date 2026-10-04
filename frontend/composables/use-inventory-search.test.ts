import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registerInventorySearch, submitInventorySearch } from "./use-inventory-search";

const here = dirname(fileURLToPath(import.meta.url));

describe("inventory search coordination", () => {
  it("delivers a trimmed query to the mounted Search page and does not navigate", () => {
    const seen: string[] = [];
    const stop = registerInventorySearch(query => {
      seen.push(query);
    });

    expect(submitInventorySearch("  #000-042  ")).toBe(true);
    expect(seen).toEqual(["#000-042"]);

    stop();
    expect(submitInventorySearch("drill")).toBe(false);
  });

  it("lets the shell fall back to navigation only when Search is not mounted", () => {
    const layout = readFileSync(resolve(here, "../layouts/default.vue"), "utf8");
    const page = readFileSync(resolve(here, "../pages/items.vue"), "utf8");
    expect(layout).toContain("submitInventorySearch(raw)");
    expect(layout).toContain("inventorySearchHref(raw)");
    expect(page).toContain("registerInventorySearch");
    expect(page).toContain('presentation="search"');
    expect(page).toContain("DialogID.CreateEntity");
    expect(page).toContain("items.tips_sub");
  });
});
