<script setup lang="ts">
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import MdiPlus from "~icons/mdi/plus";
  import { useHomeOverview } from "./statistics";
  import { useHomeRecent } from "./table";
  import { useHomePlaces } from "./places";
  import { formatCollectionValue } from "./overview";
  import { RECENT_VIEW_ALL } from "./recent";
  import { LOCATIONS_VIEW_ALL, TAGS_VIEW_ALL } from "./browse";
  import { getLocaleCode } from "~~/composables/use-formatters";
  import { useCollections } from "~~/composables/use-collections";
  import { DialogID } from "@/components/ui/dialog-provider/utils";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { Button } from "~/components/ui/button";
  import BaseContainer from "@/components/Base/Container.vue";
  import ItemCard from "~/components/Item/Card.vue";
  import LocationCard from "~/components/Location/Card.vue";
  import TagChip from "~/components/Tag/Chip.vue";

  const { t } = useI18n();
  const { openDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const overview = useHomeOverview();
  const recent = useHomeRecent(() => overview.identity.value?.currency ?? "");
  const places = useHomePlaces();
  const { collections } = useCollections();

  const knownName = computed(() => {
    const id = overview.activeId.value;
    if (!id) {
      return "";
    }
    return collections.value.find(collection => collection.id === id)?.name ?? "";
  });

  const heading = computed(() => overview.identity.value?.name || knownName.value || t("home.loading_name"));

  const formattedValue = computed(() => {
    const identity = overview.identity.value;
    const stats = overview.stats.value;
    if (!identity || !stats) {
      return "";
    }
    return formatCollectionValue(stats.totalItemPrice, identity.currency, getLocaleCode());
  });

  useHead({
    title: () => `HomeBox | ${overview.identity.value?.name || t("menu.home")}`,
  });

  function createItem() {
    openDialog(DialogID.CreateEntity, { params: { baseType: "item" } });
  }

  function retryOverview() {
    void overview.refresh();
  }

  function retryRecent() {
    void recent.refresh();
  }

  function retryLocations() {
    void places.refreshLocations();
  }

  function retryTags() {
    void places.refreshTags();
  }

  const tagsViewAllLabel = computed(() => {
    if (places.tagsPhase.value === "ready" || places.tagsPhase.value === "empty") {
      return t("home.tags_all", { count: places.tags.value.length });
    }
    return t("home.view_all");
  });
</script>

<template>
  <div>
    <BaseContainer class="flex flex-col gap-6">
      <section class="flex flex-col gap-4" data-testid="home-overview">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="glass-kicker">{{ $t("home.kicker") }}</p>
            <h1
              class="mt-1 truncate text-3xl font-semibold tracking-tight text-foreground"
              data-testid="home-collection-name"
              :title="heading"
            >
              {{ heading }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">{{ $t("home.tagline") }}</p>
            <p v-if="overview.identity.value" class="mt-1 text-sm text-muted-foreground" data-testid="home-currency">
              <span class="sr-only">{{ $t("home.currency_label") }}</span>
              {{ overview.identity.value.currency }}
            </p>
          </div>
          <Button
            type="button"
            variant="action"
            size="touch"
            class="shrink-0 self-start"
            data-testid="home-create"
            @click="createItem"
          >
            <MdiPlus />
            {{ $t("global.create") }}
          </Button>
        </div>

        <div
          class="glass-panel min-w-0 overflow-x-auto"
          data-testid="home-stats"
          :data-phase="overview.phase.value"
          :aria-busy="overview.phase.value === 'loading'"
        >
          <p
            v-if="overview.phase.value === 'loading'"
            class="px-4 py-6 text-sm text-muted-foreground"
            role="status"
            data-testid="home-stats-loading"
          >
            {{ $t("home.loading_stats") }}
          </p>
          <div
            v-else-if="overview.phase.value === 'error'"
            class="flex flex-col items-start gap-3 px-4 py-6"
            role="alert"
            data-testid="home-stats-error"
          >
            <p class="text-sm text-foreground">{{ $t("home.stats_error") }}</p>
            <Button
              type="button"
              variant="outline"
              class="glass-focus min-h-11"
              data-testid="home-stats-retry"
              @click="retryOverview"
            >
              {{ $t("home.retry") }}
            </Button>
          </div>
          <p
            v-else-if="overview.phase.value === 'no-collection'"
            class="px-4 py-6 text-sm text-muted-foreground"
            data-testid="home-stats-empty-collection"
          >
            {{ $t("home.no_collection") }}
          </p>
          <template v-else>
            <dl class="grid grid-cols-2 md:grid-cols-[minmax(9.5rem,1.7fr)_repeat(3,minmax(0,1fr))]">
              <div class="border-b border-r border-border p-3 md:border-b-0">
                <dd
                  class="whitespace-nowrap text-2xl font-semibold tabular-nums text-primary"
                  data-testid="home-stat-value"
                >
                  {{ formattedValue }}
                </dd>
                <dt class="mt-1 text-sm text-muted-foreground">{{ $t("home.stat_value") }}</dt>
              </div>
              <div class="border-b border-border p-3 md:border-b-0 md:border-r">
                <dd class="text-2xl font-semibold tabular-nums text-foreground" data-testid="home-stat-items">
                  {{ overview.stats.value?.totalItems }}
                </dd>
                <dt class="mt-1 text-sm text-muted-foreground">{{ $t("home.stat_items") }}</dt>
              </div>
              <div class="border-r border-border p-3">
                <dd class="text-2xl font-semibold tabular-nums text-foreground" data-testid="home-stat-locations">
                  {{ overview.stats.value?.totalLocations }}
                </dd>
                <dt class="mt-1 text-sm text-muted-foreground">{{ $t("home.stat_locations") }}</dt>
              </div>
              <div class="p-3">
                <dd class="text-2xl font-semibold tabular-nums text-foreground" data-testid="home-stat-tags">
                  {{ overview.stats.value?.totalTags }}
                </dd>
                <dt class="mt-1 text-sm text-muted-foreground">{{ $t("home.stat_tags") }}</dt>
              </div>
            </dl>
            <p
              v-if="overview.phase.value === 'empty'"
              class="border-t border-border px-4 py-3 text-sm text-muted-foreground"
              data-testid="home-stats-empty"
            >
              {{ $t("home.empty") }}
            </p>
          </template>
        </div>
      </section>

      <section data-testid="home-recent" :data-phase="recent.phase.value" :aria-busy="recent.phase.value === 'loading'">
        <div class="mb-3 flex items-center justify-between gap-3 pl-1">
          <h2 class="min-w-0 text-lg font-semibold text-foreground">{{ $t("home.recently_added") }}</h2>
          <NuxtLink
            v-if="recent.phase.value !== 'no-collection'"
            :to="RECENT_VIEW_ALL"
            class="glass-focus inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            data-testid="home-recent-view-all"
          >
            {{ $t("home.view_all") }}
            <span aria-hidden="true">›</span>
          </NuxtLink>
        </div>

        <p
          v-if="recent.phase.value === 'loading'"
          class="text-sm text-muted-foreground"
          role="status"
          data-testid="home-recent-loading"
        >
          {{ $t("home.recent_loading") }}
        </p>
        <div
          v-else-if="recent.phase.value === 'error'"
          class="flex flex-col items-start gap-3"
          role="alert"
          data-testid="home-recent-error"
        >
          <p class="text-sm text-foreground">{{ $t("home.recent_error") }}</p>
          <Button
            type="button"
            variant="outline"
            class="glass-focus min-h-11"
            data-testid="home-recent-retry"
            @click="retryRecent"
          >
            {{ $t("home.retry") }}
          </Button>
        </div>
        <p
          v-else-if="recent.phase.value === 'no-collection'"
          class="text-sm text-muted-foreground"
          data-testid="home-recent-no-collection"
        >
          {{ $t("home.no_collection") }}
        </p>
        <p
          v-else-if="recent.phase.value === 'empty'"
          class="text-sm text-muted-foreground"
          data-testid="home-recent-empty"
        >
          {{ $t("home.recent_empty") }}
        </p>
        <div v-else class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <ItemCard v-for="card in recent.cards.value" :key="card.id" variant="overview" :detail="card" />
        </div>
      </section>

      <section
        data-testid="home-locations"
        :data-phase="places.locationsPhase.value"
        :aria-busy="places.locationsPhase.value === 'loading'"
      >
        <div class="mb-3 flex items-center justify-between gap-3 pl-1">
          <h2 class="min-w-0 text-lg font-semibold text-foreground">{{ $t("home.storage_locations") }}</h2>
          <NuxtLink
            v-if="places.locationsPhase.value !== 'no-collection'"
            :to="LOCATIONS_VIEW_ALL"
            class="glass-focus inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            data-testid="home-locations-view-all"
          >
            {{ $t("home.view_all") }}
            <span aria-hidden="true">›</span>
          </NuxtLink>
        </div>

        <p
          v-if="places.locationsPhase.value === 'loading'"
          class="text-sm text-muted-foreground"
          role="status"
          data-testid="home-locations-loading"
        >
          {{ $t("home.location_loading") }}
        </p>
        <div
          v-else-if="places.locationsPhase.value === 'error'"
          class="flex flex-col items-start gap-3"
          role="alert"
          data-testid="home-locations-error"
        >
          <p class="text-sm text-foreground">{{ $t("home.location_error") }}</p>
          <Button
            type="button"
            variant="outline"
            class="glass-focus min-h-11"
            data-testid="home-locations-retry"
            @click="retryLocations"
          >
            {{ $t("home.retry") }}
          </Button>
        </div>
        <p
          v-else-if="places.locationsPhase.value === 'no-collection'"
          class="text-sm text-muted-foreground"
          data-testid="home-locations-no-collection"
        >
          {{ $t("home.no_collection") }}
        </p>
        <p
          v-else-if="places.locationsPhase.value === 'empty'"
          class="text-sm text-muted-foreground"
          data-testid="home-locations-empty"
        >
          {{ $t("home.location_empty") }}
        </p>
        <div v-else class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <LocationCard
            v-for="location in places.locations.value"
            :key="location.id"
            variant="overview"
            :location="{ id: location.id, name: location.name }"
            :detail="location"
          />
        </div>
      </section>

      <section
        data-testid="home-tags"
        :data-phase="places.tagsPhase.value"
        :aria-busy="places.tagsPhase.value === 'loading'"
      >
        <div class="mb-3 flex items-center justify-between gap-3 pl-1">
          <h2 class="min-w-0 text-lg font-semibold text-foreground">{{ $t("home.tags") }}</h2>
          <NuxtLink
            v-if="places.tagsPhase.value !== 'no-collection'"
            :to="TAGS_VIEW_ALL"
            class="glass-focus inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            data-testid="home-tags-view-all"
          >
            {{ tagsViewAllLabel }}
            <span aria-hidden="true">›</span>
          </NuxtLink>
        </div>

        <p
          v-if="places.tagsPhase.value === 'loading'"
          class="text-sm text-muted-foreground"
          role="status"
          data-testid="home-tags-loading"
        >
          {{ $t("home.tags_loading") }}
        </p>
        <div
          v-else-if="places.tagsPhase.value === 'error'"
          class="flex flex-col items-start gap-3"
          role="alert"
          data-testid="home-tags-error"
        >
          <p class="text-sm text-foreground">{{ $t("home.tags_error") }}</p>
          <Button
            type="button"
            variant="outline"
            class="glass-focus min-h-11"
            data-testid="home-tags-retry"
            @click="retryTags"
          >
            {{ $t("home.retry") }}
          </Button>
        </div>
        <p
          v-else-if="places.tagsPhase.value === 'no-collection'"
          class="text-sm text-muted-foreground"
          data-testid="home-tags-no-collection"
        >
          {{ $t("home.no_collection") }}
        </p>
        <p
          v-else-if="places.tagsPhase.value === 'empty'"
          class="text-sm text-muted-foreground"
          data-testid="home-tags-empty"
        >
          {{ $t("home.tags_empty") }}
        </p>
        <div v-else class="flex min-w-0 flex-wrap gap-3">
          <TagChip
            v-for="tag in places.tags.value"
            :key="tag.id"
            size="lg"
            :tag="tag"
            class="glass-focus min-h-11 max-w-full break-words"
            data-testid="home-tag-chip"
          />
        </div>
      </section>
    </BaseContainer>
  </div>
</template>
