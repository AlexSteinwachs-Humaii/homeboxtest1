import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import { formatCollectionValue } from "./overview";

/** Visible recent-item row from the iPad reference. The API already returns newest first. */
export const RECENT_ITEMS_LIMIT = 3;

export const RECENT_VIEW_ALL = "/items";

export const RECENT_ITEMS_QUERY = {
  page: 1,
  pageSize: RECENT_ITEMS_LIMIT,
  orderBy: "createdAt",
} as const;

const MISSING_ASSET_IDS = new Set(["", "0", "000-000", "000000"]);

export type RecentFailure = "items" | "no-collection";

export type RecentPhase = "loading" | "error" | "empty" | "ready" | "no-collection";

export type RecentLoad = {
  collectionId: string | null;
  ok: boolean;
  failure: RecentFailure | null;
  items: EntitySummary[];
  total: number | null;
};

export type RecentCardView = {
  id: string;
  href: string;
  name: string;
  nameMissing: boolean;
  assetId: string | null;
  quantity: number | null;
  quantityText: string | null;
  location: string | null;
  value: string | null;
  /** Authenticated attachment path. Null means there is no uploaded photo. */
  photoPath: string | null;
};

export type RecentClient = {
  items: {
    getAll: (query: typeof RECENT_ITEMS_QUERY) => Promise<{
      error?: boolean;
      data?: { items?: unknown; total?: unknown } | null;
    }>;
  };
};

export function recentItemHref(id: string): string {
  return `/item/${id}`;
}

export function classifyRecent(input: {
  activeId: string | null;
  selectionMismatch: boolean;
  requestPending: boolean;
  requestFailed?: boolean;
  load: RecentLoad | null;
}): RecentPhase {
  if (input.selectionMismatch) {
    return "loading";
  }
  if (!input.activeId) {
    return input.requestPending ? "loading" : "no-collection";
  }
  if (input.requestPending) {
    return "loading";
  }
  const load = input.load;
  if (!load || load.collectionId !== input.activeId) {
    return input.requestFailed ? "error" : "loading";
  }
  if (!load.ok) {
    return "error";
  }
  return load.items.length === 0 ? "empty" : "ready";
}

function createdAtMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) || value.getFullYear() < 1000 ? null : time;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text.startsWith("0001")) {
      return null;
    }
    const time = Date.parse(text);
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/** Newest createdAt first. Missing dates stay in their original order, after dated rows. */
export function orderRecentItems<T extends { id: string; createdAt?: unknown }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, at: createdAtMillis(item.createdAt) }))
    .sort((a, b) => {
      if (a.at === null && b.at === null) {
        return a.index - b.index;
      }
      if (a.at === null) {
        return 1;
      }
      if (b.at === null) {
        return -1;
      }
      if (a.at !== b.at) {
        return b.at - a.at;
      }
      return a.index - b.index;
    })
    .map(row => row.item);
}

export function takeRecentItems<T>(items: T[]): T[] {
  return items.slice(0, RECENT_ITEMS_LIMIT);
}

function attachmentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text || null;
}

/**
 * Primary thumbnail, then the original upload. No path means no photo —
 * callers must not substitute an illustration.
 */
export function recentPhotoPath(item: { id: string; thumbnailId?: unknown; imageId?: unknown }): string | null {
  const id = attachmentId(item.thumbnailId) ?? attachmentId(item.imageId);
  if (!id || !item.id) {
    return null;
  }
  return `/entities/${item.id}/attachments/${id}`;
}

export function presentAssetId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (MISSING_ASSET_IDS.has(text)) {
    return null;
  }
  return text;
}

export function presentQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export function presentLocation(parent: unknown): string | null {
  if (!parent || typeof parent !== "object") {
    return null;
  }
  const name = (parent as { name?: unknown }).name;
  if (typeof name !== "string") {
    return null;
  }
  const text = name.trim();
  return text || null;
}

export function presentRecentValue(price: unknown, currency: string, locale: string): string | null {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }
  const code = currency.trim();
  if (!/^[A-Za-z]{3}$/.test(code)) {
    return null;
  }
  const formatted = formatCollectionValue(price, code, locale);
  return formatted || null;
}

function presentName(value: unknown): { name: string; nameMissing: boolean } {
  if (typeof value !== "string") {
    return { name: "", nameMissing: true };
  }
  const name = value.trim();
  if (!name) {
    return { name: "", nameMissing: true };
  }
  return { name, nameMissing: false };
}

function quantityText(quantity: number | null, locale: string): string | null {
  if (quantity === null) {
    return null;
  }
  try {
    return new Intl.NumberFormat(locale).format(quantity);
  } catch {
    return String(quantity);
  }
}

export function presentRecentItem(item: EntitySummary, currency: string, locale: string): RecentCardView {
  const named = presentName(item.name);
  const quantity = presentQuantity(item.quantity);
  return {
    id: item.id,
    href: recentItemHref(item.id),
    name: named.name,
    nameMissing: named.nameMissing,
    assetId: presentAssetId(item.assetId),
    quantity,
    quantityText: quantityText(quantity, locale),
    location: presentLocation(item.parent),
    value: presentRecentValue(item.purchasePrice, currency, locale),
    photoPath: recentPhotoPath(item),
  };
}

function isItemRecord(value: unknown): value is EntitySummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<EntitySummary>;
  if (typeof item.id !== "string" || item.id.trim() === "") {
    return false;
  }
  if (item.entityType && typeof item.entityType === "object" && item.entityType.isLocation === true) {
    return false;
  }
  return true;
}

/**
 * Loads the newest items for one collection. A failed request is not an empty
 * inventory, and fields the API omits stay omitted.
 */
export async function loadRecentItems(api: RecentClient, collectionId: string | null): Promise<RecentLoad> {
  if (!collectionId) {
    return { collectionId: null, ok: false, failure: "no-collection", items: [], total: null };
  }

  try {
    const res = await api.items.getAll(RECENT_ITEMS_QUERY);
    if (!res || res.error || !res.data || !Array.isArray(res.data.items)) {
      return { collectionId, ok: false, failure: "items", items: [], total: null };
    }

    const items = takeRecentItems(orderRecentItems(res.data.items.filter(isItemRecord)));
    const total = typeof res.data.total === "number" && Number.isFinite(res.data.total) ? res.data.total : items.length;
    return { collectionId, ok: true, failure: null, items, total };
  } catch {
    return { collectionId, ok: false, failure: "items", items: [], total: null };
  }
}

export function hasAdditionalRecent(load: Pick<RecentLoad, "items" | "total">): boolean {
  return typeof load.total === "number" && load.total > load.items.length;
}
