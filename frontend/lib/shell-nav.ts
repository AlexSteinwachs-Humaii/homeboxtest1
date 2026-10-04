/**
 * Destinations for the Glass v5 shell.
 * Collection opens existing settings; nested item routes stay on Search,
 * and nested administration routes stay on Collection.
 */

export const SHELL_NAV_GROUPS = ["inventory", "manage"] as const;

export type ShellNavGroup = (typeof SHELL_NAV_GROUPS)[number];

export type ShellNavId = "home" | "search" | "locations" | "tags" | "templates" | "maintenance" | "collection";

export type ShellNavItem = {
  id: ShellNavId;
  to: string;
  group: ShellNavGroup;
};

export const SHELL_NAV: readonly ShellNavItem[] = [
  { id: "home", to: "/home", group: "inventory" },
  { id: "search", to: "/items", group: "inventory" },
  { id: "locations", to: "/locations", group: "inventory" },
  { id: "tags", to: "/tags", group: "inventory" },
  { id: "templates", to: "/templates", group: "manage" },
  { id: "maintenance", to: "/maintenance", group: "manage" },
  { id: "collection", to: "/collection/settings", group: "manage" },
];

export const PROFILE_HREF = "/profile";

const NESTED: Record<ShellNavId, readonly string[]> = {
  home: ["/home"],
  // Item, asset and label routes are inventory search, not Maintenance.
  search: ["/items", "/item", "/assets", "/a", "/label"],
  locations: ["/locations", "/location"],
  tags: ["/tags", "/tag"],
  templates: ["/templates", "/template"],
  maintenance: ["/maintenance"],
  collection: ["/collection"],
};

function pathOnly(path: string) {
  return path.split("?")[0]?.split("#")[0] || "/";
}

function matches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isShellNavActive(id: ShellNavId, path: string): boolean {
  const normalized = pathOnly(path);
  return NESTED[id].some(prefix => matches(normalized, prefix));
}

export function isProfileActive(path: string): boolean {
  return matches(pathOnly(path), PROFILE_HREF);
}

/** Empty or whitespace-only queries enter inventory browsing; other queries are encoded. */
export function inventorySearchHref(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "/items";
  }
  return `/items?q=${encodeURIComponent(trimmed)}`;
}

const INVENTORY_RESULTS = "/items";

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Back to Search. Accept only a same-app inventory results URL (optional query or hash).
 * Anything else — another route, a scheme, a protocol-relative path, controls, or a backslash — falls back to /items.
 */
export function inventoryResultsBackHref(back: unknown): string {
  if (typeof back !== "string" || back.length === 0 || back.length > 2048) {
    return INVENTORY_RESULTS;
  }
  if (hasControlCharacter(back) || back.includes("\\")) {
    return INVENTORY_RESULTS;
  }

  const hashAt = back.indexOf("#");
  const beforeHash = hashAt === -1 ? back : back.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  if (path !== INVENTORY_RESULTS || path.includes("//")) {
    return INVENTORY_RESULTS;
  }
  return back;
}
