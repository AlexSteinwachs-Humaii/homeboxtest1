import { computed } from "vue";
import { useCollections } from "~~/composables/use-collections";
import { ServerEvent, onServerEvent } from "~~/composables/use-server-events";
import { useViewPreferences } from "~~/composables/use-preferences";
import { useLocationStore } from "~~/stores/locations";
import { useTagStore } from "~~/stores/tags";
import { resolveActiveCollectionId, type CollectionResolution } from "./overview";
import {
  classifyBrowse,
  loadHomeLocations,
  loadHomeTags,
  type BrowseLoad,
  type HomeLocation,
  type HomeTag,
} from "./browse";

/**
 * Root storage locations and tags for My Home.
 * Loads through the existing store actions so count semantics and server-event
 * refreshes stay shared with the rest of the app. Keyed by collection so a
 * switch cannot reuse another collection's cards. Failed requests stay errors.
 */
export function useHomePlaces() {
  const { selectedId } = useCollections();
  const prefs = useViewPreferences();
  const locationStore = useLocationStore();
  const tagStore = useTagStore();

  const resolution = computed(() => resolveActiveCollectionId(selectedId.value, prefs.value.collectionId));
  const activeId = computed(() => (resolution.value.status === "ready" ? resolution.value.id : null));

  const locationsAsync = useAsyncData(
    () => `home-locations:${activeId.value ?? resolution.value.status}`,
    async () => {
      const current: CollectionResolution = resolveActiveCollectionId(selectedId.value, prefs.value.collectionId);
      if (current.status !== "ready") {
        return null;
      }
      return loadHomeLocations(
        {
          getLocations: async () => {
            const result = await locationStore.refreshParents();
            return { error: Boolean(result.error), data: result.data ?? null };
          },
        },
        current.id
      );
    },
    {
      watch: [selectedId, () => prefs.value.collectionId],
      getCachedData: () => undefined,
    }
  );

  const tagsAsync = useAsyncData(
    () => `home-tags:${activeId.value ?? resolution.value.status}`,
    async () => {
      const current: CollectionResolution = resolveActiveCollectionId(selectedId.value, prefs.value.collectionId);
      if (current.status !== "ready") {
        return null;
      }
      return loadHomeTags(
        {
          getAll: async () => {
            const result = await tagStore.refresh();
            return { error: !result || Boolean(result.error), data: result?.data ?? null };
          },
        },
        current.id
      );
    },
    {
      watch: [selectedId, () => prefs.value.collectionId],
      getCachedData: () => undefined,
    }
  );

  const locationsPhase = computed(() =>
    classifyBrowse({
      resolution: resolution.value,
      pending: locationsAsync.status.value === "pending" || locationsAsync.status.value === "idle",
      failed: locationsAsync.status.value === "error" || locationsAsync.error.value != null,
      load: (locationsAsync.data.value as BrowseLoad<HomeLocation> | null) ?? null,
    })
  );

  const tagsPhase = computed(() =>
    classifyBrowse({
      resolution: resolution.value,
      pending: tagsAsync.status.value === "pending" || tagsAsync.status.value === "idle",
      failed: tagsAsync.status.value === "error" || tagsAsync.error.value != null,
      load: (tagsAsync.data.value as BrowseLoad<HomeTag> | null) ?? null,
    })
  );

  const locations = computed(() => {
    if (locationsPhase.value !== "ready") {
      return [];
    }
    const load = locationsAsync.data.value as BrowseLoad<HomeLocation> | null;
    return load?.ok ? load.items : [];
  });

  const tags = computed(() => {
    if (tagsPhase.value !== "ready" && tagsPhase.value !== "empty") {
      return [];
    }
    const load = tagsAsync.data.value as BrowseLoad<HomeTag> | null;
    return load?.ok ? load.items : [];
  });

  const refreshLocations = () => {
    void locationsAsync.refresh();
  };
  const refreshTags = () => {
    void tagsAsync.refresh();
  };
  const refreshPlaces = () => {
    refreshLocations();
    refreshTags();
  };

  onServerEvent(ServerEvent.EntityMutation, refreshLocations);
  onServerEvent(ServerEvent.ImportMutation, refreshPlaces);
  onServerEvent(ServerEvent.TagMutation, refreshTags);

  return {
    resolution,
    activeId,
    locationsPhase,
    tagsPhase,
    locations,
    tags,
    refreshLocations,
    refreshTags,
  };
}
