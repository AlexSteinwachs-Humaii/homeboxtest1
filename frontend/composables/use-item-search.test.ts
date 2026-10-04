import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useItemSearch } from "./use-item-search";
import type { UserClient } from "~~/lib/api/user";

function fixture(getAll = vi.fn().mockResolvedValue({ data: { items: [] } })) {
  const scope = effectScope();
  const search = scope.run(() => useItemSearch({ items: { getAll } } as unknown as UserClient))!;
  return { scope, search, getAll };
}

describe("inventory lifecycle search", () => {
  it("defaults to active and forwards history alongside existing filters", async () => {
    const f = fixture();
    await f.search.triggerSearch();
    expect(f.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ onlyOffboarded: false, includeArchived: false })
    );
    f.search.query.value = "laptop";
    f.search.onlyOffboarded.value = true;
    f.search.includeArchived.value = true;
    f.search.locations.value = [{ id: "location" }] as typeof f.search.locations.value;
    f.search.tags.value = [{ id: "tag" }] as typeof f.search.tags.value;
    await f.search.triggerSearch();
    expect(f.getAll).toHaveBeenLastCalledWith({
      q: "laptop",
      onlyOffboarded: true,
      includeArchived: true,
      parentIds: ["location"],
      tags: ["tag"],
    });
    f.scope.stop();
  });

  it("reruns when the lifecycle changes during a pending request", async () => {
    let resolve!: (value: unknown) => void;
    const getAll = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(r => {
            resolve = r;
          })
      )
      .mockResolvedValue({ data: { items: [{ id: "historical", disposed: true }] } });
    const f = fixture(getAll);
    const first = f.search.triggerSearch();
    f.search.onlyOffboarded.value = true;
    await f.search.triggerSearch();
    resolve({ data: { items: [{ id: "active" }] } });
    await first;
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(getAll).toHaveBeenLastCalledWith(expect.objectContaining({ onlyOffboarded: true }));
    expect(f.search.results.value[0].id).toBe("historical");
    f.scope.stop();
  });
});
