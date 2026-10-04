import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { presentSearchCard } from "./search-card";
import { SEARCH_CARD_PAGE_SIZE, readCompactSearch, searchResultsPageSize } from "./search-density";
import { entityRowId, pruneRowSelection, sameSelection } from "./table/row-selection";

const here = dirname(fileURLToPath(import.meta.url));
const card = readFileSync(resolve(here, "../Card.vue"), "utf8");
const cardView = readFileSync(resolve(here, "table/card-view.vue"), "utf8");
const dataTable = readFileSync(resolve(here, "table/data-table.vue"), "utf8");
const controls = readFileSync(resolve(here, "table/data-table-controls.vue"), "utf8");
const selectable = readFileSync(resolve(here, "Selectable.vue"), "utf8");
const itemsPage = readFileSync(resolve(here, "../../../pages/items.vue"), "utf8");

function searchBranch(source: string): string {
  const start = source.indexOf("variant === 'search'");
  const end = source.indexOf("<Card v-else", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("search result card fields", () => {
  test("uses the record name, asset id, quantity, insurance, location and price", () => {
    const view = presentSearchCard({
      id: "item-42",
      name: "  Cordless drill  ",
      assetId: "000-042",
      quantity: 1,
      insured: true,
      purchasePrice: 129,
      parent: { id: "loc", name: "Garage" } as never,
      thumbnailId: "thumb-1",
    });

    expect(view.href).toBe("/item/item-42");
    expect(view.name).toBe("Cordless drill");
    expect(view.assetId).toBe("000-042");
    expect(view.quantity).toBe(1);
    expect(view.insured).toBe(true);
    expect(view.location).toBe("Garage");
    expect(view.purchasePrice).toBe(129);
    expect(view.photoPath).toBe("/entities/item-42/attachments/thumb-1");
  });

  test("keeps an explicit uninsured state and the neutral no-photo path", () => {
    const view = presentSearchCard({
      id: "item-43",
      name: "Toolbox",
      assetId: "000-000",
      quantity: 2,
      insured: false,
      purchasePrice: 45,
      location: { id: "loc", name: "Garage" } as never,
    });

    expect(view.insured).toBe(false);
    expect(view.assetId).toBeNull();
    expect(view.photoPath).toBeNull();
    expect(view.location).toBe("Garage");
  });
});

describe("search card page size", () => {
  test("requests four records in compact card view without replacing the table size", () => {
    expect(SEARCH_CARD_PAGE_SIZE).toBe(4);
    expect(searchResultsPageSize({ view: "card", compact: true, tablePageSize: 24 })).toBe(4);
    expect(searchResultsPageSize({ view: "table", compact: true, tablePageSize: 24 })).toBe(24);
    expect(searchResultsPageSize({ view: "card", compact: false, tablePageSize: 48 })).toBe(48);
    expect(readCompactSearch(query => ({ matches: query.includes("1023") }))).toBe(true);
    expect(readCompactSearch()).toBe(false);
  });
});

describe("search selection identity", () => {
  test("keeps selection on the record id and drops rows that left the result set", () => {
    expect(entityRowId({ id: "item-42" }, 0)).toBe("item-42");
    expect(entityRowId({ id: "  " }, 3)).toBe("row-3");

    const pruned = pruneRowSelection({ "item-42": true, "item-99": true, "0": true }, ["item-42", "item-7"]);
    expect(pruned).toEqual({ "item-42": true });
    expect(sameSelection(pruned, { "item-42": true })).toBe(true);
    expect(sameSelection(pruned, { "item-42": true, "item-7": true })).toBe(false);
  });
});

describe("search card markup", () => {
  test("keeps a 48px selection strip outside the item link", () => {
    const branch = searchBranch(card);
    const strip = branch.indexOf("search-card-strip");
    const select = branch.indexOf("search-card-select-");
    const link = branch.indexOf("<NuxtLink");
    expect(strip).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(strip);
    expect(link).toBeGreaterThan(select);
    expect(branch.match(/<NuxtLink/g)).toHaveLength(1);
    expect(branch).toContain("h-[48px]");
    expect(branch).toContain("min-h-[48px]");
    expect(branch).toContain("min-w-[48px]");
    expect(branch).toContain("onSearchSelect");
    expect(branch).toContain("@click.stop");
    expect(branch).toContain("@keydown.enter.stop");
    expect(branch).toContain("@keydown.space.stop");
    expect(branch).toContain("searchView.href");
    expect(branch).toContain("search-card-insured");
    expect(branch).toContain("search-card-quantity");
    expect(branch).toContain("search-card-location");
    expect(branch).toContain("search-card-value");
    expect(branch).toContain("search-card-asset");
    expect(branch).toContain("searchPhoto");
    expect(branch).toContain('d="M3 16l5-4 4 3 3-2 6 5"');
    expect(card).toContain("api.authURL(searchView.value.photoPath)");
    expect(branch).toContain("home.recent_no_photo");
    expect(branch).not.toContain("no-image.jpg");
    expect(branch).not.toContain("TagChip");
    expect(branch).not.toContain("Tooltip");
    expect(branch).not.toContain("/location/");
    expect(branch).not.toContain("toggleSelected()");
  });

  test("opts Search into two columns and leaves quick actions gating alone", () => {
    expect(cardView).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(cardView).toContain('presentation === "search"');
    expect(cardView).toContain("? 'search' : 'default'");
    expect(cardView).toContain("preferences.quickActions.enabled ? item : undefined");
    expect(cardView).toContain("toggleAllPageRowsSelected");
    expect(cardView).toContain("DropdownAction");
    expect(cardView).toContain("selectedCount");
    expect(selectable).toContain("preferences.quickActions.enabled ? columns");
    expect(dataTable).toContain("entityRowId");
    expect(dataTable).toContain("pruneRowSelection");
    expect(dataTable).toContain("preferences.value.itemsPerTablePage = newSize");
    expect(controls).toContain("resetRowSelection()");
    expect(itemsPage).toContain("searchResultsPageSize");
    expect(itemsPage).not.toContain("itemsPerTablePage = 4");
    expect(itemsPage).not.toContain("quickActions.enabled = true");
  });
});
