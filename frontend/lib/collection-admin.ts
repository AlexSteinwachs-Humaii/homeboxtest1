/**
 * Collection administration navigation for Glass v5.
 * Six existing sections stay on their routes. Layout math is shared with the
 * page so a tablet width wraps into two rows without shrinking targets.
 */

export const COLLECTION_ADMIN_TABS = [
  { id: "members", labelKey: "collection.tabs.members", to: "/collection/members" },
  { id: "invites", labelKey: "collection.tabs.invites", to: "/collection/invites" },
  { id: "notifiers", labelKey: "collection.tabs.notifiers", to: "/collection/notifiers" },
  { id: "settings", labelKey: "collection.tabs.settings", to: "/collection/settings" },
  { id: "entity-types", labelKey: "collection.tabs.entity_types", to: "/collection/entity-types" },
  { id: "tools", labelKey: "collection.tabs.tools", to: "/collection/tools" },
] as const;

export type CollectionAdminTabId = (typeof COLLECTION_ADMIN_TABS)[number]["id"];

/** Widths at or below these use fewer columns so labels stay visible. */
export const COLLECTION_ADMIN_NARROW_MAX = 520;
export const COLLECTION_ADMIN_COMPACT_MAX = 340;

export type CollectionDestructiveKind = "checking" | "leave" | "delete";

export function pathOnly(path: string) {
  return path.split("?")[0]?.split("#")[0] || "/";
}

/** `/collection` has no child; administration starts on Settings. */
export function shouldRedirectCollectionRoot(path: string): boolean {
  const normalized = pathOnly(path);
  return normalized === "/collection" || normalized === "/collection/";
}

export function isCollectionSettingsPath(path: string): boolean {
  const normalized = pathOnly(path);
  return normalized === "/collection/settings" || normalized.startsWith("/collection/settings/");
}

export function isCollectionAdminTabActive(tabPath: string, currentPath: string): boolean {
  const normalized = pathOnly(currentPath);
  return normalized === tabPath || normalized.startsWith(`${tabPath}/`);
}

export function collectionAdminColumns(width: number): 1 | 2 | 3 {
  if (width <= COLLECTION_ADMIN_COMPACT_MAX) {
    return 1;
  }
  if (width <= COLLECTION_ADMIN_NARROW_MAX) {
    return 2;
  }
  return 3;
}

export function collectionAdminRows(sectionCount: number, columns: number): number {
  if (columns < 1) {
    return sectionCount;
  }
  return Math.ceil(sectionCount / columns);
}

/**
 * Leave must not be the label for a deletion. Until membership is known, the
 * control stays on "checking" and stays disabled. A finished lookup that is
 * not an only-member collection is leave — including a failed lookup, which
 * still calls the leave API rather than delete.
 */
export function collectionDestructiveAction(input: {
  hasCollection: boolean;
  membershipKnown: boolean;
  isOnlyMember: boolean;
}): CollectionDestructiveKind {
  if (!input.hasCollection || !input.membershipKnown) {
    return "checking";
  }
  return input.isOnlyMember ? "delete" : "leave";
}
