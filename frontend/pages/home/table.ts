import { computed } from "vue";
import type { UserClient } from "~~/lib/api/user";
import { ServerEvent, onServerEvent } from "~/composables/use-server-events";
import { resolveActiveCollectionId } from "./overview";
import { classifyRecent, loadRecentItems, type RecentPhase } from "./recent";

/**
 * Newest items for My Home. The async key is the active collection so a switch
 * cannot paint the previous collection's cards. Failed loads stay errors.
 */
export function itemsTable(api: UserClient) {
  const prefs = useViewPreferences();
  const { selectedId } = useCollections();

  const activeId = computed(() => resolveActiveCollectionId(selectedId.value, prefs.value.collectionId ?? null));
  const selectionMismatch = computed(
    () =>
      Boolean(selectedId.value) && Boolean(prefs.value.collectionId) && selectedId.value !== prefs.value.collectionId
  );

  const { data, pending, error, status, refresh } = useAsyncData(
    () => `home-recent:${activeId.value ?? "none"}`,
    () => loadRecentItems(api, selectionMismatch.value ? null : activeId.value),
    {
      watch: [activeId],
      getCachedData: () => undefined,
    }
  );

  const refreshRecent = () => {
    void refresh();
  };

  onServerEvent(ServerEvent.EntityMutation, refreshRecent);
  onServerEvent(ServerEvent.ImportMutation, refreshRecent);

  const phase = computed<RecentPhase>(() =>
    classifyRecent({
      activeId: activeId.value,
      selectionMismatch: selectionMismatch.value,
      requestPending: pending.value,
      requestFailed: status.value === "error" || Boolean(error.value),
      load: data.value ?? null,
    })
  );

  const items = computed(() => {
    if (phase.value !== "ready") {
      return [];
    }
    return data.value?.items ?? [];
  });

  const total = computed(() => {
    if (phase.value !== "ready" && phase.value !== "empty") {
      return null;
    }
    return data.value?.total ?? null;
  });

  return {
    phase,
    items,
    total,
    refresh: refreshRecent,
    activeId,
  };
}
