/**
 * Collection administration navigation.
 * Six existing sections stay on their routes. At the 834px tablet width they
 * wrap into two rows of three; narrower viewports drop a column rather than
 * shrinking the controls or clipping their labels.
 */

export const collectionAdminTabs = [
  { id: "members", label: "collection.tabs.members", to: "/collection/members" },
  { id: "invites", label: "collection.tabs.invites", to: "/collection/invites" },
  { id: "notifiers", label: "collection.tabs.notifiers", to: "/collection/notifiers" },
  { id: "settings", label: "collection.tabs.settings", to: "/collection/settings" },
  { id: "entity-types", label: "collection.tabs.entity_types", to: "/collection/entity-types" },
  { id: "tools", label: "collection.tabs.tools", to: "/collection/tools" },
] as const;

export type CollectionAdminTabId = (typeof collectionAdminTabs)[number]["id"];

/** Viewports at or below this width use two columns. */
export const COLLECTION_ADMIN_TWO_COLUMN_MAX = 520;

/** Viewports at or below this width use one column. */
export const COLLECTION_ADMIN_ONE_COLUMN_MAX = 340;

export function collectionAdminColumns(viewportWidth: number): 1 | 2 | 3 {
  if (!Number.isFinite(viewportWidth)) return 3;
  if (viewportWidth <= COLLECTION_ADMIN_ONE_COLUMN_MAX) return 1;
  if (viewportWidth <= COLLECTION_ADMIN_TWO_COLUMN_MAX) return 2;
  return 3;
}

export function collectionAdminRows(tabCount: number, columns: number): number {
  const safeColumns = Math.max(1, columns);
  return Math.ceil(Math.max(0, tabCount) / safeColumns);
}

export function normalizeAdminPath(path: string): string {
  const withoutHash = path.split("#")[0] ?? path;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

export function activeCollectionAdminTab(path: string): CollectionAdminTabId | null {
  const normalized = normalizeAdminPath(path);
  const match = collectionAdminTabs.find(tab => normalized === tab.to || normalized.startsWith(`${tab.to}/`));
  return match?.id ?? null;
}

/**
 * Leave and delete stay distinct. Membership is unknown while members are
 * loading, so the control must not say "Leave" and then turn out to delete.
 */
export function collectionDestructiveAction(input: {
  hasCollection: boolean;
  membersLoading: boolean;
  isOnlyMember: boolean;
}): "pending" | "leave" | "delete" {
  if (!input.hasCollection || input.membersLoading) return "pending";
  return input.isOnlyMember ? "delete" : "leave";
}
