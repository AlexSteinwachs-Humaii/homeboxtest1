import type { ViewType } from "~~/composables/use-preferences";

/** iPad portrait (834) and other tablets below the lg breakpoint. */
export const SEARCH_COMPACT_MAX_WIDTH = 1023;
export const SEARCH_COMPACT_QUERY = `(max-width: ${SEARCH_COMPACT_MAX_WIDTH}px)`;

/** Four records is the Search card density at the reference viewport, not a table preference. */
export const SEARCH_CARD_PAGE_SIZE = 4;

export function isCompactSearchViewport(matches?: boolean): boolean {
  if (typeof matches === "boolean") {
    return matches;
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(SEARCH_COMPACT_QUERY).matches;
}

/**
 * Compact Card view requests four records. Table view, and Card on a wide viewport,
 * keep the saved table page size. This never writes that preference.
 */
export function searchResultsPageSize(input: { view: ViewType; compact: boolean; tablePageSize: number }): number {
  if (input.view === "card" && input.compact) {
    return SEARCH_CARD_PAGE_SIZE;
  }
  if (Number.isFinite(input.tablePageSize) && input.tablePageSize > 0) {
    return Math.trunc(input.tablePageSize);
  }
  return 12;
}
