import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import {
  RECENT_PAGE_SIZE,
  RECENT_QUERY,
  RECENT_VIEW_ALL,
  classifyRecent,
  displayAssetId,
  loadRecentItems,
  presentRecentItems,
  type RecentClient,
  type RecentLoad,
} from "./recent";

const collectionId = "11111111-1111-1111-1111-111111111111";

function item(overrides: Partial<EntitySummary> = {}): EntitySummary {
  return {
    id: "item-1",
    name: "Cordless drill",
    assetId: "000-042",
    quantity: 1,
    purchasePrice: 129,
    createdAt: "2026-03-02T12:00:00Z",
    updatedAt: "2026-03-02T12:00:00Z",
    archived: false,
    description: "",
    insured: false,
    itemCount: 0,
    soldDate: "0001-01-01T00:00:00Z",
    tags: [],
    parent: { id: "loc-1", name: "Garage" } as EntitySummary,
    imageId: null,
    thumbnailId: null,
    ...overrides,
  };
}

function client(options: {
  result?: Awaited<ReturnType<RecentClient["items"]["getAll"]>> | Error;
  seen?: unknown[];
}): RecentClient {
  return {
    items: {
      getAll: async query => {
        options.seen?.push(query);
        if (options.result instanceof Error) {
          throw options.result;
        }
        return options.result ?? { error: false, data: { items: [item()], total: 1 } };
      },
    },
  };
}

describe("presentRecentItems", () => {
  test("keeps created-date order and only the three newest", () => {
    const cards = presentRecentItems(
      [
        item({ id: "older", name: "Older", createdAt: "2026-01-01T00:00:00Z" }),
        item({ id: "newest", name: "Newest", createdAt: "2026-04-01T00:00:00Z" }),
        item({ id: "middle", name: "Middle", createdAt: "2026-02-01T00:00:00Z" }),
        item({ id: "fourth", name: "Fourth", createdAt: "2025-12-01T00:00:00Z" }),
      ],
      "EUR",
      "en-US"
    );

    expect(cards.map(card => card.id)).toEqual(["newest", "middle", "older"]);
    expect(cards).toHaveLength(RECENT_PAGE_SIZE);
    expect(cards[0]?.href).toBe("/item/newest");
  });

  test("skips location records without inventing a replacement", () => {
    const cards = presentRecentItems(
      [
        item({
          id: "garage",
          name: "Garage",
          createdAt: "2026-05-01T00:00:00Z",
          entityType: { isLocation: true } as EntitySummary["entityType"],
        }),
        item({ id: "drill", name: "Cordless drill", createdAt: "2026-04-01T00:00:00Z" }),
      ],
      "USD",
      "en-US"
    );

    expect(cards.map(card => card.id)).toEqual(["drill"]);
  });

  test("shows real identifying fields and collection currency, including a zero price", () => {
    const [card] = presentRecentItems(
      [
        item({
          assetId: "000-042",
          quantity: 0,
          purchasePrice: 0,
          parent: { id: "loc", name: "  Kitchen  " } as EntitySummary,
        }),
      ],
      "eur",
      "en-US"
    );

    expect(card?.name).toBe("Cordless drill");
    expect(card?.assetId).toBe("000-042");
    expect(card?.quantity).toBe(0);
    expect(card?.location).toBe("Kitchen");
    expect(card?.value).toContain("€");
    expect(card?.value).toContain("0.00");
    expect(card?.value).not.toContain("$");
  });

  test("uses the thumbnail, then the original, and a none fallback when both are absent", () => {
    const [withThumb] = presentRecentItems(
      [item({ id: "a", thumbnailId: "thumb-1", imageId: "orig-1" })],
      "USD",
      "en-US"
    );
    const [originalOnly] = presentRecentItems([item({ id: "b", imageId: "orig-2" })], "USD", "en-US");
    const [missing] = presentRecentItems([item({ id: "c", imageId: "  ", thumbnailId: null })], "USD", "en-US");

    expect(withThumb?.photo).toEqual({ kind: "upload", path: "/entities/a/attachments/thumb-1" });
    expect(originalOnly?.photo).toEqual({ kind: "upload", path: "/entities/b/attachments/orig-2" });
    expect(missing?.photo).toEqual({ kind: "none" });
  });

  test("omits missing fields instead of fabricating them", () => {
    const [card] = presentRecentItems(
      [
        item({
          name: "  ",
          assetId: "000-000",
          quantity: Number.NaN,
          purchasePrice: Number.NaN,
          parent: undefined,
        }),
      ],
      "USD",
      "en-US"
    );

    expect(card?.name).toBe("");
    expect(card?.assetId).toBeNull();
    expect(card?.quantity).toBeNull();
    expect(card?.location).toBeNull();
    expect(card?.value).toBeNull();
    expect(displayAssetId("")).toBeNull();
    expect(displayAssetId("0")).toBeNull();
  });

  test("does not invent a currency when the collection code is unknown", () => {
    const [card] = presentRecentItems([item({ purchasePrice: 45 })], "", "en-US");
    expect(card?.value).toBeNull();
  });

  test("keeps a long name intact for the card to clamp", () => {
    const name = "A very long inventory name that must not be rewritten or overlapped";
    const [card] = presentRecentItems([item({ name })], "USD", "en-US");
    expect(card?.name).toBe(name);
  });
});

describe("classifyRecent", () => {
  const load: RecentLoad = { collectionId, ok: true, items: [item()], total: 4 };

  test("distinguishes loading, empty, error and no collection", () => {
    expect(classifyRecent({ resolution: { status: "none" }, pending: false, failed: false, load: null })).toBe(
      "no-collection"
    );
    expect(
      classifyRecent({ resolution: { status: "ready", id: collectionId }, pending: true, failed: false, load: null })
    ).toBe("loading");
    expect(
      classifyRecent({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: true,
        load: null,
      })
    ).toBe("error");
    expect(
      classifyRecent({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: false,
        load: { collectionId, ok: true, items: [], total: 0 },
      })
    ).toBe("empty");
    expect(
      classifyRecent({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: false,
        load,
      })
    ).toBe("ready");
  });

  test("does not keep another collection's cards", () => {
    expect(
      classifyRecent({
        resolution: { status: "ready", id: "22222222-2222-2222-2222-222222222222" },
        pending: true,
        failed: false,
        load,
      })
    ).toBe("loading");
  });

  test("an incomplete payload is an error, not an empty inventory", () => {
    expect(
      classifyRecent({
        resolution: { status: "ready", id: collectionId },
        pending: false,
        failed: false,
        load: { collectionId, ok: false, items: [], total: 0 },
      })
    ).toBe("error");
  });
});

describe("loadRecentItems", () => {
  test("requests the newest page and keeps the total for view-all", async () => {
    const seen: unknown[] = [];
    const load = await loadRecentItems(
      client({
        seen,
        result: { error: false, data: { items: [item(), item({ id: "two" })], total: 9 } },
      }),
      collectionId
    );

    expect(seen).toEqual([RECENT_QUERY]);
    expect(RECENT_QUERY).toEqual({ page: 1, pageSize: 3, orderBy: "createdAt" });
    expect(load.ok).toBe(true);
    expect(load.items).toHaveLength(2);
    expect(load.total).toBe(9);
    expect(RECENT_VIEW_ALL).toBe("/items");
  });

  test("a rejected or error response is not an empty list", async () => {
    const rejected = await loadRecentItems(client({ result: new Error("network") }), collectionId);
    expect(rejected.ok).toBe(false);
    expect(rejected.items).toEqual([]);

    const errored = await loadRecentItems(
      client({ result: { error: true, data: { items: [], total: 0 } } }),
      collectionId
    );
    expect(errored.ok).toBe(false);
  });
});

describe("home recent page", () => {
  const page = readFileSync(resolve(__dirname, "index.vue"), "utf8");
  const table = readFileSync(resolve(__dirname, "table.ts"), "utf8");
  const recent = readFileSync(resolve(__dirname, "recent.ts"), "utf8");
  const card = readFileSync(resolve(__dirname, "../../components/Item/Card.vue"), "utf8");
  const overviewCard = card.slice(0, card.indexOf('data-variant="default"'));

  test("renders a three-card overview row that links to the real records", () => {
    expect(page).toContain("useHomeRecent");
    expect(page).toContain("RECENT_VIEW_ALL");
    expect(page).toContain('variant="overview"');
    expect(page).toContain("md:grid-cols-3");
    expect(page).toContain('data-testid="home-recent-view-all"');
    expect(page).not.toContain("components/Item/View/Table.vue");
    expect(table).toContain("home-recent:");
    expect(table).toContain("ServerEvent.EntityMutation");
    expect(table).toContain("ServerEvent.ImportMutation");
    expect(table).toContain("getCachedData: () => undefined");
    expect(recent).toContain('orderBy: "createdAt"');
    expect(recent).toContain("pageSize: RECENT_PAGE_SIZE");
    expect(overviewCard).toContain('data-testid="home-recent-no-photo"');
    expect(overviewCard).toContain("detail.href");
    expect(overviewCard).toContain('data-testid="home-recent-card"');
    expect(overviewCard).not.toContain("no-image.jpg");
    expect(overviewCard).not.toContain("/location/");
    expect(card).toContain("no-image.jpg");
  });
});
