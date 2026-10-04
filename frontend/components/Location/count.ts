/**
 * Direct-child quantity as returned on a location list row.
 * A missing field is not a count: the location API omits zero (`itemCount,omitempty`),
 * and nested location cards never load a count at all. Callers that asked for the
 * list decide whether absence means zero. An explicit 0 is a real empty location.
 */
export function explicitItemCount(location: object | null | undefined): number | null {
  if (!location || typeof location !== "object") {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(location, "itemCount")) {
    return null;
  }
  const value = (location as { itemCount?: unknown }).itemCount;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}
