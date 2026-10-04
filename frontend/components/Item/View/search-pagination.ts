/**
 * Search paging is server-side. Ranges and page counts come from the API total
 * and the records actually returned, never from a sample inventory size.
 */

export type SearchPageWindow = {
  /** Clamped 1-based page. Always 1 when there are no results. */
  page: number;
  pageSize: number;
  total: number;
  /** 1-based inclusive start. 0 when this page has no rows to show. */
  start: number;
  /** Inclusive end. 0 when this page has no rows, so the range is never negative. */
  end: number;
  /** 0 when there are no results — never "page 1 of 0". */
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type SearchPageAction = "show" | "requery" | "error";

export type SearchPageDecision = {
  action: SearchPageAction;
  /** Page to keep or request next. Unchanged on error so a failure cannot walk backwards. */
  page: number;
  /** API total. 0 only when the API reported no matches, not because the page was empty. */
  total: number;
  phase: "ready" | "empty" | "error";
  window: SearchPageWindow;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizePage(page: unknown): number {
  const value = asFiniteNumber(page);
  if (value === null || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export function normalizePageSize(pageSize: unknown): number {
  const value = asFiniteNumber(pageSize);
  if (value === null || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export function normalizeTotal(total: number | null | undefined): number {
  if (typeof total !== "number" || !Number.isFinite(total) || total < 1) {
    return 0;
  }
  return Math.floor(total);
}

export function searchPageCount(total: number, pageSize: number): number {
  const count = normalizeTotal(total);
  if (count === 0) {
    return 0;
  }
  return Math.ceil(count / normalizePageSize(pageSize));
}

/** A page the API can actually serve. Empty inventories stay on page 1. */
export function clampSearchPage(page: unknown, total: number, pageSize: number): number {
  const pageCount = searchPageCount(total, pageSize);
  const requested = normalizePage(page);
  if (pageCount === 0) {
    return 1;
  }
  return Math.min(requested, pageCount);
}

export function searchPageWindow(input: {
  page: number;
  pageSize: number;
  total: number;
  /** Rows on this page. Omit to describe the page bounds without claiming rows arrived. */
  returned?: number;
}): SearchPageWindow {
  const pageSize = normalizePageSize(input.pageSize);
  const total = normalizeTotal(input.total);
  const pageCount = searchPageCount(total, pageSize);
  const page = clampSearchPage(input.page, total, pageSize);
  const returned =
    typeof input.returned === "number" && Number.isFinite(input.returned) && input.returned > 0
      ? Math.floor(input.returned)
      : 0;
  const hasPrevious = pageCount > 0 && page > 1;
  const hasNext = pageCount > 0 && page < pageCount;

  if (total === 0 || returned === 0) {
    return { page, pageSize, total, start: 0, end: 0, pageCount, hasPrevious, hasNext };
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(start + returned - 1, total);
  if (end < start) {
    return { page, pageSize, total, start: 0, end: 0, pageCount, hasPrevious, hasNext };
  }
  return { page, pageSize, total, start, end, pageCount, hasPrevious, hasNext };
}

/**
 * Decide what a Search response means. An out-of-range page is re-queried at the
 * last valid page and keeps the API total. A hard failure does not decrement the
 * page or invent a zero total.
 */
export function resolveSearchPage(input: {
  requestedPage: number;
  pageSize: number;
  total: number | null | undefined;
  returned: number;
  failed: boolean;
}): SearchPageDecision {
  const pageSize = normalizePageSize(input.pageSize);
  if (input.failed) {
    return {
      action: "error",
      page: normalizePage(input.requestedPage),
      total: normalizeTotal(input.total),
      phase: "error",
      window: searchPageWindow({ page: 1, pageSize, total: 0, returned: 0 }),
    };
  }

  const total = normalizeTotal(input.total);
  const page = clampSearchPage(input.requestedPage, total, pageSize);
  const requested = normalizePage(input.requestedPage);
  const window = searchPageWindow({
    page,
    pageSize,
    total,
    returned: input.returned,
  });

  if (requested !== page) {
    return { action: "requery", page, total, phase: total === 0 ? "empty" : "ready", window };
  }

  return {
    action: "show",
    page,
    total,
    phase: input.returned > 0 ? "ready" : "empty",
    window,
  };
}

/** Filter, query, view and page-size changes start again at page 1. A page-only change does not. */
export function pageAfterCriteriaChange(page: unknown, previousKey: string | undefined, nextKey: string): number {
  if (previousKey === undefined || previousKey === nextKey) {
    return normalizePage(page);
  }
  return 1;
}

export function searchCriteriaKey(input: {
  query: string;
  locationIds: readonly string[];
  tagIds: readonly string[];
  includeArchived: boolean;
  negateTags: boolean;
  onlyWithoutPhoto: boolean;
  onlyWithPhoto: boolean;
  orderBy: string;
  fields: readonly string[];
  pageSize: number;
  view: string;
}): string {
  return JSON.stringify({
    query: input.query,
    locationIds: [...input.locationIds].sort(),
    tagIds: [...input.tagIds].sort(),
    includeArchived: input.includeArchived,
    negateTags: input.negateTags,
    onlyWithoutPhoto: input.onlyWithoutPhoto,
    onlyWithPhoto: input.onlyWithPhoto,
    orderBy: input.orderBy,
    fields: [...input.fields].sort(),
    pageSize: input.pageSize,
    view: input.view,
  });
}
