import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import { formatCollectionValue } from "~~/pages/home/overview";
import { presentSearchCard } from "./search-card";
import { SEARCH_CARD_PAGE_SIZE, searchResultsPageSize } from "./search-density";
import { entityRowId, pruneRowSelection } from "./table/row-selection";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function item(overrides: Partial<EntitySummary> = {}): EntitySummary {
  return {
    id: "item-1",
    name: "Cordless drill",
    assetId: "000-042",
    quantity: 1,
    purchasePrice: 129,
    createdAt: "2026-03-02T12:00:00Z",
    updatedAt: "2026-03-02T12:00:00Z",
    archived: false,
    description: "Stored in the case",
    insured: true,
    itemCount: 0,
    soldDate: "0001-01-01T00:00:00Z",
    tags: [{ id: "tag-1", name: "Tools" } as EntitySummary["tags"][number]],
    parent: { id: "loc-1", name: "Garage" } as EntitySummary,
    imageId: "photo-1",
    thumbnailId: "thumb-1",
    ...overrides,
  };
}

function searchBranch(source: string) {
  const start = source.indexOf("variant === 'search'");
  const end = source.indexOf("variant !== 'search'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("presentSearchCard", () => {
  test("keeps real identifying fields and an explicit insurance state", () => {
    const card = presentSearchCard(item());

    expect(card).toMatchObject({
      id: "item-1",
      href: "/item/item-1",
      name: "Cordless drill",
      assetId: "000-042",
      quantity: 1,
      insured: true,
      location: "Garage",
      purchasePrice: 129,
      photo: { kind: "upload", path: "/entities/item-1/attachments/thumb-1" },
    });
  });

  test("states not insured, drops a blank asset id, and uses the no-photo fallback", () => {
    const card = presentSearchCard(
      item({
        insured: false,
        assetId: "000-000",
        name: "  ",
        quantity: 0,
        purchasePrice: 0,
        parent: { id: "loc", name: "  Kitchen  " } as EntitySummary,
        imageId: null,
        thumbnailId: "  ",
      })
    );

    expect(card?.insured).toBe(false);
    expect(card?.assetId).toBeNull();
    expect(card?.name).toBe("");
    expect(card?.quantity).toBe(0);
    expect(card?.purchasePrice).toBe(0);
    expect(card?.location).toBe("Kitchen");
    expect(card?.photo).toEqual({ kind: "none" });
    expect(formatCollectionValue(card?.purchasePrice ?? Number.NaN, "eur", "en-US")).toContain("€");
  });

  test("does not invent a card for a record without an id", () => {
    expect(presentSearchCard(item({ id: "  " }))).toBeNull();
  });
});

describe("search card density", () => {
  test("requests four records only for compact card view", () => {
    expect(searchResultsPageSize({ view: "card", compact: true, tablePageSize: 24 })).toBe(SEARCH_CARD_PAGE_SIZE);
    expect(searchResultsPageSize({ view: "card", compact: false, tablePageSize: 24 })).toBe(24);
    expect(searchResultsPageSize({ view: "table", compact: true, tablePageSize: 24 })).toBe(24);
    expect(searchResultsPageSize({ view: "card", compact: false, tablePageSize: 0 })).toBe(12);
  });
});

describe("row selection identity", () => {
  test("keeps entity ids and drops selection that no longer matches the page", () => {
    expect(entityRowId({ id: "item-9" }, 0)).toBe("item-9");
    expect(entityRowId({ id: "  " }, 2)).toBe("index:2");

    expect(pruneRowSelection({ "item-1": true, "item-2": true, "item-9": true }, ["item-2", "item-3"])).toEqual({
      "item-2": true,
    });
  });
});

describe("search card markup", () => {
  test("keeps the 48px selection strip outside the item link", () => {
    const card = read("components/Item/Card.vue");
    const branch = searchBranch(card);
    const linkAt = branch.indexOf("<NuxtLink");
    const stripAt = branch.indexOf('data-testid="search-selection-strip"');

    expect(stripAt).toBeGreaterThan(-1);
    expect(linkAt).toBeGreaterThan(stripAt);
    expect(branch).toContain("h-12");
    expect(branch).toContain("size-12");
    expect(branch).toContain('data-testid="search-card-select"');
    expect(branch).toContain("items.search_card_select");
    expect(branch).toContain("items.search_card_insured");
    expect(branch).toContain("items.search_card_not_insured");
    expect(branch).toContain("items.search_card_quantity");
    expect(branch).toContain('data-testid="search-card-no-photo"');
    expect(branch).toContain("home.no_photo");
    expect(branch).toContain("<Currency");
    expect(branch).toContain("searchPhoto");

    const link = branch.slice(linkAt + "<NuxtLink".length);
    expect(link).not.toContain("<Checkbox");
    expect(link).not.toContain("Tooltip");
    expect(link).not.toContain("TagChip");
    expect(link).not.toContain("<NuxtLink");
    expect(link).not.toContain("/location/");
    expect(link).not.toContain("toggleSelected");
  });

  test("uses two columns on Search without overriding quick actions or table page size", () => {
    const view = read("components/Item/View/table/card-view.vue");
    const page = read("pages/items.vue");
    const table = read("components/Item/View/table/data-table.vue");
    const controls = read("components/Item/View/table/data-table-controls.vue");

    expect(view).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(view).toContain("presentation === 'search' ? 'search' : 'default'");
    expect(view).toContain("preferences.quickActions.enabled ? item : undefined");
    expect(view).toContain("toggleAllPageRowsSelected");
    expect(view).toContain("DropdownAction");
    expect(view).not.toContain("quickActions.enabled = true");

    expect(page).toContain("searchResultsPageSize");
    expect(page).toContain("itemsPerTablePage");
    expect(page).not.toContain("itemsPerTablePage =");

    expect(table).toContain("getRowId:");
    expect(table).toContain("pruneRowSelection");
    expect(controls).toContain("resetRowSelection");
  });
});
