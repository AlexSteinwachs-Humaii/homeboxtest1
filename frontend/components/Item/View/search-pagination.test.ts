import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SEARCH_CARD_PAGE_SIZE, searchResultsPageSize } from "./search-density";
import { pageAfterCriteriaChange, resolveSearchPage, searchCriteriaKey, searchPageWindow } from "./search-pagination";

const here = dirname(fileURLToPath(import.meta.url));
const itemsPage = readFileSync(resolve(here, "../../../pages/items.vue"), "utf8");
const dataTable = readFileSync(resolve(here, "table/data-table.vue"), "utf8");
const controls = readFileSync(resolve(here, "table/data-table-controls.vue"), "utf8");

describe("search page window", () => {
  test("derives a full page from the API total, not a sample size", () => {
    const window = searchPageWindow({ page: 1, pageSize: 4, total: 24, returned: 4 });
    expect(window).toMatchObject({
      page: 1,
      start: 1,
      end: 4,
      total: 24,
      pageCount: 6,
      hasPrevious: false,
      hasNext: true,
    });
    expect(window.total).not.toBe(SEARCH_CARD_PAGE_SIZE);
  });

  test("shows the actual range on a partial last page and disables next", () => {
    const window = searchPageWindow({ page: 2, pageSize: 4, total: 6, returned: 2 });
    expect(window).toMatchObject({
      page: 2,
      start: 5,
      end: 6,
      total: 6,
      pageCount: 2,
      hasPrevious: true,
      hasNext: false,
    });
  });

  test("zero results have no page fraction and no negative range", () => {
    const window = searchPageWindow({ page: 4, pageSize: 4, total: 0, returned: 0 });
    expect(window.start).toBe(0);
    expect(window.end).toBe(0);
    expect(window.end).toBeGreaterThanOrEqual(window.start);
    expect(window.pageCount).toBe(0);
    expect(window.page).toBe(1);
    expect(window.hasPrevious).toBe(false);
    expect(window.hasNext).toBe(false);
  });

  test("does not invent a range when the page size or total is unusable", () => {
    const window = searchPageWindow({ page: -2, pageSize: 0, total: Number.NaN, returned: -1 });
    expect(window.page).toBe(1);
    expect(window.pageSize).toBe(1);
    expect(window.total).toBe(0);
    expect(window.start).toBe(0);
    expect(window.end).toBe(0);
    expect(window.pageCount).toBe(0);
  });
});

describe("resolve search page", () => {
  test("re-queries an out-of-range page without discarding the API total", () => {
    const decision = resolveSearchPage({
      requestedPage: 9,
      pageSize: 4,
      total: 6,
      returned: 0,
      failed: false,
    });
    expect(decision.action).toBe("requery");
    expect(decision.page).toBe(2);
    expect(decision.total).toBe(6);

    const fromRoute = resolveSearchPage({
      requestedPage: "9" as unknown as number,
      pageSize: "4" as unknown as number,
      total: 6,
      returned: 0,
      failed: false,
    });
    expect(fromRoute.action).toBe("requery");
    expect(fromRoute.page).toBe(2);
  });

  test("clamps an empty inventory back to page 1 instead of leaving an impossible page", () => {
    const decision = resolveSearchPage({
      requestedPage: 3,
      pageSize: 4,
      total: 0,
      returned: 0,
      failed: false,
    });
    expect(decision.action).toBe("requery");
    expect(decision.page).toBe(1);
    expect(decision.total).toBe(0);
    expect(decision.phase).toBe("empty");
  });

  test("keeps a valid empty page and a valid partial page", () => {
    const empty = resolveSearchPage({
      requestedPage: 1,
      pageSize: 4,
      total: 0,
      returned: 0,
      failed: false,
    });
    expect(empty.action).toBe("show");
    expect(empty.phase).toBe("empty");
    expect(empty.window.start).toBe(0);
    expect(empty.window.end).toBe(0);

    const partial = resolveSearchPage({
      requestedPage: 2,
      pageSize: SEARCH_CARD_PAGE_SIZE,
      total: 6,
      returned: 2,
      failed: false,
    });
    expect(partial.action).toBe("show");
    expect(partial.phase).toBe("ready");
    expect(partial.window).toMatchObject({ start: 5, end: 6, pageCount: 2, hasNext: false });
  });

  test("an error does not walk the page backwards or pretend the inventory is empty", () => {
    const decision = resolveSearchPage({
      requestedPage: 3,
      pageSize: 4,
      total: 24,
      returned: 0,
      failed: true,
    });
    expect(decision.action).toBe("error");
    expect(decision.page).toBe(3);
    expect(decision.phase).toBe("error");
    expect(decision.window.pageCount).toBe(0);
  });
});

describe("criteria and preference retention", () => {
  test("filter, query, view and page-size changes reset to page 1; page-only changes do not", () => {
    const base = {
      query: "drill",
      locationIds: ["garage"],
      tagIds: ["tools"],
      includeArchived: false,
      negateTags: false,
      onlyWithoutPhoto: false,
      onlyWithPhoto: false,
      orderBy: "name",
      fields: ["color=red"],
      pageSize: 24,
      view: "table",
    };
    const key = searchCriteriaKey(base);
    expect(pageAfterCriteriaChange(3, key, key)).toBe(3);
    expect(pageAfterCriteriaChange(3, undefined, key)).toBe(3);
    expect(pageAfterCriteriaChange(3, key, searchCriteriaKey({ ...base, query: "mixer" }))).toBe(1);
    expect(pageAfterCriteriaChange(3, key, searchCriteriaKey({ ...base, pageSize: 4 }))).toBe(1);
    expect(pageAfterCriteriaChange(3, key, searchCriteriaKey({ ...base, view: "card" }))).toBe(1);
    expect(pageAfterCriteriaChange(1, key, searchCriteriaKey({ ...base, locationIds: [] }))).toBe(1);
  });

  test("compact card pages do not replace the saved table page size", () => {
    expect(searchResultsPageSize({ view: "card", compact: true, tablePageSize: 24 })).toBe(4);
    expect(searchResultsPageSize({ view: "table", compact: true, tablePageSize: 24 })).toBe(24);
    expect(itemsPage).toContain("searchCriteriaKey");
    expect(itemsPage).toContain("resolveSearchPage");
    expect(itemsPage).toContain("pageAfterCriteriaChange");
    expect(itemsPage).not.toContain("page.value = Math.max(1, page.value - 1)");
    expect(itemsPage).not.toContain("itemsPerTablePage = 4");
    expect(itemsPage).toContain("lock-page-size");
  });
});

describe("search pagination markup", () => {
  test("search controls use the API window and keep table controls as the default", () => {
    expect(controls).toContain("searchPageWindow");
    expect(controls).toContain('data-testid="search-pagination"');
    expect(controls).toContain('data-testid="search-page-prev"');
    expect(controls).toContain('data-testid="search-page-next"');
    expect(controls).toContain('data-testid="search-range"');
    expect(controls).toContain('data-testid="search-page-status"');
    expect(controls).toContain("hasPrevious");
    expect(controls).toContain("hasNext");
    expect(controls).toContain("pageCount > 0");
    expect(controls).toContain("resetRowSelection()");
    expect(controls).toContain("PaginationFirst");
  });

  test("external page changes reset page-local selection and card mode does not write the table size", () => {
    expect(dataTable).toContain("props.externalPagination?.page");
    expect(dataTable).toContain("table.resetRowSelection()");
    expect(dataTable).toContain("preferences.value.itemsPerTablePage = newSize");
    expect(dataTable).toContain("lockPageSize");
    expect(dataTable).toContain('data-testid="search-page-size-locked"');
    expect(dataTable).not.toContain("itemsPerTablePage = 4");
    expect(dataTable).not.toContain("pagination.pageSize = props.externalPagination");
  });
});
