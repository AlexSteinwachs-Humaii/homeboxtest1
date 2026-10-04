import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  classifyOverview,
  formatCollectionValue,
  isEmptyCollection,
  loadCollectionOverview,
  resolveActiveCollectionId,
  type OverviewClient,
  type OverviewLoad,
} from "./overview";

const collectionId = "11111111-1111-1111-1111-111111111111";

function group(overrides: Partial<{ id: string; name: string; currency: string }> = {}) {
  return {
    id: collectionId,
    name: "Workshop",
    currency: "EUR",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function stats(
  overrides: Partial<{ totalItemPrice: number; totalItems: number; totalLocations: number; totalTags: number }> = {}
) {
  return {
    totalItemPrice: 1250,
    totalItems: 8,
    totalLocations: 3,
    totalTags: 2,
    totalUsers: 1,
    totalWithWarranty: 0,
    ...overrides,
  };
}

function client(options: {
  group?: Awaited<ReturnType<OverviewClient["group"]["get"]>> | Error;
  stats?: Awaited<ReturnType<OverviewClient["stats"]["group"]>> | Error;
  seen?: string[];
}): OverviewClient {
  return {
    group: {
      get: async id => {
        options.seen?.push(`group:${id ?? ""}`);
        if (options.group instanceof Error) {
          throw options.group;
        }
        return options.group ?? { error: false, data: group() };
      },
    },
    stats: {
      group: async id => {
        options.seen?.push(`stats:${id ?? ""}`);
        if (options.stats instanceof Error) {
          throw options.stats;
        }
        return options.stats ?? { error: false, data: stats() };
      },
    },
  };
}

describe("resolveActiveCollectionId", () => {
  test("uses the only id that is set", () => {
    expect(resolveActiveCollectionId(null, collectionId)).toEqual({ status: "ready", id: collectionId });
    expect(resolveActiveCollectionId(collectionId, null)).toEqual({ status: "ready", id: collectionId });
  });

  test("refuses a selector and preference that disagree", () => {
    expect(resolveActiveCollectionId(collectionId, "22222222-2222-2222-2222-222222222222")).toEqual({
      status: "mismatch",
    });
  });

  test("is none when both are blank", () => {
    expect(resolveActiveCollectionId("  ", null)).toEqual({ status: "none" });
  });
});

describe("classifyOverview", () => {
  const readyLoad: OverviewLoad = {
    collectionId,
    group: { id: collectionId, name: "Workshop", currency: "EUR" },
    groupOk: true,
    stats: { totalItemPrice: 1250, totalItems: 8, totalLocations: 3, totalTags: 2 },
    statsOk: true,
  };

  test("does not invent zeros while loading or when the request failed", () => {
    expect(
      classifyOverview({
        resolution: { status: "ready", id: collectionId },
        pending: true,
        failed: false,
        load: null,
      }).phase
    ).toBe("loading");

    const failed = classifyOverview({
      resolution: { status: "ready", id: collectionId },
      pending: false,
      failed: true,
      load: null,
    });
    expect(failed.phase).toBe("error");
    expect(failed.stats).toBeNull();
  });

  test("an incomplete payload is an error, not an empty collection", () => {
    const view = classifyOverview({
      resolution: { status: "ready", id: collectionId },
      pending: false,
      failed: false,
      load: { ...readyLoad, stats: null, statsOk: false },
    });
    expect(view.phase).toBe("error");
    expect(view.stats).toBeNull();
  });

  test("keeps the previous collection off screen after a switch", () => {
    const view = classifyOverview({
      resolution: { status: "ready", id: "33333333-3333-3333-3333-333333333333" },
      pending: true,
      failed: false,
      load: readyLoad,
    });
    expect(view.phase).toBe("loading");
    expect(view.identity).toBeNull();
    expect(view.stats).toBeNull();
  });

  test("shows genuine zeros for an empty collection and keeps them during a same-collection refresh", () => {
    const empty: OverviewLoad = {
      ...readyLoad,
      stats: { totalItemPrice: 0, totalItems: 0, totalLocations: 0, totalTags: 0 },
    };
    expect(isEmptyCollection(empty.stats!)).toBe(true);
    expect(
      classifyOverview({
        resolution: { status: "ready", id: collectionId },
        pending: true,
        failed: false,
        load: empty,
      })
    ).toMatchObject({ phase: "empty", stats: empty.stats });
  });

  test("a mismatch is loading, and no selection is not an empty inventory", () => {
    expect(
      classifyOverview({ resolution: { status: "mismatch" }, pending: false, failed: false, load: readyLoad }).phase
    ).toBe("loading");
    expect(
      classifyOverview({ resolution: { status: "none" }, pending: false, failed: false, load: readyLoad })
    ).toEqual({ phase: "no-collection", identity: null, stats: null });
  });
});

describe("loadCollectionOverview", () => {
  test("reads the named collection and keeps its currency", async () => {
    const seen: string[] = [];
    const load = await loadCollectionOverview(client({ seen }), collectionId);
    expect(seen).toEqual([`group:${collectionId}`, `stats:${collectionId}`]);
    expect(load.groupOk).toBe(true);
    expect(load.statsOk).toBe(true);
    expect(load.group).toEqual({ id: collectionId, name: "Workshop", currency: "EUR" });
    expect(load.stats?.totalItemPrice).toBe(1250);
  });

  test("rejects a group that is not the requested collection", async () => {
    const load = await loadCollectionOverview(
      client({
        group: { error: false, data: group({ id: "99999999-9999-9999-9999-999999999999" }) },
      }),
      collectionId
    );
    expect(load.groupOk).toBe(false);
    expect(load.group).toBeNull();
  });

  test("a rejected request is not a zero inventory", async () => {
    const load = await loadCollectionOverview(client({ stats: new Error("network") }), collectionId);
    expect(load.statsOk).toBe(false);
    expect(load.stats).toBeNull();
    expect(load.groupOk).toBe(true);
  });

  test("an error response is not treated as data", async () => {
    const load = await loadCollectionOverview(
      client({
        stats: { error: true, data: stats({ totalItems: 0, totalItemPrice: 0, totalLocations: 0, totalTags: 0 }) },
      }),
      collectionId
    );
    expect(load.statsOk).toBe(false);
    expect(load.stats).toBeNull();
  });
});

describe("formatCollectionValue", () => {
  test("formats the collection currency rather than a sample dollar total", () => {
    const formatted = formatCollectionValue(1250, "eur", "en-US");
    expect(formatted).toContain("1,250.00");
    expect(formatted).toContain("€");
    expect(formatted).not.toContain("2,480");
  });

  test("formats a genuine zero", () => {
    expect(formatCollectionValue(0, "USD", "en-US")).toBe("$0.00");
  });

  test("does not invent a currency code", () => {
    expect(formatCollectionValue(10, "dollars", "en-US")).toBe("");
  });
});

describe("home overview page", () => {
  const page = readFileSync(resolve(__dirname, "index.vue"), "utf8");
  const statistics = readFileSync(resolve(__dirname, "statistics.ts"), "utf8");
  const layout = readFileSync(resolve(__dirname, "../../layouts/default.vue"), "utf8");

  test("uses the live overview, the existing create dialog, and not artboard samples", () => {
    expect(page).toContain("useHomeOverview");
    expect(page).toContain("DialogID.CreateEntity");
    expect(page).toContain('baseType: "item"');
    expect(page).toContain('data-testid="home-stats"');
    expect(page).toContain('variant="action"');
    expect(page).not.toContain("2,480");
    expect(page).not.toContain("2480");
    expect(statistics).not.toContain("|| 0");
    expect(layout).toContain("DialogID.Scanner");
  });
});
