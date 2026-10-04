import { computed } from "vue";
import { ServerEvent, onServerEvent } from "~/composables/use-server-events";
import { useLocationStore } from "~~/stores/locations";
import { useTagStore } from "~/stores/tags";
import { resolveActiveCollectionId } from "./overview";
import {
  classifyBrowse,
  loadHomeLocations,
  loadHomeTags,
  type BrowsePhase,
  type LocationCardView,
  type TagCardView,
} from "./browse";

/**
 * Storage locations and tags for My Home. Loads go through the existing store
 * actions so server-event refreshes and count semantics stay the ones the
 * location and tag pages already use. The async key is the active collection.
 */
export function useHomePlaces() {
  const prefs = useViewPreferences();
  const { selectedId } = useCollections();
  const locationStore = useLocationStore();
  const tagStore = useTagStore();

  const activeId = computed(() => resolveActiveCollectionId(selectedId.value, prefs.value.collectionId ?? null));
  const selectionMismatch = computed(
    () =>
      Boolean(selectedId.value) && Boolean(prefs.value.collectionId) && selectedId.value !== prefs.value.collectionId
  );

  const locationsQuery = useAsyncData(
    () => `home-locations:${activeId.value ?? "none"}`,
    () => loadHomeLocations(locationStore, selectionMismatch.value ? null : activeId.value),
    {
      watch: [activeId],
      getCachedData: () => undefined,
    }
  );

  const tagsQuery = useAsyncData(
    () => `home-tags:${activeId.value ?? "none"}`,
    () => loadHomeTags(tagStore, selectionMismatch.value ? null : activeId.value),
    {
      watch: [activeId],
      getCachedData: () => undefined,
    }
  );

  const refreshLocations = () => {
    void locationsQuery.refresh();
  };
  const refreshTags = () => {
    void tagsQuery.refresh();
  };

  onServerEvent(ServerEvent.EntityMutation, refreshLocations);
  onServerEvent(ServerEvent.ImportMutation, () => {
    refreshLocations();
    refreshTags();
  });
  onServerEvent(ServerEvent.TagMutation, refreshTags);

  const locationsPhase = computed<BrowsePhase>(() =>
    classifyBrowse({
      activeId: activeId.value,
      selectionMismatch: selectionMismatch.value,
      requestPending: locationsQuery.pending.value,
      requestFailed: locationsQuery.status.value === "error" || Boolean(locationsQuery.error.value),
      load: locationsQuery.data.value ?? null,
    })
  );

  const tagsPhase = computed<BrowsePhase>(() =>
    classifyBrowse({
      activeId: activeId.value,
      selectionMismatch: selectionMismatch.value,
      requestPending: tagsQuery.pending.value,
      requestFailed: tagsQuery.status.value === "error" || Boolean(tagsQuery.error.value),
      load: tagsQuery.data.value ?? null,
    })
  );

  const locationCards = computed<LocationCardView[]>(() => {
    if (locationsPhase.value !== "ready") {
      return [];
    }
    return locationsQuery.data.value?.locations ?? [];
  });

  const tagCards = computed<TagCardView[]>(() => {
    if (tagsPhase.value !== "ready") {
      return [];
    }
    return tagsQuery.data.value?.tags ?? [];
  });

  return {
    locationsPhase,
    tagsPhase,
    locationCards,
    tagCards,
    refreshLocations,
    refreshTags,
    activeId,
  };
}
