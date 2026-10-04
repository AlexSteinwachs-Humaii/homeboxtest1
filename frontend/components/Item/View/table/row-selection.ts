/** Stable row identity so a selected index cannot point at a different record after results change. */
export function entityRowId(row: { id?: string | null }, index: number): string {
  const id = row.id?.trim();
  if (id) {
    return id;
  }
  return `index:${index}`;
}

export function sameRowSelection(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  const leftKeys = Object.keys(left).filter(key => left[key]);
  const rightKeys = Object.keys(right).filter(key => right[key]);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(key => right[key] === true);
}

/** Drop selection for records that are no longer in the current result set. */
export function pruneRowSelection(selection: Record<string, boolean>, ids: Iterable<string>): Record<string, boolean> {
  const allowed = new Set(ids);
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(selection)) {
    if (value && allowed.has(key)) {
      next[key] = true;
    }
  }
  return next;
}
