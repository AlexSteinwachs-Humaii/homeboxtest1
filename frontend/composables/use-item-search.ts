import { ref, nextTick } from "vue";
import { watchDebounced } from "@vueuse/core";
import type { EntitySummary, TagSummary } from "~~/lib/api/types/data-contracts";
import type { UserClient } from "~~/lib/api/user";

type SearchOptions = {
  immediate?: boolean;
};

export function useItemSearch(client: UserClient, opts?: SearchOptions) {
  const query = ref("");
  const locations = ref<EntitySummary[]>([]);
  const tags = ref<TagSummary[]>([]);
  const results = ref<EntitySummary[]>([]);
  const includeArchived = ref(false);
  const onlyOffboarded = ref(false);
  const isLoading = ref(false);
  let pendingSearch = false;

  watchDebounced([query, locations, tags, includeArchived, onlyOffboarded], search, { debounce: 250, maxWait: 1000 });
  async function search(): Promise<boolean> {
    if (isLoading.value) {
      // Queue the latest filters to run after the current search completes
      pendingSearch = true;
      return false;
    }

    const searchQuery = query.value;
    isLoading.value = true;
    try {
      const locIds = locations.value.map(l => l.id);
      const tagIds = tags.value.map(t => t.id);

      const { data, error } = await client.items.getAll({
        q: searchQuery,
        parentIds: locIds,
        tags: tagIds,
        includeArchived: includeArchived.value,
        onlyOffboarded: onlyOffboarded.value,
      });

      if (error || !data) {
        console.error("useItemSearch.search error:", error);
        return false;
      }

      results.value = data.items ?? [];
      return true;
    } finally {
      isLoading.value = false;

      // Re-run even when only a lifecycle or other filter changed in flight.
      if (pendingSearch) {
        pendingSearch = false;
        await nextTick();
        await search();
      }
    }
  }

  async function triggerSearch(): Promise<boolean> {
    try {
      return await search();
    } catch (err) {
      console.error("triggerSearch error:", err);
      return false;
    }
  }

  if (opts?.immediate) {
    search()
      .then(success => {
        if (!success) {
          console.error("Initial search failed");
        }
      })
      .catch(err => {
        console.error("Initial search error:", err);
      });
  }

  return {
    query,
    results,
    locations,
    tags,
    includeArchived,
    onlyOffboarded,
    isLoading,
    triggerSearch,
  };
}
