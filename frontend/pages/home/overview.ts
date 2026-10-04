import type { GroupStatistics } from "~~/lib/api/types/data-contracts";
import { fmtCurrency } from "~~/composables/utils";

/** Why an overview load cannot be shown as inventory totals. */
export type OverviewFailure = "stats" | "identity" | "no-collection";

export type OverviewStats = {
  collectionId: string;
  name: string;
  currency: string;
  totalValue: number;
  itemCount: number;
  locationCount: number;
  tagCount: number;
};

export type OverviewLoad = {
  collectionId: string | null;
  ok: boolean;
  failure: OverviewFailure | null;
  stats: OverviewStats | null;
};

export type OverviewPhase = "loading" | "error" | "empty" | "ready" | "no-collection";

export type OverviewClient = {
  stats: {
    group: (id?: string) => Promise<{ error?: boolean; data?: Partial<GroupStatistics> | null }>;
  };
  group: {
    get: (id?: string) => Promise<{ error?: boolean; data?: { name?: unknown; currency?: unknown } | null }>;
  };
};

/**
 * The API tenant is the preference id. If the selector and the preference
 * disagree, neither identity is safe to show.
 */
export function resolveActiveCollectionId(selectedId: string | null, preferenceId: string | null): string | null {
  if (selectedId && preferenceId && selectedId !== preferenceId) {
    return null;
  }
  return preferenceId ?? selectedId;
}

export function isEmptyCollection(stats: OverviewStats): boolean {
  return stats.itemCount === 0 && stats.locationCount === 0 && stats.tagCount === 0 && stats.totalValue === 0;
}

export function classifyOverview(input: {
  activeId: string | null;
  selectionMismatch: boolean;
  collectionsPending: boolean;
  requestPending: boolean;
  requestFailed?: boolean;
  load: OverviewLoad | null;
}): OverviewPhase {
  if (input.selectionMismatch) {
    return "loading";
  }
  if (!input.activeId) {
    return input.collectionsPending || input.requestPending ? "loading" : "no-collection";
  }
  if (input.requestPending) {
    return "loading";
  }
  const load = input.load;
  if (!load || load.collectionId !== input.activeId) {
    return input.requestFailed ? "error" : "loading";
  }
  if (!load.ok || !load.stats) {
    return "error";
  }
  return isEmptyCollection(load.stats) ? "empty" : "ready";
}

function readAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function readCount(value: unknown): number | null {
  const amount = readAmount(value);
  if (amount === null || amount < 0) {
    return null;
  }
  return amount;
}

function readStats(res: { error?: boolean; data?: Partial<GroupStatistics> | null } | null | undefined) {
  if (!res || res.error || !res.data) {
    return null;
  }
  const totalItemPrice = readAmount(res.data.totalItemPrice);
  const totalItems = readCount(res.data.totalItems);
  const totalLocations = readCount(res.data.totalLocations);
  const totalTags = readCount(res.data.totalTags);
  if (totalItemPrice === null || totalItems === null || totalLocations === null || totalTags === null) {
    return null;
  }
  return { totalItemPrice, totalItems, totalLocations, totalTags };
}

function readIdentity(
  res: { error?: boolean; data?: { name?: unknown; currency?: unknown } | null } | null | undefined
) {
  if (!res || res.error || !res.data) {
    return null;
  }
  if (typeof res.data.name !== "string") {
    return null;
  }
  if (typeof res.data.currency !== "string" || res.data.currency.trim() === "") {
    return null;
  }
  return { name: res.data.name.trim(), currency: res.data.currency.trim() };
}

/**
 * Loads identity and totals for one collection. Missing or failed fields stay
 * absent — they are never filled with zeros or the artboard's sample figures.
 */
export async function loadCollectionOverview(api: OverviewClient, collectionId: string | null): Promise<OverviewLoad> {
  if (!collectionId) {
    return { collectionId: null, ok: false, failure: "no-collection", stats: null };
  }

  const [statsSettled, groupSettled] = await Promise.allSettled([
    api.stats.group(collectionId),
    api.group.get(collectionId),
  ]);

  if (statsSettled.status === "rejected") {
    return { collectionId, ok: false, failure: "stats", stats: null };
  }
  if (groupSettled.status === "rejected") {
    return { collectionId, ok: false, failure: "identity", stats: null };
  }

  const stats = readStats(statsSettled.value);
  const identity = readIdentity(groupSettled.value);
  if (!stats) {
    return { collectionId, ok: false, failure: "stats", stats: null };
  }
  if (!identity) {
    return { collectionId, ok: false, failure: "identity", stats: null };
  }

  return {
    collectionId,
    ok: true,
    failure: null,
    stats: {
      collectionId,
      name: identity.name,
      currency: identity.currency,
      totalValue: stats.totalItemPrice,
      itemCount: stats.totalItems,
      locationCount: stats.totalLocations,
      tagCount: stats.totalTags,
    },
  };
}

export function formatCollectionValue(amount: number, currency: string, locale: string): string {
  const code = currency.trim();
  if (!code) {
    return "";
  }
  try {
    return fmtCurrency(amount, code, locale);
  } catch {
    return `${code} ${amount}`;
  }
}

export function formatCollectionCount(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}
