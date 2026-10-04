import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  classifyOverview,
  formatCollectionValue,
  isEmptyCollection,
  loadCollectionOverview,
  resolveActiveCollectionId,
  type OverviewClient,
  type OverviewLoad,
  type OverviewStats,
} from "./overview";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "index.vue"), "utf8");
const statistics = readFileSync(resolve(here, "statistics.ts"), "utf8");
const selector = readFileSync(resolve(here, "../../components/Collection/Selector.vue"), "utf8");
const layout = readFileSync(resolve(here, "../../layouts/default.vue"), "utf8");
const en = readFileSync(resolve(here, "../../locales/en.json"), "utf8");

const workshop: OverviewStats = {
  collectionId: "group-workshop",
  name: "Workshop",
  currency: "EUR",
  totalValue: 18.5,
  itemCount: 2,
  locationCount: 1,
  tagCount: 3,
};

function client(
  partial: {
    stats?: { error?: boolean; data?: Record<string, unknown> | null };
    group?: { error?: boolean; data?: { name?: unknown; currency?: unknown } | null };
    statsReject?: boolean;
    groupReject?: boolean;
  },
  seen: { statsId?: string; groupId?: string } = {}
): OverviewClient {
  return {
    stats: {
      group: (id?: string) => {
        seen.statsId = id;
        if (partial.statsReject) {
          return Promise.reject(new Error("stats down"));
        }
        return Promise.resolve(partial.stats ?? { error: false, data: null });
      },
    },
    group: {
      get: (id?: string) => {
        seen.groupId = id;
        if (partial.groupReject) {
          return Promise.reject(new Error("group down"));
        }
        return Promise.resolve(partial.group ?? { error: false, data: null });
      },
    },
  };
}

function ready(stats: OverviewStats): OverviewLoad {
  return { collectionId: stats.collectionId, ok: true, failure: null, stats };
}

describe("collection overview loading", () => {
  test("uses the current collection's name, currency and counts", async () => {
    const seen: { statsId?: string; groupId?: string } = {};
    const load = await loadCollectionOverview(
      client(
        {
          stats: {
            data: {
              totalItemPrice: 18.5,
              totalItems: 2,
              totalLocations: 1,
              totalTags: 3,
              totalUsers: 1,
              totalWithWarranty: 0,
            },
          },
          group: { data: { name: "Workshop", currency: "EUR" } },
        },
        seen
      ),
      "group-workshop"
    );

    expect(seen.statsId).toBe("group-workshop");
    expect(seen.groupId).toBe("group-workshop");
    expect(load.ok).toBe(true);
    expect(load.stats).toEqual(workshop);
    expect(load.stats).not.toMatchObject({
      name: "My Home",
      currency: "USD",
      totalValue: 2480,
      itemCount: 24,
      locationCount: 4,
      tagCount: 6,
    });
  });

  test("does not turn a failed statistics response into an empty inventory", async () => {
    const load = await loadCollectionOverview(
      client({
        stats: { error: true, data: null },
        group: { data: { name: "Workshop", currency: "EUR" } },
      }),
      "group-workshop"
    );

    expect(load.ok).toBe(false);
    expect(load.failure).toBe("stats");
    expect(load.stats).toBeNull();
  });

  test("does not fill missing counts with zeros", async () => {
    const load = await loadCollectionOverview(
      client({
        stats: { data: { totalItemPrice: 10, totalLocations: 1, totalTags: 1 } },
        group: { data: { name: "Workshop", currency: "EUR" } },
      }),
      "group-workshop"
    );

    expect(load.ok).toBe(false);
    expect(load.stats).toBeNull();
  });

  test("does not invent a currency when the collection identity fails", async () => {
    const load = await loadCollectionOverview(
      client({
        stats: {
          data: { totalItemPrice: 10, totalItems: 1, totalLocations: 1, totalTags: 1 },
        },
        group: { error: true, data: null },
      }),
      "group-workshop"
    );

    expect(load.failure).toBe("identity");
    expect(load.stats).toBeNull();
  });

  test("rejects a blank currency instead of falling back to USD", async () => {
    const load = await loadCollectionOverview(
      client({
        stats: {
          data: { totalItemPrice: 0, totalItems: 0, totalLocations: 0, totalTags: 0 },
        },
        group: { data: { name: "Workshop", currency: "  " } },
      }),
      "group-workshop"
    );

    expect(load.ok).toBe(false);
    expect(load.failure).toBe("identity");
  });

  test("keeps a genuine empty collection as zeros from the response", async () => {
    const load = await loadCollectionOverview(
      client({
        stats: {
          data: { totalItemPrice: 0, totalItems: 0, totalLocations: 0, totalTags: 0 },
        },
        group: { data: { name: "Spare room", currency: "GBP" } },
      }),
      "group-spare"
    );

    expect(load.ok).toBe(true);
    expect(load.stats && isEmptyCollection(load.stats)).toBe(true);
    expect(load.stats?.currency).toBe("GBP");
    expect(load.stats?.name).toBe("Spare room");
  });
});

describe("overview phases", () => {
  test("distinguishes loading, error, empty and a populated collection", () => {
    expect(
      classifyOverview({
        activeId: "group-workshop",
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: true,
        load: ready(workshop),
      })
    ).toBe("loading");

    expect(
      classifyOverview({
        activeId: "group-workshop",
        selectionMismatch: true,
        collectionsPending: false,
        requestPending: false,
        load: ready(workshop),
      })
    ).toBe("loading");

    expect(
      classifyOverview({
        activeId: "group-workshop",
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: false,
        load: { collectionId: "group-other", ok: true, failure: null, stats: workshop },
      })
    ).toBe("loading");

    expect(
      classifyOverview({
        activeId: "group-workshop",
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: false,
        load: { collectionId: "group-workshop", ok: false, failure: "stats", stats: null },
      })
    ).toBe("error");

    expect(
      classifyOverview({
        activeId: null,
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: false,
        load: null,
      })
    ).toBe("no-collection");

    expect(
      classifyOverview({
        activeId: "group-spare",
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: false,
        load: ready({
          collectionId: "group-spare",
          name: "Spare room",
          currency: "GBP",
          totalValue: 0,
          itemCount: 0,
          locationCount: 0,
          tagCount: 0,
        }),
      })
    ).toBe("empty");

    expect(
      classifyOverview({
        activeId: "group-workshop",
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: false,
        requestFailed: true,
        load: null,
      })
    ).toBe("error");

    expect(
      classifyOverview({
        activeId: workshop.collectionId,
        selectionMismatch: false,
        collectionsPending: false,
        requestPending: false,
        load: ready(workshop),
      })
    ).toBe("ready");
  });

  test("waits while the selector and the tenant preference disagree", () => {
    expect(resolveActiveCollectionId("a", "b")).toBeNull();
    expect(resolveActiveCollectionId("a", "a")).toBe("a");
    expect(resolveActiveCollectionId(null, "b")).toBe("b");
  });
});

describe("currency formatting", () => {
  test("formats with the collection currency rather than a dollar sample", () => {
    const formatted = formatCollectionValue(2480, "EUR", "en-US");
    expect(formatted).not.toContain("$");
    expect(formatted).not.toBe("");
    expect(formatCollectionValue(10, "", "en-US")).toBe("");
  });
});

describe("home overview page", () => {
  test("uses the shell materials, live heading and existing create dialog", () => {
    expect(page).toContain("glass-page");
    expect(page).toContain("glass-title");
    expect(page).toContain("glass-eyebrow");
    expect(page).toContain("glass-panel");
    expect(page).toContain('variant="action"');
    expect(page).toContain("DialogID.CreateEntity");
    expect(page).toContain('baseType: "item"');
    expect(page).toContain('data-testid="home-create"');
    expect(page).toContain('data-testid="home-stats-loading"');
    expect(page).toContain('data-testid="home-stats-error"');
    expect(page).toContain('data-testid="home-stats-empty"');
    expect(page).toContain('data-testid="home-no-collection"');
    expect(page).not.toContain("DialogID.Scanner");
    expect(page).not.toContain("2480");
    expect(page).not.toContain("Cordless");
    expect(page).not.toContain("$2,480");
    expect(en).toContain('"eyebrow": "A place for everything"');
    expect(en).toContain('"stat_value": "Total value"');
  });

  test("refreshes statistics on collection scope and inventory mutations", () => {
    expect(statistics).toContain("home-overview:");
    expect(statistics).toContain("watch: [activeId]");
    expect(statistics).toContain("getCachedData: () => undefined");
    expect(statistics).toContain("ServerEvent.EntityMutation");
    expect(statistics).toContain("ServerEvent.TagMutation");
    expect(statistics).toContain("ServerEvent.ImportMutation");
    expect(statistics).toContain("resetCurrency");
    expect(statistics).toContain("setCurrency");
    expect(selector).toContain("window.location.reload()");
    expect(layout).toContain('data-testid="shell-scan"');
    expect(layout).toContain("DialogID.Scanner");
    expect(layout).toContain("DialogID.CreateEntity");
  });
});
