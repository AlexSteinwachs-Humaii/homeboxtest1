import type { Group, GroupStatistics } from "~~/lib/api/types/data-contracts";
import { fmtCurrency } from "~~/composables/utils";

/** Visible states for the collection overview. They must not share one presentation. */
export type OverviewPhase = "no-collection" | "loading" | "error" | "empty" | "ready";

export type CollectionResolution = { status: "none" } | { status: "mismatch" } | { status: "ready"; id: string };

export type CollectionIdentity = {
  id: string;
  name: string;
  currency: string;
};

export type StatisticsSnapshot = {
  totalItemPrice: number;
  totalItems: number;
  totalLocations: number;
  totalTags: number;
};

export type OverviewLoad = {
  collectionId: string;
  group: CollectionIdentity | null;
  groupOk: boolean;
  stats: StatisticsSnapshot | null;
  statsOk: boolean;
};

export type OverviewView = {
  phase: OverviewPhase;
  identity: CollectionIdentity | null;
  stats: StatisticsSnapshot | null;
};

type GroupRead = {
  error: boolean;
  data: Group | null;
};

type StatsRead = {
  error: boolean;
  data: GroupStatistics | null;
};

/** Minimal client surface so the loader can be tested without Nuxt. */
export type OverviewClient = {
  group: {
    get: (groupId?: string) => Promise<GroupRead>;
  };
  stats: {
    group: (groupId?: string) => Promise<StatsRead>;
  };
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * The API tenant is the preference. The selector must agree when both are set;
 * a mismatch is unsafe to render (it would mix one collection's name with another's totals).
 */
export function resolveActiveCollectionId(
  selectedId: string | null | undefined,
  preferenceId: string | null | undefined
): CollectionResolution {
  const selected = blank(selectedId);
  const preference = blank(preferenceId);
  if (selected && preference && selected !== preference) {
    return { status: "mismatch" };
  }
  const id = selected ?? preference;
  if (!id) {
    return { status: "none" };
  }
  return { status: "ready", id };
}

function finiteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isStatisticsSnapshot(value: unknown): value is StatisticsSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const stats = value as Partial<GroupStatistics>;
  return (
    finiteCount(stats.totalItemPrice) &&
    finiteCount(stats.totalItems) &&
    finiteCount(stats.totalLocations) &&
    finiteCount(stats.totalTags)
  );
}

export function isCollectionIdentity(value: unknown, collectionId: string): value is CollectionIdentity {
  if (!value || typeof value !== "object") {
    return false;
  }
  const group = value as Partial<Group>;
  const name = blank(group.name);
  const currency = blank(group.currency)?.toUpperCase() ?? "";
  return group.id === collectionId && name !== null && CURRENCY_CODE.test(currency);
}

export function toIdentity(group: Group, collectionId: string): CollectionIdentity | null {
  if (!isCollectionIdentity(group, collectionId)) {
    return null;
  }
  return {
    id: group.id,
    name: group.name.trim(),
    currency: group.currency.trim().toUpperCase(),
  };
}

export function toStatistics(value: unknown): StatisticsSnapshot | null {
  if (!isStatisticsSnapshot(value)) {
    return null;
  }
  return {
    totalItemPrice: value.totalItemPrice,
    totalItems: value.totalItems,
    totalLocations: value.totalLocations,
    totalTags: value.totalTags,
  };
}

export function isEmptyCollection(stats: StatisticsSnapshot): boolean {
  return stats.totalItemPrice === 0 && stats.totalItems === 0 && stats.totalLocations === 0 && stats.totalTags === 0;
}

/**
 * Classify a load. A failed or incomplete response is an error, never zeros.
 * A load for a different collection is ignored so a switch cannot keep the previous totals.
 * A successful load stays visible while a same-collection refresh is in flight.
 */
export function classifyOverview(input: {
  resolution: CollectionResolution;
  pending: boolean;
  failed: boolean;
  load: OverviewLoad | null;
}): OverviewView {
  if (input.resolution.status === "none") {
    return { phase: "no-collection", identity: null, stats: null };
  }

  const collectionId = input.resolution.status === "ready" ? input.resolution.id : null;
  const matching = collectionId && input.load?.collectionId === collectionId ? input.load : null;

  if (matching?.groupOk && matching.statsOk && matching.group && matching.stats) {
    return {
      phase: isEmptyCollection(matching.stats) ? "empty" : "ready",
      identity: matching.group,
      stats: matching.stats,
    };
  }

  if (!input.pending && (input.failed || (matching && (!matching.groupOk || !matching.statsOk)))) {
    return { phase: "error", identity: matching?.group ?? null, stats: null };
  }

  return { phase: "loading", identity: null, stats: null };
}

/** Format with the collection's currency. Does not consult the global USD cache. */
export function formatCollectionValue(amount: number, currency: string, locale: string): string {
  const code = currency.trim().toUpperCase();
  if (!CURRENCY_CODE.test(code) || !Number.isFinite(amount)) {
    return "";
  }
  return fmtCurrency(amount, code, locale);
}

export async function loadCollectionOverview(api: OverviewClient, collectionId: string): Promise<OverviewLoad> {
  const [groupResult, statsResult] = await Promise.allSettled([
    api.group.get(collectionId),
    api.stats.group(collectionId),
  ]);

  const groupResponse = groupResult.status === "fulfilled" ? groupResult.value : null;
  const statsResponse = statsResult.status === "fulfilled" ? statsResult.value : null;
  const group =
    groupResponse && !groupResponse.error && groupResponse.data ? toIdentity(groupResponse.data, collectionId) : null;
  const stats = statsResponse && !statsResponse.error ? toStatistics(statsResponse.data) : null;

  return {
    collectionId,
    group,
    groupOk: group !== null,
    stats,
    statsOk: stats !== null,
  };
}
