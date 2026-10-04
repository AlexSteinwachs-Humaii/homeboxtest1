import { computed, onMounted, watch } from "vue";
import { useCollections } from "~~/composables/use-collections";
import { resetCurrency, setCurrency } from "~~/composables/use-formatters";
import { ServerEvent, onServerEvent } from "~~/composables/use-server-events";
import { useViewPreferences } from "~~/composables/use-preferences";
import { classifyOverview, loadCollectionOverview, resolveActiveCollectionId, type OverviewLoad } from "./overview";

/**
 * Live collection identity and statistics for My Home.
 * Keyed by collection so a switch cannot reuse another collection's payload.
 * Failed requests stay errors — they are not coerced into an empty inventory.
 */
export function useHomeOverview() {
  const { selectedId, load } = useCollections();
  const prefs = useViewPreferences();

  // The collection selector lives in the sidebar, which is not mounted on a
  // phone until the drawer opens. Home still has to know which collection it is.
  onMounted(() => {
    void load();
  });

  const resolution = computed(() => resolveActiveCollectionId(selectedId.value, prefs.value.collectionId));
  const activeId = computed(() => (resolution.value.status === "ready" ? resolution.value.id : null));

  const { data, status, error, refresh } = useAsyncData(
    () => `home-overview:${activeId.value ?? resolution.value.status}`,
    async () => {
      const current = resolveActiveCollectionId(selectedId.value, prefs.value.collectionId);
      if (current.status !== "ready") {
        return null;
      }
      const api = useUserApi();
      return loadCollectionOverview(api, current.id);
    },
    {
      watch: [selectedId, () => prefs.value.collectionId],
      // Never reuse a payload from another key or a previous navigation.
      getCachedData: () => undefined,
    }
  );

  const view = computed(() =>
    classifyOverview({
      resolution: resolution.value,
      pending: status.value === "pending" || status.value === "idle",
      failed: status.value === "error" || error.value != null,
      load: (data.value as OverviewLoad | null) ?? null,
    })
  );

  watch(activeId, (id, previous) => {
    if (id !== previous) {
      resetCurrency();
    }
  });

  watch(
    () => view.value.identity?.currency ?? "",
    currency => {
      if (currency) {
        setCurrency(currency);
      }
    }
  );

  const refreshOverview = () => {
    void refresh();
  };

  onServerEvent(ServerEvent.EntityMutation, refreshOverview);
  onServerEvent(ServerEvent.TagMutation, refreshOverview);
  onServerEvent(ServerEvent.ImportMutation, refreshOverview);

  return {
    resolution,
    activeId,
    phase: computed(() => view.value.phase),
    identity: computed(() => view.value.identity),
    stats: computed(() => view.value.stats),
    refresh,
  };
}
