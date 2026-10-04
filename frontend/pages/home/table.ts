import { computed } from "vue";
import { useCollections } from "~~/composables/use-collections";
import { getLocaleCode } from "~~/composables/use-formatters";
import { ServerEvent, onServerEvent } from "~~/composables/use-server-events";
import { useViewPreferences } from "~~/composables/use-preferences";
import { resolveActiveCollectionId, type CollectionResolution } from "./overview";
import { classifyRecent, loadRecentItems, presentRecentItems, type RecentLoad } from "./recent";

/**
 * The three newest items for My Home.
 * Keyed by collection so a switch cannot reuse another collection's cards.
 * Failed requests stay errors — they are not coerced into an empty list.
 * The items client uses the preference tenant; a selector/preference mismatch is not rendered.
 */
export function useHomeRecent(currency: () => string) {
  const { selectedId } = useCollections();
  const prefs = useViewPreferences();

  const resolution = computed(() => resolveActiveCollectionId(selectedId.value, prefs.value.collectionId));
  const activeId = computed(() => (resolution.value.status === "ready" ? resolution.value.id : null));

  const { data, status, error, refresh } = useAsyncData(
    () => `home-recent:${activeId.value ?? resolution.value.status}`,
    async () => {
      const current: CollectionResolution = resolveActiveCollectionId(selectedId.value, prefs.value.collectionId);
      if (current.status !== "ready") {
        return null;
      }
      const api = useUserApi();
      return loadRecentItems(api, current.id);
    },
    {
      watch: [selectedId, () => prefs.value.collectionId],
      getCachedData: () => undefined,
    }
  );

  const phase = computed(() =>
    classifyRecent({
      resolution: resolution.value,
      pending: status.value === "pending" || status.value === "idle",
      failed: status.value === "error" || error.value != null,
      load: (data.value as RecentLoad | null) ?? null,
    })
  );

  const cards = computed(() => {
    if (phase.value !== "ready") {
      return [];
    }
    const load = data.value as RecentLoad | null;
    if (!load?.ok) {
      return [];
    }
    return presentRecentItems(load.items, currency(), getLocaleCode());
  });

  const refreshRecent = () => {
    void refresh();
  };

  onServerEvent(ServerEvent.EntityMutation, refreshRecent);
  onServerEvent(ServerEvent.ImportMutation, refreshRecent);

  return {
    resolution,
    activeId,
    phase,
    cards,
    refresh,
  };
}
