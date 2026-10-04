/** Four records fill the 834×1112 Card reference: two columns, two rows. */
export const SEARCH_CARD_PAGE_SIZE = 4;

/**
 * Portrait iPad (834) is below the lg breakpoint. Wider viewports keep the
 * saved table page size so Card density here does not rewrite that preference.
 */
export const SEARCH_CARD_COMPACT_QUERY = "(max-width: 1023px)";

export function readCompactSearch(matchMedia?: (query: string) => { matches: boolean } | null): boolean {
  if (!matchMedia) {
    return false;
  }
  return matchMedia(SEARCH_CARD_COMPACT_QUERY)?.matches === true;
}

/**
 * Search Card at the reference width requests four records. Table view, and
 * Card on a wide viewport, keep the saved table page size. This never writes
 * the preference.
 */
export function searchResultsPageSize(input: {
  view: "card" | "table";
  compact: boolean;
  tablePageSize: number;
}): number {
  const saved = Number.isFinite(input.tablePageSize) && input.tablePageSize > 0 ? input.tablePageSize : 12;
  if (input.view === "card" && input.compact) {
    return SEARCH_CARD_PAGE_SIZE;
  }
  return saved;
}
