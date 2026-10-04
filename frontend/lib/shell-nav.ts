/**
 * Destinations for the Glass v5 shell. Active matching includes nested item
 * and collection-administration routes without treating "/items" as "/item".
 */
export const shellNav = [
  { id: "home", to: "/home", group: "inventory", active: ["/home"] },
  { id: "search", to: "/items", group: "inventory", active: ["/items", "/item"] },
  { id: "locations", to: "/locations", group: "inventory", active: ["/locations", "/location"] },
  { id: "tags", to: "/tags", group: "inventory", active: ["/tags", "/tag"] },
  { id: "templates", to: "/templates", group: "manage", active: ["/templates", "/template"] },
  { id: "maintenance", to: "/maintenance", group: "manage", active: ["/maintenance"] },
  { id: "collection", to: "/collection/settings", group: "manage", active: ["/collection"] },
] as const;

export type ShellNavId = (typeof shellNav)[number]["id"];

export const profileDestination = "/profile";

export function pathMatches(path: string, bases: readonly string[]): boolean {
  const normalized = path.split("?")[0]?.split("#")[0] ?? path;
  return bases.some(base => normalized === base || normalized.startsWith(`${base}/`));
}

export function activeShellNav(path: string): ShellNavId | null {
  return shellNav.find(item => pathMatches(path, item.active))?.id ?? null;
}

export function profileActive(path: string): boolean {
  return pathMatches(path, [profileDestination]);
}

/** Empty search enters inventory browsing; a query uses the existing items search. */
export function inventorySearchHref(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "/items";
  }
  return `/items?q=${encodeURIComponent(trimmed)}`;
}
