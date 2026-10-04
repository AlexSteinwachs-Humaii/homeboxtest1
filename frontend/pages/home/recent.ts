import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import { formatCollectionValue, type CollectionResolution } from "./overview";

/** The reference row is three cards. View all is the existing inventory search route. */
export const RECENT_PAGE_SIZE = 3;
export const RECENT_VIEW_ALL = "/items";

export const RECENT_QUERY = {
  page: 1,
  pageSize: RECENT_PAGE_SIZE,
  orderBy: "createdAt",
} as const;

export type RecentPhase = "no-collection" | "loading" | "error" | "empty" | "ready";

export type RecentPhoto = { kind: "none" } | { kind: "upload"; path: string };

/** Fields the card may render. Null means the API did not supply the field — do not invent it. */
export type RecentCard = {
  id: string;
  href: string;
  name: string;
  assetId: string | null;
  quantity: number | null;
  location: string | null;
  value: string | null;
  photo: RecentPhoto;
};

export type RecentLoad = {
  collectionId: string;
  ok: boolean;
  items: EntitySummary[];
  total: number;
};

type RecentRead = {
  error: boolean;
  data: { items?: EntitySummary[] | null; total?: number } | null;
};

/** Minimal client surface so the loader can be tested without Nuxt. */
export type RecentClient = {
  items: {
    getAll: (query: typeof RECENT_QUERY) => Promise<RecentRead>;
  };
};

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function itemHref(id: string): string {
  return `/item/${id}`;
}

/**
 * Asset IDs are zero-padded "000-042". A blank, zero, or negative id is unset
 * (the API renders nil as "" or "000-000"), not a real identifier.
 */
export function displayAssetId(value: string | null | undefined): string | null {
  const trimmed = blank(value);
  if (!trimmed) {
    return null;
  }
  const digits = trimmed.replace(/-/g, "");
  if (/^\d+$/.test(digits)) {
    const parsed = Number(digits);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
  }
  return trimmed;
}

/** Prefer the primary thumbnail, then the original upload. Either is a real photo. */
export function primaryAttachmentId(item: { thumbnailId?: string | null; imageId?: string | null }): string | null {
  return blank(item.thumbnailId) ?? blank(item.imageId);
}

export function attachmentPath(entityId: string, attachmentId: string): string {
  return `/entities/${entityId}/attachments/${attachmentId}`;
}

export function isLocationEntity(item: { entityType?: { isLocation?: boolean } | null }): boolean {
  return item.entityType?.isLocation === true;
}

/** Milliseconds since epoch, or NaN when the timestamp is missing or the zero date. */
export function createdAtMillis(value: Date | string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms) || date.getUTCFullYear() < 1000) {
    return Number.NaN;
  }
  return ms;
}

export function presentRecentItem(item: EntitySummary, currency: string, locale: string): RecentCard | null {
  const id = blank(item.id);
  if (!id || isLocationEntity(item)) {
    return null;
  }

  const attachmentId = primaryAttachmentId(item);
  const quantity =
    typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 0 ? item.quantity : null;
  const formatted =
    typeof item.purchasePrice === "number" && Number.isFinite(item.purchasePrice)
      ? formatCollectionValue(item.purchasePrice, currency, locale)
      : "";

  return {
    id,
    href: itemHref(id),
    name: blank(item.name) ?? "",
    assetId: displayAssetId(item.assetId),
    quantity,
    location: blank(item.parent?.name),
    value: formatted === "" ? null : formatted,
    photo: attachmentId ? { kind: "upload", path: attachmentPath(id, attachmentId) } : { kind: "none" },
  };
}

/** Newest createdAt first. Missing dates stay at the end, in their original order. */
export function orderRecentItems(items: EntitySummary[]): EntitySummary[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftMs = createdAtMillis(left.item.createdAt);
      const rightMs = createdAtMillis(right.item.createdAt);
      const leftMissing = Number.isNaN(leftMs);
      const rightMissing = Number.isNaN(rightMs);
      if (leftMissing && rightMissing) {
        return left.index - right.index;
      }
      if (leftMissing) {
        return 1;
      }
      if (rightMissing) {
        return -1;
      }
      if (rightMs !== leftMs) {
        return rightMs - leftMs;
      }
      return left.index - right.index;
    })
    .map(entry => entry.item);
}

export function presentRecentItems(items: EntitySummary[], currency: string, locale: string): RecentCard[] {
  const cards: RecentCard[] = [];
  for (const item of orderRecentItems(items)) {
    const card = presentRecentItem(item, currency, locale);
    if (card) {
      cards.push(card);
    }
    if (cards.length === RECENT_PAGE_SIZE) {
      break;
    }
  }
  return cards;
}

/**
 * A failed or incomplete response is an error, never an empty inventory.
 * A load for a different collection is ignored so a switch cannot keep the previous cards.
 */
export function classifyRecent(input: {
  resolution: CollectionResolution;
  pending: boolean;
  failed: boolean;
  load: RecentLoad | null;
}): RecentPhase {
  if (input.resolution.status === "none") {
    return "no-collection";
  }

  const collectionId = input.resolution.status === "ready" ? input.resolution.id : null;
  const matching = collectionId && input.load?.collectionId === collectionId ? input.load : null;

  if (matching?.ok) {
    return presentRecentItems(matching.items, "USD", "en-US").length === 0 ? "empty" : "ready";
  }

  if (!input.pending && (input.failed || (matching && !matching.ok))) {
    return "error";
  }

  return "loading";
}

export async function loadRecentItems(api: RecentClient, collectionId: string): Promise<RecentLoad> {
  try {
    const response = await api.items.getAll(RECENT_QUERY);
    const items = response.data?.items;
    if (response.error || !Array.isArray(items)) {
      return { collectionId, ok: false, items: [], total: 0 };
    }
    const reported = response.data?.total;
    const total = typeof reported === "number" && Number.isFinite(reported) ? reported : items.length;
    return { collectionId, ok: true, items, total };
  } catch {
    return { collectionId, ok: false, items: [], total: 0 };
  }
}
