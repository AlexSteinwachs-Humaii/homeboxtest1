import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import {
  RECENT_ITEMS_LIMIT,
  RECENT_ITEMS_QUERY,
  RECENT_VIEW_ALL,
  classifyRecent,
  hasAdditionalRecent,
  loadRecentItems,
  orderRecentItems,
  presentRecentItem,
  presentRecentValue,
  recentItemHref,
  recentPhotoPath,
  takeRecentItems,
  type RecentClient,
  type RecentLoad,
} from "./recent";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "index.vue"), "utf8");
const table = readFileSync(resolve(here, "table.ts"), "utf8");
const card = readFileSync(resolve(here, "../../components/Item/Card.vue"), "utf8");
const en = readFileSync(resolve(here, "../../locales/en.json"), "utf8");

function item(partial: Partial<EntitySummary> & { id: string }): EntitySummary {
  return {
    archived: false,
    assetId: "000-001",
    createdAt: "2026-01-01T00:00:00Z",
    description: "",
    insured: false,
    itemCount: 0,
    name: "Item",
    purchasePrice: 10,
    quantity: 1,
    soldDate: "",
    tags: [],
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("recent item ordering", () => {
  test("keeps created-date order, newest first, and only the visible three", () => {
    const rows = [
      item({ id: "older", createdAt: "2026-01-01T00:00:00Z", name: "Older" }),
      item({ id: "newest", createdAt: "2026-03-01T00:00:00Z", name: "Newest" }),
      item({ id: "middle", createdAt: "2026-02-01T00:00:00Z", name: "Middle" }),
      item({ id: "tied-a", createdAt: "2026-03-01T00:00:00Z", name: "Tied A" }),
      item({ id: "undated", createdAt: "", name: "Undated" }),
    ];
    const ordered = takeRecentItems(orderRecentItems(rows));
    expect(ordered.map(row => row.id)).toEqual(["newest", "tied-a", "middle"]);
    expect(ordered).toHaveLength(RECENT_ITEMS_LIMIT);
    expect(ordered.map(row => row.name)).not.toContain("Cordless drill");
  });
});

describe("recent item presentation", () => {
  test("uses the real id, asset id, quantity, location and collection currency", () => {
    const view = presentRecentItem(
      item({
        id: "item-42",
        name: "Cordless drill that was typed in, not drawn",
        assetId: "000-042",
        quantity: 2,
        purchasePrice: 129,
        parent: item({ id: "loc-garage", name: "Garage" }),
        thumbnailId: "thumb-1",
        imageId: "image-1",
      }),
      "EUR",
      "en-US"
    );

    expect(view.id).toBe("item-42");
    expect(view.href).toBe("/item/item-42");
    expect(recentItemHref("item-42")).toBe("/item/item-42");
    expect(view.name).toContain("Cordless drill that was typed in");
    expect(view.assetId).toBe("000-042");
    expect(view.quantity).toBe(2);
    expect(view.location).toBe("Garage");
    expect(view.value).not.toContain("$");
    expect(view.value).toContain("129");
    expect(view.photoPath).toBe("/entities/item-42/attachments/thumb-1");
  });

  test("prefers the thumbnail, then the original, and never invents a photo", () => {
    expect(recentPhotoPath({ id: "a", thumbnailId: " thumb ", imageId: "image" })).toBe(
      "/entities/a/attachments/thumb"
    );
    expect(recentPhotoPath({ id: "a", thumbnailId: "", imageId: "image-9" })).toBe("/entities/a/attachments/image-9");
    expect(recentPhotoPath({ id: "a", thumbnailId: null, imageId: "  " })).toBeNull();
    expect(recentPhotoPath({ id: "a" })).toBeNull();
    expect(JSON.stringify(recentPhotoPath({ id: "a" }))).not.toContain("no-image");
  });

  test("omits missing fields and does not shorten a long name", () => {
    const longName = "A".repeat(180);
    const view = presentRecentItem(
      item({
        id: "bare",
        name: `  ${longName}  `,
        assetId: "000-000",
        quantity: Number.NaN,
        purchasePrice: Number.NaN,
        parent: null,
        imageId: null,
        thumbnailId: null,
      }),
      "",
      "en-US"
    );

    expect(view.name).toBe(longName);
    expect(view.nameMissing).toBe(false);
    expect(view.assetId).toBeNull();
    expect(view.quantity).toBeNull();
    expect(view.location).toBeNull();
    expect(view.value).toBeNull();
    expect(view.photoPath).toBeNull();
    expect(presentRecentItem(item({ id: "blank", name: "   ", assetId: "0" }), "USD", "en-US").nameMissing).toBe(true);
    expect(presentRecentValue(12, "USD", "en-US")).not.toBe("");
    expect(presentRecentValue(12, "US", "en-US")).toBeNull();
  });

  test("formats a real zero purchase price with the collection currency", () => {
    const view = presentRecentItem(item({ id: "gift", purchasePrice: 0 }), "GBP", "en-GB");
    expect(view.value).not.toContain("$");
    expect(view.value).not.toBeNull();
  });
});

describe("recent item loading", () => {
  test("asks for createdAt order and does not treat a failure as no items", async () => {
    const seen: { query?: unknown } = {};
    const client: RecentClient = {
      items: {
        getAll: query => {
          seen.query = query;
          return Promise.resolve({
            error: false,
            data: {
              total: 8,
              items: [
                item({ id: "c", createdAt: "2026-01-03T00:00:00Z" }),
                item({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
                item({ id: "b", createdAt: "2026-01-02T00:00:00Z" }),
                item({ id: "d", createdAt: "2026-01-04T00:00:00Z" }),
                {
                  id: "room",
                  entityType: { isLocation: true },
                } as unknown as EntitySummary,
              ],
            },
          });
        },
      },
    };

    const load = await loadRecentItems(client, "group-1");
    expect(seen.query).toEqual(RECENT_ITEMS_QUERY);
    expect(load.ok).toBe(true);
    expect(load.items.map(row => row.id)).toEqual(["d", "c", "b"]);
    expect(hasAdditionalRecent(load)).toBe(true);
    expect(RECENT_VIEW_ALL).toBe("/items");

    const failed = await loadRecentItems(
      {
        items: {
          getAll: () => Promise.resolve({ error: true, data: { items: [], total: 0 } }),
        },
      },
      "group-1"
    );
    expect(failed.ok).toBe(false);
    expect(failed.items).toEqual([]);

    const thrown = await loadRecentItems(
      {
        items: {
          getAll: () => Promise.reject(new Error("down")),
        },
      },
      "group-1"
    );
    expect(thrown.failure).toBe("items");

    const skipped = await loadRecentItems(client, null);
    expect(skipped.failure).toBe("no-collection");
    expect(seen.query).toEqual(RECENT_ITEMS_QUERY);
  });

  test("distinguishes loading, error, empty and a ready row", () => {
    const ready: RecentLoad = {
      collectionId: "group-1",
      ok: true,
      failure: null,
      items: [item({ id: "a" })],
      total: 4,
    };
    expect(
      classifyRecent({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: true,
        load: ready,
      })
    ).toBe("loading");
    expect(
      classifyRecent({
        activeId: "group-1",
        selectionMismatch: true,
        requestPending: false,
        load: ready,
      })
    ).toBe("loading");
    expect(
      classifyRecent({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        requestFailed: true,
        load: null,
      })
    ).toBe("error");
    expect(
      classifyRecent({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: { ...ready, ok: false, failure: "items", items: [] },
      })
    ).toBe("error");
    expect(
      classifyRecent({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: { ...ready, items: [] },
      })
    ).toBe("empty");
    expect(
      classifyRecent({
        activeId: null,
        selectionMismatch: false,
        requestPending: false,
        load: null,
      })
    ).toBe("no-collection");
    expect(
      classifyRecent({
        activeId: "group-1",
        selectionMismatch: false,
        requestPending: false,
        load: ready,
      })
    ).toBe("ready");
  });
});

describe("home recent items page", () => {
  test("renders the three-card row, real links and truthful states", () => {
    expect(page).toContain("md:grid-cols-3");
    expect(page).toContain("grid-cols-1");
    expect(page).toContain("sm:grid-cols-2");
    expect(page).toContain('variant="overview"');
    expect(page).toContain("RECENT_VIEW_ALL");
    expect(page).toContain('data-testid="home-recent-view-all"');
    expect(page).toContain('data-testid="home-recent-loading"');
    expect(page).toContain('data-testid="home-recent-error"');
    expect(page).toContain('data-testid="home-recent-empty"');
    expect(page).toContain('data-testid="home-recent-retry"');
    expect(page).not.toContain("Item/View/Table.vue");
    expect(page).not.toContain("no-image.jpg");
    expect(page).not.toContain("Cordless");
    expect(table).toContain("loadRecentItems");
    expect(table).toContain("home-recent:");
    expect(table).toContain("getCachedData: () => undefined");
    expect(table).toContain("ServerEvent.EntityMutation");
    expect(table).toContain("ServerEvent.ImportMutation");
    expect(card).toContain("home-recent-no-photo");
    expect(card).toContain("home-recent-photo");
    expect(card).toContain("detail.photoPath");
    expect(card).toContain("authURL");
    expect(card).toContain(':to="detail.href"');
    expect(en).toContain('"view_all": "View all"');
    expect(en).toContain('"recent_no_photo": "No photo"');
    expect(RECENT_VIEW_ALL).toBe("/items");
  });
});
