import { getCurrentScope, onScopeDispose } from "vue";

/**
 * One inventory search pipeline.
 * The shell header and the Search page both submit through this handler when
 * Search is mounted, so a header search updates the same query ref and
 * route-backed filters instead of navigating to a q-only URL.
 */
type InventorySearchHandler = (query: string) => void;

let handler: InventorySearchHandler | null = null;

export function registerInventorySearch(fn: InventorySearchHandler): () => void {
  handler = fn;
  const stop = () => {
    if (handler === fn) {
      handler = null;
    }
  };
  if (getCurrentScope()) {
    onScopeDispose(stop);
  }
  return stop;
}

/** Returns true when Search handled the query. False means the caller should navigate. */
export function submitInventorySearch(raw: string): boolean {
  if (!handler) {
    return false;
  }
  handler(raw.trim());
  return true;
}
