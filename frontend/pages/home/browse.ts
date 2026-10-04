import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import { explicitItemCount } from "~~/components/Location/count";
import type { CollectionResolution } from "./overview";

/** Existing list routes. Nested locations stay on the locations tree, not the home grid. */
export const LOCATIONS_VIEW_ALL = "/locations";
export const TAGS_VIEW_ALL = "/tags";

/** Root locations only. `filterChildren` is the API's "no parent" filter. */
export const LOCATIONS_QUERY = { filterChildren: true } as const;

export type BrowsePhase = "no-collection" | "loading" | "error" | "empty" | "ready";

export type HomeLocation = {
  id: string;
  href: string;
  name: string;
  /** Null only when a count field was present but unusable. Omitted list counts are 0. */
  count: number | null;
  empty: boolean;
};

export type HomeTag = {
  id: string;
  href: string;
  name: string;
  color: string;
  icon: string;
};

export type BrowseLoad<T> = {
  collectionId: string;
  ok: boolean;
  items: T[];
};

type ListRead<T> = {
  error: boolean;
  data: T[] | null;
};

export type LocationsClient = {
  getLocations: (query: typeof LOCATIONS_QUERY) => Promise<ListRead<EntitySummary>>;
};

export type TagsClient = {
  getAll: () => Promise<ListRead<Partial<HomeTag> & { id?: string | null; name?: string | null }>>;
};

export { explicitItemCount };

export function locationHref(id: string): string {
  return `/location/${id}`;
}

export function tagHref(id: string): string {
  return `/tag/${id}`;
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * A location-list row omits `itemCount` when the direct-child quantity is zero.
 * That is an empty location, not missing data and not a reason to drop the row.
 * A present but unusable value stays unknown so we do not invent a zero.
 */
export function locationItemCount(location: object): number | null {
  if (Object.prototype.hasOwnProperty.call(location, "itemCount")) {
    return explicitItemCount(location);
  }
  return 0;
}

export function presentLocation(location: {
  id?: string | null;
  name?: string | null;
  itemCount?: unknown;
}): HomeLocation | null {
  const id = blank(location.id);
  const name = blank(location.name);
  if (!id || !name) {
    return null;
  }
  const count = locationItemCount(location);
  return {
    id,
    href: locationHref(id),
    name,
    count,
    empty: count === 0,
  };
}

export function presentLocations(
  locations: Array<{ id?: string | null; name?: string | null; itemCount?: unknown }> | null | undefined
): HomeLocation[] {
  if (!Array.isArray(locations)) {
    return [];
  }
  const cards: HomeLocation[] = [];
  for (const location of locations) {
    const card = location ? presentLocation(location) : null;
    if (card) {
      cards.push(card);
    }
  }
  return cards;
}

export function presentTag(
  tag:
    | {
        id?: string | null;
        name?: string | null;
        color?: string | null;
        icon?: string | null;
      }
    | null
    | undefined
): HomeTag | null {
  if (!tag) {
    return null;
  }
  const id = blank(tag.id);
  const name = blank(tag.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    href: tagHref(id),
    name,
    color: tag.color?.trim() ?? "",
    icon: tag.icon?.trim() ?? "",
  };
}

export function presentTags(
  tags:
    | Array<{ id?: string | null; name?: string | null; color?: string | null; icon?: string | null } | null>
    | null
    | undefined
): HomeTag[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const chips: HomeTag[] = [];
  for (const tag of tags) {
    const chip = presentTag(tag);
    if (chip) {
      chips.push(chip);
    }
  }
  return chips;
}

/**
 * A failed or incomplete response is an error, never an empty collection area.
 * A load for a different collection is ignored so a switch cannot keep the previous cards.
 */
export function classifyBrowse<T>(input: {
  resolution: CollectionResolution;
  pending: boolean;
  failed: boolean;
  load: BrowseLoad<T> | null;
}): BrowsePhase {
  if (input.resolution.status === "none") {
    return "no-collection";
  }

  const collectionId = input.resolution.status === "ready" ? input.resolution.id : null;
  const matching = collectionId && input.load?.collectionId === collectionId ? input.load : null;

  if (matching?.ok) {
    return matching.items.length === 0 ? "empty" : "ready";
  }

  if (!input.pending && (input.failed || (matching && !matching.ok))) {
    return "error";
  }

  return "loading";
}

async function settleList<T>(read: () => Promise<ListRead<T>>): Promise<{ ok: boolean; data: T[] }> {
  try {
    const response = await read();
    if (response.error || !Array.isArray(response.data)) {
      return { ok: false, data: [] };
    }
    return { ok: true, data: response.data };
  } catch {
    return { ok: false, data: [] };
  }
}

export async function loadHomeLocations(
  client: LocationsClient,
  collectionId: string
): Promise<BrowseLoad<HomeLocation>> {
  const result = await settleList(() => client.getLocations(LOCATIONS_QUERY));
  return {
    collectionId,
    ok: result.ok,
    items: result.ok ? presentLocations(result.data) : [],
  };
}

export async function loadHomeTags(client: TagsClient, collectionId: string): Promise<BrowseLoad<HomeTag>> {
  const result = await settleList(() => client.getAll());
  return {
    collectionId,
    ok: result.ok,
    items: result.ok ? presentTags(result.data) : [],
  };
}
