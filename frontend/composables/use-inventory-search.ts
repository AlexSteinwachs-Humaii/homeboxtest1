import { onScopeDispose } from "vue";

type InventorySearchSubmit = (query: string) => void;

let activeSubmit: InventorySearchSubmit | null = null;

/**
 * While Search is mounted, the shell header submits into the page's query
 * pipeline so location, tag and options filters stay on the route.
 * Unmounting releases the handler and the shell navigates again.
 */
export function registerInventorySearch(submit: InventorySearchSubmit) {
  activeSubmit = submit;
  onScopeDispose(() => {
    if (activeSubmit === submit) {
      activeSubmit = null;
    }
  });
}

/** Returns true when the mounted Search page accepted the query. */
export function submitMountedInventorySearch(query: string): boolean {
  if (!activeSubmit) {
    return false;
  }
  activeSubmit(query);
  return true;
}
