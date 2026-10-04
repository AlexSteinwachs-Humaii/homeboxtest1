import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  coercePage,
  pageAfterCriteriaChange,
  resolveSearchPage,
  searchCriteriaKey,
  searchPageWindow,
  type SearchCriteria,
} from "./search-pagination";

const root = resolve(__dirname, "../../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function criteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    query: "",
    locations: [],
    tags: [],
    archived: false,
    negateTags: false,
    onlyWithoutPhoto: false,
    onlyWithPhoto: false,
    orderBy: "name",
    fields: [],
    pageSize: 4,
    view: "card",
    ...overrides,
  };
}

describe("search page window", () => {
  test("derives an inclusive range from the API total, not a sample count", () => {
    expect(searchPageWindow({ page: 1, pageSize: 4, total: 6, returned: 4 })).toEqual({
      page: 1,
      pageSize: 4,
      total: 6,
      returned: 4,
      pageCount: 2,
      rangeStart: 1,
      rangeEnd: 4,
      hasPrevious: false,
      hasNext: true,
    });
  });

  test("shows the actual range on a partial last page and disables next", () => {
    expect(searchPageWindow({ page: "2", pageSize: "4", total: "6", returned: 2 })).toMatchObject({
      page: 2,
      pageCount: 2,
      rangeStart: 5,
      rangeEnd: 6,
      hasPrevious: true,
      hasNext: false,
    });
  });

  test("uses a non-negative empty range and no page fraction when nothing matches", () => {
    const empty = searchPageWindow({ page: 4, pageSize: 4, total: 0, returned: 0 });
    expect(empty.rangeStart).toBe(0);
    expect(empty.rangeEnd).toBe(0);
    expect(empty.pageCount).toBe(0);
    expect(empty.page).toBe(0);
    expect(empty.hasPrevious).toBe(false);
    expect(empty.hasNext).toBe(false);
    expect(empty.rangeStart).toBeGreaterThanOrEqual(0);
    expect(empty.rangeEnd).toBeGreaterThanOrEqual(empty.rangeStart);
  });

  test("does not invent a negative range from bad totals", () => {
    const window = searchPageWindow({ page: -3, pageSize: 0, total: -8, returned: -1 });
    expect(window.rangeStart).toBe(0);
    expect(window.rangeEnd).toBe(0);
    expect(window.pageSize).toBe(1);
    expect(window.total).toBe(0);
  });
});

describe("search page resolution", () => {
  test("coerces route page strings and clamps an impossible page to the last real page", () => {
    expect(coercePage("999")).toBe(999);
    expect(coercePage("0")).toBe(1);
    expect(coercePage("nope")).toBe(1);
    expect(coercePage(2.8)).toBe(2);
    expect(resolveSearchPage({ page: "999", pageSize: 4, total: 6 })).toEqual({ page: 2, clamped: true });
    expect(resolveSearchPage({ page: 2, pageSize: 4, total: 6 })).toEqual({ page: 2, clamped: false });
  });

  test("keeps an empty result on page 1 instead of a zero-total last page", () => {
    expect(resolveSearchPage({ page: 999, pageSize: 4, total: 0 })).toEqual({ page: 1, clamped: true });
    expect(resolveSearchPage({ page: 1, pageSize: 4, total: 0 })).toEqual({ page: 1, clamped: false });
  });

  test("resets criteria changes to page 1 and ignores key order", () => {
    expect(pageAfterCriteriaChange()).toBe(1);
    const left = searchCriteriaKey(criteria({ locations: ["b", "a"], tags: ["t2", "t1"], query: "drill" }));
    const right = searchCriteriaKey(criteria({ locations: ["a", "b"], tags: ["t1", "t2"], query: "drill" }));
    expect(left).toBe(right);
    expect(searchCriteriaKey(criteria({ view: "table", pageSize: 24 }))).not.toBe(left);
    expect(searchCriteriaKey(criteria({ query: "mixer" }))).not.toBe(left);
  });
});

describe("search pagination wiring", () => {
  test("requests four compact cards without writing the table page size, and clamps without walking backwards", () => {
    const page = read("pages/items.vue");
    const search = page.slice(page.indexOf("async function search"), page.indexOf("const displayPhase"));

    expect(page).toContain("searchResultsPageSize");
    expect(page).toContain("searchCriteriaKey");
    expect(page).toContain("pageAfterCriteriaChange");
    expect(page).toContain("resolveSearchPage");
    expect(page).toContain("coercePage");
    expect(page).toContain("lock-page-size");
    expect(page).toContain("result-phase");
    expect(page).not.toContain("itemsPerTablePage =");
    expect(search).toContain("total.value = apiTotal");
    expect(search).not.toContain("page.value - 1");
    expect(search).not.toContain("page.value--");
    expect(search).not.toContain("total.value = 0");
  });

  test("keeps Search paging on the API window and restores the lower pager for other card lists", () => {
    const table = read("components/Item/View/table/data-table.vue");
    const controls = read("components/Item/View/table/data-table-controls.vue");
    const selectable = read("components/Item/View/Selectable.vue");

    expect(table).toContain("lockPageSize");
    expect(table).toContain("items.search_page_size_locked");
    expect(table).toContain("presentation !== 'search'");
    expect(table).toContain("rowSelection.value = {}");
    expect(table.match(/<DataTableControls/g)?.length).toBe(4);
    expect(table).not.toContain("SEARCH_CARD_PAGE_SIZE");

    expect(controls).toContain("searchPageWindow");
    expect(controls).toContain('data-testid="search-range"');
    expect(controls).toContain('data-testid="search-prev"');
    expect(controls).toContain('data-testid="search-next"');
    expect(controls).toContain('data-testid="search-page-status"');
    expect(controls).toContain("resetRowSelection");
    expect(selectable).toContain("lockPageSize");
    expect(selectable).toContain("resultPhase");
  });
});
