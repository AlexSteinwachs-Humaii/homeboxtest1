import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { explicitItemCount } from "~~/components/Location/count";
import {
  LOCATIONS_QUERY,
  LOCATIONS_VIEW_ALL,
  TAGS_VIEW_ALL,
  classifyBrowse,
  loadHomeLocations,
  loadHomeTags,
  locationHref,
  locationItemCount,
  presentLocations,
  presentTags,
  tagHref,
  type LocationsClient,
  type TagsClient,
} from "./browse";

const collectionId = "11111111-1111-1111-1111-111111111111";

describe("location counts", () => {
  test("an explicit zero is empty, and an omitted list count is zero rather than missing", () => {
    expect(explicitItemCount({ itemCount: 0 })).toBe(0);
    expect(explicitItemCount({ itemCount: 12 })).toBe(12);
    expect(explicitItemCount({})).toBeNull();
    expect(explicitItemCount({ itemCount: Number.NaN })).toBeNull();
    expect(locationItemCount({})).toBe(0);
    expect(locationItemCount({ itemCount: 0 })).toBe(0);
    expect(locationItemCount({ itemCount: "12" })).toBeNull();
  });

  test("keeps empty locations and does not invent names or sample rooms", () => {
    const cards = presentLocations([
      { id: "garage", name: "Garage", itemCount: 12 },
      { id: "attic", name: "Attic" },
      { id: "blank", name: "  " },
      { id: "", name: "Nowhere" },
    ]);

    expect(cards.map(card => card.id)).toEqual(["garage", "attic"]);
    expect(cards[0]).toMatchObject({ href: "/location/garage", count: 12, empty: false });
    expect(cards[1]).toMatchObject({ href: "/location/attic", count: 0, empty: true });
    expect(cards.map(card => card.name)).not.toContain("Living Room");
    expect(locationHref("attic")).toBe("/location/attic");
    expect(LOCATIONS_VIEW_ALL).toBe("/locations");
    expect(LOCATIONS_QUERY).toEqual({ filterChildren: true });
  });
});

describe("tags", () => {
  test("uses live tags and existing routes, with no sample count", () => {
    const chips = presentTags([
      { id: "tools", name: "Tools", color: "#116633", icon: "wrench-outline" },
      { id: "blank", name: "" },
      null,
    ]);

    expect(chips).toEqual([
      { id: "tools", href: "/tag/tools", name: "Tools", color: "#116633", icon: "wrench-outline" },
    ]);
    expect(tagHref("tools")).toBe("/tag/tools");
    expect(TAGS_VIEW_ALL).toBe("/tags");
    expect(chips).toHaveLength(1);
  });
});

describe("classifyBrowse", () => {
  test("distinguishes loading, empty, error and no collection", () => {
    expect(classifyBrowse({ resolution: { status: "none" }, pending: false, failed: false, load: null })).toBe(
      "no-collection"
    );
    expect(
      classifyBrowse({ resolution: { status: "ready", id: collectionId }, pending: true, failed: false, load: null })
    ).toBe("loading");
    expect(
      classifyBrowse({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: true,
        load: null,
      })
    ).toBe("error");
    expect(
      classifyBrowse({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: false,
        load: { collectionId, ok: true, items: [] },
      })
    ).toBe("empty");
    expect(
      classifyBrowse({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: false,
        load: { collectionId, ok: true, items: [{ id: "attic" }] },
      })
    ).toBe("ready");
  });

  test("does not keep another collection's locations", () => {
    expect(
      classifyBrowse({
        resolution: { status: "ready", id: "22222222-2222-2222-2222-222222222222" },
        pending: true,
        failed: false,
        load: { collectionId, ok: true, items: [{ id: "attic" }] },
      })
    ).toBe("loading");
  });

  test("an incomplete payload is an error, not an empty area", () => {
    expect(
      classifyBrowse({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: false,
        load: { collectionId, ok: false, items: [] },
      })
    ).toBe("error");
  });
});

describe("loadHomeLocations", () => {
  test("requests root locations and keeps a zero count", async () => {
    const seen: unknown[] = [];
    const client: LocationsClient = {
      getLocations: async query => {
        seen.push(query);
        return {
          error: false,
          data: [{ id: "attic", name: "Attic" } as never, { id: "garage", name: "Garage", itemCount: 2 } as never],
        };
      },
    };

    const load = await loadHomeLocations(client, collectionId);
    expect(seen).toEqual([LOCATIONS_QUERY]);
    expect(load.ok).toBe(true);
    expect(load.items.map(item => item.empty)).toEqual([true, false]);
  });

  test("a rejected or error response is not an empty location list", async () => {
    const rejected = await loadHomeLocations(
      {
        getLocations: async () => {
          throw new Error("network");
        },
      },
      collectionId
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.items).toEqual([]);

    const errored = await loadHomeLocations(
      {
        getLocations: async () => ({ error: true, data: [] }),
      },
      collectionId
    );
    expect(errored.ok).toBe(false);
  });
});

describe("loadHomeTags", () => {
  test("a tag error is not an empty tag list", async () => {
    const client: TagsClient = {
      getAll: async () => ({ error: true, data: [] }),
    };
    const load = await loadHomeTags(client, collectionId);
    expect(load.ok).toBe(false);
    expect(load.items).toEqual([]);
  });
});

describe("home browse page", () => {
  const page = readFileSync(resolve(__dirname, "index.vue"), "utf8");
  const places = readFileSync(resolve(__dirname, "places.ts"), "utf8");
  const statistics = readFileSync(resolve(__dirname, "statistics.ts"), "utf8");
  const card = readFileSync(resolve(__dirname, "../../components/Location/Card.vue"), "utf8");
  const overviewCard = card.slice(0, card.indexOf("<Card v-else>"));

  test("renders a two-column location grid and live tag routes", () => {
    expect(page).toContain("useHomePlaces");
    expect(page).toContain("LOCATIONS_VIEW_ALL");
    expect(page).toContain("TAGS_VIEW_ALL");
    expect(page).toContain('variant="overview"');
    expect(page).toContain('class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"');
    expect(page).toContain("tagsViewAllLabel");
    expect(page).toContain('data-testid="home-locations-view-all"');
    expect(page).toContain('data-testid="home-tags-view-all"');
    expect(page).toContain('data-testid="home-tag-chip"');
    expect(page).not.toContain("parentLocations");
    expect(places).toContain("refreshParents");
    expect(statistics).toContain("void load()");
    expect(places).toContain("home-locations:");
    expect(places).toContain("home-tags:");
    expect(places).toContain("ServerEvent.EntityMutation");
    expect(places).toContain("ServerEvent.TagMutation");
    expect(places).toContain("getCachedData: () => undefined");
    expect(overviewCard).toContain("detail.href");
    expect(overviewCard).toContain('data-testid="home-location-empty"');
    expect(overviewCard).toContain("glass-focus");
    expect(overviewCard).toContain("min-h-11");
    expect(card).toContain("explicitItemCount");
    expect(card).not.toContain("!!(");
  });
});
