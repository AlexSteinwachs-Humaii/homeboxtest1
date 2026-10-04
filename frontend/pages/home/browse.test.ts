import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, test } from "vitest";
import {
  LOCATIONS_VIEW_ALL,
  TAGS_VIEW_ALL,
  classifyBrowse,
  explicitItemCount,
  loadHomeLocations,
  loadHomeTags,
  locationHref,
  locationItemCount,
  presentLocation,
  presentLocations,
  presentTag,
  tagHref,
  type LocationLoad,
  type TagLoad,
} from "./browse";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "index.vue"), "utf8");
const places = readFileSync(resolve(here, "places.ts"), "utf8");
const card = readFileSync(resolve(here, "../../components/Location/Card.vue"), "utf8");
const locationPage = readFileSync(resolve(here, "../location/[id]/index/index.vue"), "utf8");
const en = JSON.parse(readFileSync(resolve(here, "../../locales/en.json"), "utf8")) as {
  home: Record<string, string>;
  locations: Record<string, string>;
};

const readyLocations: LocationLoad = {
  collectionId: "group-1",
  ok: true,
  failure: null,
  locations: [
    { id: "loc-garage", name: "Garage", href: "/location/loc-garage", count: 12, empty: false },
    { id: "loc-attic", name: "Attic", href: "/location/loc-attic", count: 0, empty: true },
  ],
};

describe("location and tag browsing", () => {
  test("keeps a zero count and an omitted count as an empty location", () => {
    expect(locationItemCount({ itemCount: 0 })).toBe(0);
    expect(locationItemCount({})).toBe(0);
    expect(locationItemCount({ itemCount: null })).toBe(0);
    expect(locationItemCount({ itemCount: 4 })).toBe(4);

    const omitted = presentLocation({ id: "attic", name: "Attic" });
    const zero = presentLocation({ id: "shed", name: "Shed", itemCount: 0 });
    expect(omitted).toMatchObject({ href: "/location/attic", count: 0, empty: true });
    expect(zero).toMatchObject({ href: "/location/shed", count: 0, empty: true });

    const listed = presentLocations([
      { id: "garage", name: "Garage", itemCount: 12 },
      { id: "attic", name: "Attic" },
      { name: "dropped" },
    ]);
    expect(listed.map(item => item.id)).toEqual(["garage", "attic"]);
    expect(listed[1]?.empty).toBe(true);
    expect(locationHref("garage")).toBe("/location/garage");
    expect(LOCATIONS_VIEW_ALL).toBe("/locations");
  });

  test("does not invent a count when the field was never loaded", () => {
    expect(explicitItemCount({})).toBeNull();
    expect(explicitItemCount({ itemCount: 0 })).toBe(0);
    expect(explicitItemCount({ itemCount: 3 })).toBe(3);
  });

  test("uses real tag routes and does not invent sample counts", () => {
    const tags = [presentTag({ id: "tools", name: "Tools" }), presentTag({ id: "spare", name: "Spare parts" })];
    expect(tags.map(tag => tag?.href)).toEqual(["/tag/tools", "/tag/spare"]);
    expect(tagHref("tools")).toBe("/tag/tools");
    expect(TAGS_VIEW_ALL).toBe("/tags");
    expect(JSON.stringify(tags)).not.toContain("All 6");
    expect(presentTag({ name: "No id" })).toBeNull();
  });

  test("distinguishes loading, error, empty and a listed empty location", () => {
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: true,
        load: null,
      })
    ).toBe("loading");
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: true,
        requestPending: false,
        load: readyLocations,
      })
    ).toBe("loading");
    expect(
      classifyBrowse({
        activeId: null,
        selectionMismatch: false,
        requestPending: false,
        load: null,
      })
    ).toBe("no-collection");
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        requestFailed: true,
        load: null,
      })
    ).toBe("error");
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: { collectionId: "group-1", ok: false, locations: [] },
      })
    ).toBe("error");
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: { ...readyLocations, locations: [] },
      })
    ).toBe("empty");
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: readyLocations,
      })
    ).toBe("ready");
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: {
          collectionId: "group-1",
          ok: true,
          tags: [{ id: "tools" }],
        },
      })
    ).toBe("ready");
  });

  test("treats a failed store refresh as an error, not an empty collection", async () => {
    const failed = await loadHomeLocations(
      {
        refreshParents: async () => ({ error: true, data: undefined }),
      },
      "group-1"
    );
    expect(failed.ok).toBe(false);
    expect(failed.locations).toEqual([]);
    expect(
      classifyBrowse({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: failed,
      })
    ).toBe("error");

    const empty = await loadHomeLocations(
      {
        refreshParents: async () => ({ error: false, data: [] }),
      },
      "group-1"
    );
    expect(empty.ok).toBe(true);
    expect(empty.locations).toEqual([]);

    const listed = await loadHomeLocations(
      {
        refreshParents: async () => ({
          error: false,
          data: [{ id: "attic", name: "Attic" }],
        }),
      },
      "group-1"
    );
    expect(listed.locations).toEqual([{ id: "attic", name: "Attic", href: "/location/attic", count: 0, empty: true }]);

    const tags = await loadHomeTags(
      {
        refresh: async () => ({ error: false, data: [{ id: "tools", name: "Tools" }] }),
      },
      "group-1"
    );
    expect(tags.tags[0]?.href).toBe("/tag/tools");
    const thrown = await loadHomeTags(
      {
        refresh: async () => {
          throw new Error("offline");
        },
      },
      "group-1"
    );
    expect(thrown.failure).toBe("tags");
    expect(
      await loadHomeTags(
        {
          refresh: async () => ({ error: false, data: [] }),
        },
        null
      )
    ).toMatchObject({ ok: false, failure: "no-collection" });
  });

  test("copy counts real quantities and does not bake in the artboard", () => {
    const locationCount = en.home.location_count ?? "";
    const count = new IntlMessageFormat(locationCount, "en");
    expect(count.format({ count: 1 })).toBe("1 item");
    expect(count.format({ count: 12 })).toBe("12 items");
    expect(en.home.location_empty).toBe("No items yet");
    expect(en.home.tags_view_all).toBe("All {count}");
    expect(en.home.locations_empty).not.toMatch(/Garage|Attic|All 6/);
    expect(en.locations.empty_items).toBe("This location has no items yet.");
  });
});

describe("home location and tag page", () => {
  test("uses a two-column grid, existing routes and truthful states", () => {
    expect(page).toContain("sm:grid-cols-2");
    expect(page).toContain('data-testid="home-locations-grid"');
    expect(page).not.toMatch(/home-locations-grid[\s\S]{0,180}md:grid-cols-3/);
    expect(page).toContain("LOCATIONS_VIEW_ALL");
    expect(page).toContain("TAGS_VIEW_ALL");
    expect(page).toContain('data-testid="home-locations-view-all"');
    expect(page).toContain('data-testid="home-tags-view-all"');
    expect(page).toContain("tagsViewAllLabel");
    expect(page).toContain('variant="overview"');
    expect(page).toContain('data-testid="home-locations-loading"');
    expect(page).toContain('data-testid="home-locations-error"');
    expect(page).toContain('data-testid="home-locations-empty"');
    expect(page).toContain('data-testid="home-tags-empty"');
    expect(page).toContain('data-testid="home-tags-error"');
    expect(page).not.toContain("locations.no_results");
    expect(page).not.toContain("tags.no_results");
    expect(page).not.toContain("Garage");
    expect(page).not.toContain("All 6");
    expect(places).toContain("loadHomeLocations");
    expect(places).toContain("loadHomeTags");
    expect(places).toContain("useLocationStore");
    expect(places).toContain("useTagStore");
    expect(readFileSync(resolve(here, "browse.ts"), "utf8")).toContain("refreshParents");
    expect(places).toContain("home-locations:");
    expect(places).toContain("home-tags:");
    expect(places).toContain("getCachedData: () => undefined");
    expect(places).toContain("ServerEvent.EntityMutation");
    expect(places).toContain("ServerEvent.TagMutation");
    expect(places).toContain("ServerEvent.ImportMutation");
    expect(card).toContain("explicitItemCount");
    expect(card).not.toContain("!!(props.location");
    expect(card).toContain("variant === 'overview'");
    expect(card).toContain(':to="detail.href"');
    expect(card).toContain("home-location-empty");
    expect(card).toContain("glass-focus");
    expect(card).toContain("min-h-11");
    expect(locationPage).toContain('data-testid="location-items-empty"');
    expect(locationPage).toContain("locations.empty_items");
  });
});

describe("tag load shape", () => {
  test("does not treat a wrapped object as a tag list", async () => {
    const load: TagLoad = await loadHomeTags(
      {
        refresh: async () => ({ error: false, data: { items: [{ id: "tools", name: "Tools" }] } }),
      },
      "group-1"
    );
    expect(load.ok).toBe(false);
    expect(load.failure).toBe("tags");
  });
});
