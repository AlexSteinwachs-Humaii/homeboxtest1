export type SearchResultPhase = "idle" | "loading" | "ready" | "empty" | "error";

export type SearchPageWindow = {
  page: number;
  pageSize: number;
  total: number;
  returned: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type SearchCriteria = {
  query: string;
  locations: string[];
  tags: string[];
  archived: boolean;
  negateTags: boolean;
  onlyWithoutPhoto: boolean;
  onlyWithPhoto: boolean;
  orderBy: string;
  fields: string[];
  pageSize: number;
  view: string;
};

function wholeNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.trunc(numeric);
}

/** Route query values arrive as strings. Pages are 1-based and never zero or negative. */
export function coercePage(value: unknown): number {
  const page = wholeNumber(value, 1);
  return page >= 1 ? page : 1;
}

function positiveSize(value: unknown): number {
  const size = wholeNumber(value, 1);
  return size >= 1 ? size : 1;
}

function nonNegative(value: unknown): number {
  const count = wholeNumber(value, 0);
  return count >= 0 ? count : 0;
}

/**
 * Range and page counts come from the API total and the rows actually returned.
 * An empty result is 0–0, never a negative range or a page fraction such as 1 of 0.
 */
export function searchPageWindow(input: {
  page: unknown;
  pageSize: unknown;
  total: unknown;
  returned: unknown;
}): SearchPageWindow {
  const pageSize = positiveSize(input.pageSize);
  const total = nonNegative(input.total);
  const returned = nonNegative(input.returned);
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
  const requested = coercePage(input.page);
  const page = pageCount === 0 ? 0 : Math.min(requested, pageCount);

  if (total === 0 || returned === 0 || page === 0) {
    return {
      page,
      pageSize,
      total,
      returned: 0,
      pageCount,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrevious: false,
      hasNext: false,
    };
  }

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(rangeStart + returned - 1, total);
  return {
    page,
    pageSize,
    total,
    returned,
    pageCount,
    rangeStart: Math.max(0, rangeStart),
    rangeEnd: Math.max(0, rangeEnd),
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

/** Clamp an out-of-range page to the last page that still has rows. Empty stays on page 1. */
export function resolveSearchPage(input: { page: unknown; pageSize: unknown; total: unknown }): {
  page: number;
  clamped: boolean;
} {
  const requested = coercePage(input.page);
  const total = nonNegative(input.total);
  if (total === 0) {
    return { page: 1, clamped: requested !== 1 };
  }
  const pageCount = Math.ceil(total / positiveSize(input.pageSize));
  const page = Math.min(requested, pageCount);
  return { page, clamped: page !== requested };
}

/** Filter, query, view and page-size changes start again at the first page. */
export function pageAfterCriteriaChange(): number {
  return 1;
}

/** Stable key so a criteria change can be told apart from a page change. */
export function searchCriteriaKey(input: SearchCriteria): string {
  return JSON.stringify({
    query: input.query,
    locations: [...input.locations].sort(),
    tags: [...input.tags].sort(),
    archived: input.archived,
    negateTags: input.negateTags,
    onlyWithoutPhoto: input.onlyWithoutPhoto,
    onlyWithPhoto: input.onlyWithPhoto,
    orderBy: input.orderBy,
    fields: [...input.fields].sort(),
    pageSize: positiveSize(input.pageSize),
    view: input.view,
  });
}
