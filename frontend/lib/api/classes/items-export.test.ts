import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemsApi } from "./items";
import { Requests } from "../../requests";

const csv = "HB.name,HB.description\n";
afterEach(() => vi.unstubAllGlobals());

describe("filtered inventory CSV request", () => {
  it("pins collection and sends only basic filters without pagination", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(csv, { headers: { "Content-Type": "text/csv" } }));
    vi.stubGlobal("fetch", fetcher);
    const api = new ItemsApi(new Requests("", "Bearer test", { "X-Tenant": "old" }), "");
    const filters = {
      q: "#123",
      parentIds: ["loc1", "loc2"],
      tags: ["tag1", "tag2"],
      includeArchived: true,
      pageSize: 1,
    };
    expect(await (await api.exportFilteredCSV(filters, "active")).text()).toBe(csv);
    const [url, init] = fetcher.mock.calls[0]!;
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("filtered")).toBe("true");
    expect(params.get("q")).toBe("#123");
    expect(params.getAll("parentIds")).toEqual(["loc1", "loc2"]);
    expect(params.getAll("tags")).toEqual(["tag1", "tag2"]);
    expect(params.get("includeArchived")).toBe("true");
    expect(params.get("tenant")).toBe("active");
    expect(params.has("pageSize")).toBe(false);
    expect(init.headers).toMatchObject({ "X-Tenant": "active", Authorization: "Bearer test" });
  });

  it("defaults to nonarchived and accepts a header-only CSV", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetcher);
    const api = new ItemsApi(new Requests("", "", { "X-Tenant": "old" }), "");
    expect(await (await api.exportFilteredCSV({})).text()).toBe(csv);
    expect(fetcher.mock.calls[0]![0]).toContain("includeArchived=false");
    expect(fetcher.mock.calls[0]![1].headers["X-Tenant"]).toBe("");
    expect(api.exportURL("collection")).toBe("/api/v1/entities/export?tenant=collection");
    expect(api.exportURL()).toBe("/api/v1/entities/export");
  });

  it.each([400, 401, 403, 500, 200])("rejects error/non-CSV responses (%s)", async status => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"error":"failed"}', {
          status,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const api = new ItemsApi(new Requests(""), "");
    await expect(api.exportFilteredCSV({})).rejects.toThrow(`Inventory export failed (${status})`);
  });

  it("propagates network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(new ItemsApi(new Requests(""), "").exportFilteredCSV({})).rejects.toThrow("offline");
  });
});
