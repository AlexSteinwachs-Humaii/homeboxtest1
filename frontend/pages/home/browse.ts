import type { EntitySummary, TagOut, TagSummary } from "~~/lib/api/types/data-contracts";

/** Existing location tree. Home does not invent a second locations page. */
export const LOCATIONS_VIEW_ALL = "/locations";

/** Existing tag tree. Home does not invent a second tags page. */
export const TAGS_VIEW_ALL = "/tags";

export type BrowseFailure = "locations" | "tags" | "no-collection";

export type BrowsePhase = "loading" | "error" | "empty" | "ready" | "no-collection";

export type LocationCardView = {
  id: string;
  name: string;
  href: string;
  /** Direct child-item quantity from the locations query. Zero is empty, not missing. */
  count: number;
  empty: boolean;
};

export type TagCardView = {
  id: string;
  name: string;
  href: string;
  tag: TagOut | TagSummary;
};

export type LocationLoad = {
  collectionId: string | null;
  ok: boolean;
  failure: BrowseFailure | null;
  locations: LocationCardView[];
};

export type TagLoad = {
  collectionId: string | null;
  ok: boolean;
  failure: BrowseFailure | null;
  tags: TagCardView[];
};

export type LocationSource = {
  refreshParents: () => Promise<{ error?: boolean; data?: unknown } | null | undefined>;
};

export type TagSource = {
  refresh: () => Promise<{ error?: boolean; data?: unknown } | null | undefined>;
};

export function locationHref(id: string): string {
  return `/location/${id}`;
}

export function tagHref(id: string): string {
  return `/tag/${id}`;
}

/**
 * Location listings omit itemCount when it is zero (`omitempty`). That is an
 * empty location, not a missing field and not a reason to drop the location.
 * A non-numeric value is the same omission. Do not invent a recursive total.
 */
export function locationItemCount(location: { itemCount?: unknown }): number {
  const value = location.itemCount;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

export function presentLocation(location: {
  id?: unknown;
  name?: unknown;
  itemCount?: unknown;
}): LocationCardView | null {
  if (!location || typeof location.id !== "string" || location.id.trim() === "") {
    return null;
  }
  const count = locationItemCount(location);
  const name = typeof location.name === "string" ? location.name.trim() : "";
  return {
    id: location.id,
    name,
    href: locationHref(location.id),
    count,
    empty: count === 0,
  };
}

export function presentLocations(locations: unknown): LocationCardView[] {
  if (!Array.isArray(locations)) {
    return [];
  }
  return locations.flatMap(location => {
    const card = presentLocation(location as { id?: unknown; name?: unknown; itemCount?: unknown });
    return card ? [card] : [];
  });
}

export function presentTag(tag: { id?: unknown; name?: unknown }): TagCardView | null {
  if (!tag || typeof tag.id !== "string" || tag.id.trim() === "") {
    return null;
  }
  const name = typeof tag.name === "string" ? tag.name.trim() : "";
  return {
    id: tag.id,
    name,
    href: tagHref(tag.id),
    tag: tag as TagOut | TagSummary,
  };
}

export function presentTags(tags: unknown): TagCardView[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.flatMap(tag => {
    const card = presentTag(tag as { id?: unknown; name?: unknown });
    return card ? [card] : [];
  });
}

export function classifyBrowse(input: {
  activeId: string | null;
  selectionMismatch: boolean;
  requestPending: boolean;
  requestFailed?: boolean;
  load: { collectionId: string | null; ok: boolean; locations?: unknown[]; tags?: unknown[] } | null;
}): BrowsePhase {
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
  const rows = load.locations ?? load.tags ?? [];
  return rows.length === 0 ? "empty" : "ready";
}

export async function loadHomeLocations(source: LocationSource, collectionId: string | null): Promise<LocationLoad> {
  if (!collectionId) {
    return { collectionId: null, ok: false, failure: "no-collection", locations: [] };
  }

  try {
    const res = await source.refreshParents();
    if (!res || res.error || !Array.isArray(res.data)) {
      return { collectionId, ok: false, failure: "locations", locations: [] };
    }
    return { collectionId, ok: true, failure: null, locations: presentLocations(res.data) };
  } catch {
    return { collectionId, ok: false, failure: "locations", locations: [] };
  }
}

export async function loadHomeTags(source: TagSource, collectionId: string | null): Promise<TagLoad> {
  if (!collectionId) {
    return { collectionId: null, ok: false, failure: "no-collection", tags: [] };
  }

  try {
    const res = await source.refresh();
    if (!res || res.error || !Array.isArray(res.data)) {
      return { collectionId, ok: false, failure: "tags", tags: [] };
    }
    return { collectionId, ok: true, failure: null, tags: presentTags(res.data) };
  } catch {
    return { collectionId, ok: false, failure: "tags", tags: [] };
  }
}

/** Numeric presence: zero is a count. Omitted is not, so other pages do not invent one. */
export function explicitItemCount(location: Pick<EntitySummary, "itemCount"> | { itemCount?: unknown }): number | null {
  const value = location.itemCount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
