/** Stable row identity. Index keys would point at a different record after a result replacement. */
export function entityRowId(row: { id?: string | null }, index: number): string {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  return id || `row-${index}`;
}

/** Drop selection that no longer refers to a row in the current result set. */
export function pruneRowSelection(selection: Record<string, boolean>, ids: readonly string[]): Record<string, boolean> {
  const present = new Set(ids);
  const next: Record<string, boolean> = {};
  for (const [id, selected] of Object.entries(selection)) {
    if (selected && present.has(id)) {
      next[id] = true;
    }
  }
  return next;
}

export function sameSelection(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every(key => right[key] === true);
}
