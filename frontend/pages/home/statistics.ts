import { computed, ref, watch } from "vue";
import type { UserClient } from "~~/lib/api/user";
import { resetCurrency, setCurrency } from "~/composables/use-formatters";
import { ServerEvent, onServerEvent } from "~/composables/use-server-events";
import {
  classifyOverview,
  loadCollectionOverview,
  resolveActiveCollectionId,
  type OverviewPhase,
  type OverviewStats,
} from "./overview";

/**
 * Live collection identity and statistics for My Home.
 * The async key is scoped to the active collection so a switch cannot paint
 * the previous collection's totals. Failed loads are not coerced to zeros.
 */
export function useHomeOverview(api?: UserClient) {
  const prefs = useViewPreferences();
  const { selectedId, selectedCollection, refreshing, load: loadCollections } = useCollections();
  const collectionsSettled = ref(selectedId.value !== null);

  const activeId = computed(() => resolveActiveCollectionId(selectedId.value, prefs.value.collectionId ?? null));
  const selectionMismatch = computed(
    () =>
      Boolean(selectedId.value) && Boolean(prefs.value.collectionId) && selectedId.value !== prefs.value.collectionId
  );

  const { data, pending, error, status, refresh } = useAsyncData(
    () => `home-overview:${activeId.value ?? "none"}`,
    () => loadCollectionOverview(api ?? useUserApi(), activeId.value),
    {
      watch: [activeId],
      // A previous visit to this collection must not be shown as current.
      getCachedData: () => undefined,
    }
  );

  watch(activeId, (id, previous) => {
    if (previous && id !== previous) {
      resetCurrency();
    }
  });

  watch(
    () => data.value,
    load => {
      if (load?.ok && load.stats && load.collectionId === activeId.value) {
        setCurrency(load.stats.currency);
      }
    }
  );

  const refreshOverview = () => {
    void refresh();
  };

  onServerEvent(ServerEvent.EntityMutation, refreshOverview);
  onServerEvent(ServerEvent.TagMutation, refreshOverview);
  onServerEvent(ServerEvent.ImportMutation, refreshOverview);

  watch(refreshing, (isRefreshing, wasRefreshing) => {
    if (wasRefreshing && !isRefreshing) {
      collectionsSettled.value = true;
    }
  });

  void loadCollections().finally(() => {
    if (!refreshing.value) {
      collectionsSettled.value = true;
    }
  });

  const phase = computed<OverviewPhase>(() =>
    classifyOverview({
      activeId: activeId.value,
      selectionMismatch: selectionMismatch.value,
      collectionsPending: !collectionsSettled.value || (refreshing.value && !activeId.value),
      requestPending: pending.value,
      requestFailed: status.value === "error" || Boolean(error.value),
      load: data.value ?? null,
    })
  );

  const stats = computed<OverviewStats | null>(() => {
    if (phase.value !== "ready" && phase.value !== "empty") {
      return null;
    }
    return data.value?.stats ?? null;
  });

  const headingName = computed(() => {
    const load = data.value;
    if (load?.stats?.name.trim() && load.collectionId === activeId.value && !selectionMismatch.value) {
      return load.stats.name.trim();
    }
    const selected = selectedCollection.value;
    if (
      selected &&
      activeId.value &&
      selected.id === activeId.value &&
      selected.name.trim() &&
      !selectionMismatch.value
    ) {
      return selected.name.trim();
    }
    return null;
  });

  return {
    phase,
    stats,
    headingName,
    refresh: refreshOverview,
    activeId,
  };
}
