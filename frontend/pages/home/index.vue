<script setup lang="ts">
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import MdiPlus from "~icons/mdi/plus";
  import MdiChevronRight from "~icons/mdi/chevron-right";
  import { itemsTable } from "./table";
  import { useHomeOverview } from "./statistics";
  import { formatCollectionCount, formatCollectionValue } from "./overview";
  import { presentRecentItem, RECENT_VIEW_ALL } from "./recent";
  import { LOCATIONS_VIEW_ALL, TAGS_VIEW_ALL } from "./browse";
  import { useHomePlaces } from "./places";
  import { Button } from "~/components/ui/button";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import { useDialog } from "~/components/ui/dialog-provider";
  import ItemCard from "~/components/Item/Card.vue";
  import LocationCard from "~/components/Location/Card.vue";
  import TagChip from "~/components/Tag/Chip.vue";

  const { t, locale } = useI18n();
  const { openDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const api = useUserApi();
  const { phase, stats, headingName, refresh } = useHomeOverview(api);

  useHead({
    title: () => "HomeBox | " + (headingName.value || t("menu.home")),
  });

  const places = useHomePlaces();
  const locationsPhase = places.locationsPhase;
  const tagsPhase = places.tagsPhase;
  const locationCards = places.locationCards;
  const tagCards = places.tagCards;

  const tagsViewAllLabel = computed(() => {
    if (tagsPhase.value === "ready") {
      return t("home.tags_view_all", { count: tagCards.value.length });
    }
    return t("home.view_all");
  });

  const itemTable = itemsTable(api);
  const recentPhase = itemTable.phase;
  const recentCards = computed(() => {
    void locale.value;
    const currency = stats.value?.currency ?? "";
    const activeLocale = getLocaleCode();
    return itemTable.items.value.map(item => ({
      item,
      view: presentRecentItem(item, currency, activeLocale),
    }));
  });

  const statCells = computed(() => {
    const current = stats.value;
    if (!current) {
      return [];
    }
    void locale.value;
    const activeLocale = getLocaleCode();
    return [
      {
        id: "value",
        label: t("home.stat_value"),
        value: formatCollectionValue(current.totalValue, current.currency, activeLocale),
        emphasis: true,
      },
      {
        id: "items",
        label: t("home.stat_items"),
        value: formatCollectionCount(current.itemCount, activeLocale),
        emphasis: false,
      },
      {
        id: "locations",
        label: t("home.stat_locations"),
        value: formatCollectionCount(current.locationCount, activeLocale),
        emphasis: false,
      },
      {
        id: "tags",
        label: t("home.stat_tags"),
        value: formatCollectionCount(current.tagCount, activeLocale),
        emphasis: false,
      },
    ];
  });

  function createItem() {
    openDialog(DialogID.CreateEntity, { params: { baseType: "item" } });
  }
</script>

<template>
  <div class="glass-page mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-glass-section">
    <section class="glass-section min-w-0" data-testid="home-overview">
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div class="min-w-0 flex-1">
          <p class="glass-eyebrow">{{ $t("home.eyebrow") }}</p>
          <h1 v-if="headingName" class="glass-title mt-1 break-words" data-testid="home-collection-name">
            {{ headingName }}
          </h1>
          <p v-else class="glass-title mt-1" role="status" data-testid="home-collection-name">
            {{ phase === "no-collection" ? $t("home.no_collection_title") : $t("home.loading") }}
          </p>
          <p class="glass-body mt-1 text-muted-foreground">{{ $t("home.subtitle") }}</p>
          <p v-if="stats" class="mt-2 break-words text-sm text-muted-foreground" data-testid="home-currency">
            {{
              $t("home.identity", {
                name: stats.name || headingName || $t("home.unnamed"),
                currency: stats.currency,
              })
            }}
          </p>
        </div>
        <Button
          type="button"
          variant="action"
          size="touch"
          class="shrink-0"
          data-testid="home-create"
          @click="createItem"
        >
          <MdiPlus />
          {{ $t("global.create") }}
        </Button>
      </div>

      <div
        class="glass-panel min-w-0 px-4 py-5 shadow-sm md:px-6"
        data-testid="home-statistics"
        role="region"
        :aria-label="$t('home.quick_statistics')"
        :aria-busy="phase === 'loading'"
        aria-live="polite"
      >
        <div v-if="phase === 'loading'" data-testid="home-stats-loading">
          <p class="text-sm text-muted-foreground">{{ $t("home.loading") }}</p>
          <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4" aria-hidden="true">
            <div v-for="slot in 4" :key="slot" class="h-14 rounded-md bg-muted" />
          </div>
        </div>

        <div
          v-else-if="phase === 'error'"
          role="alert"
          data-testid="home-stats-error"
          class="flex flex-col items-start gap-3"
        >
          <p class="max-w-prose text-sm text-foreground">{{ $t("home.load_error") }}</p>
          <Button type="button" variant="outline" size="touch" data-testid="home-stats-retry" @click="refresh">
            {{ $t("home.retry") }}
          </Button>
        </div>

        <div v-else-if="phase === 'no-collection'" data-testid="home-no-collection">
          <p class="max-w-prose text-sm text-foreground">{{ $t("home.no_collection") }}</p>
        </div>

        <div v-else>
          <p v-if="phase === 'empty'" class="mb-4 max-w-prose text-sm text-foreground" data-testid="home-stats-empty">
            {{ $t("home.empty") }}
          </p>
          <dl
            class="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:gap-0 md:divide-x md:divide-border"
          >
            <div v-for="cell in statCells" :key="cell.id" class="min-w-0 md:px-3 md:first:pl-2 md:last:pr-2">
              <dd
                class="break-words text-2xl font-semibold tabular-nums leading-tight"
                :class="cell.emphasis ? 'text-primary' : 'text-foreground'"
                :data-testid="`home-stat-${cell.id}`"
              >
                {{ cell.value }}
              </dd>
              <dt class="mt-1 text-sm text-muted-foreground">{{ cell.label }}</dt>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section class="min-w-0" data-testid="home-recent" :aria-busy="recentPhase === 'loading'">
      <div class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 class="min-w-0 text-2xl font-bold tracking-tight text-foreground">{{ $t("home.recently_added") }}</h2>
        <NuxtLink
          :to="RECENT_VIEW_ALL"
          class="glass-touch inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="home-recent-view-all"
        >
          {{ $t("home.view_all") }}
          <MdiChevronRight class="size-4" aria-hidden="true" />
        </NuxtLink>
      </div>

      <div v-if="recentPhase === 'loading'" data-testid="home-recent-loading" role="status">
        <p class="text-sm text-muted-foreground">{{ $t("home.recent_loading") }}</p>
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3" aria-hidden="true">
          <div v-for="slot in 3" :key="slot" class="glass-panel h-64 bg-card" />
        </div>
      </div>

      <div
        v-else-if="recentPhase === 'error'"
        role="alert"
        data-testid="home-recent-error"
        class="flex flex-col items-start gap-3"
      >
        <p class="max-w-prose text-sm text-foreground">{{ $t("home.recent_error") }}</p>
        <Button type="button" variant="outline" size="touch" data-testid="home-recent-retry" @click="itemTable.refresh">
          {{ $t("home.retry") }}
        </Button>
      </div>

      <p
        v-else-if="recentPhase === 'no-collection'"
        class="max-w-prose text-sm text-foreground"
        data-testid="home-recent-no-collection"
      >
        {{ $t("home.no_collection") }}
      </p>

      <p
        v-else-if="recentPhase === 'empty'"
        class="max-w-prose text-sm text-foreground"
        data-testid="home-recent-empty"
      >
        {{ $t("home.recent_empty") }}
      </p>

      <div v-else class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3" data-testid="home-recent-grid">
        <ItemCard
          v-for="card in recentCards"
          :key="card.view.id"
          variant="overview"
          :item="card.item"
          :detail="card.view"
        />
      </div>
    </section>

    <section class="min-w-0" data-testid="home-locations" :aria-busy="locationsPhase === 'loading'">
      <div class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 class="min-w-0 break-words text-2xl font-bold tracking-tight text-foreground">
          {{ $t("home.storage_locations") }}
        </h2>
        <NuxtLink
          :to="LOCATIONS_VIEW_ALL"
          class="glass-touch glass-focus inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold text-primary outline-none"
          data-testid="home-locations-view-all"
        >
          {{ $t("home.view_all") }}
          <MdiChevronRight class="size-4" aria-hidden="true" />
        </NuxtLink>
      </div>

      <div v-if="locationsPhase === 'loading'" data-testid="home-locations-loading" role="status">
        <p class="text-sm text-muted-foreground">{{ $t("home.locations_loading") }}</p>
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
          <div v-for="slot in 2" :key="slot" class="glass-panel h-16 bg-card" />
        </div>
      </div>

      <div
        v-else-if="locationsPhase === 'error'"
        role="alert"
        data-testid="home-locations-error"
        class="flex flex-col items-start gap-3"
      >
        <p class="max-w-prose text-sm text-foreground">{{ $t("home.locations_error") }}</p>
        <Button
          type="button"
          variant="outline"
          size="touch"
          data-testid="home-locations-retry"
          @click="places.refreshLocations"
        >
          {{ $t("home.retry") }}
        </Button>
      </div>

      <p
        v-else-if="locationsPhase === 'no-collection'"
        class="max-w-prose text-sm text-foreground"
        data-testid="home-locations-no-collection"
      >
        {{ $t("home.no_collection") }}
      </p>

      <p
        v-else-if="locationsPhase === 'empty'"
        class="max-w-prose text-sm text-foreground"
        data-testid="home-locations-empty"
      >
        {{ $t("home.locations_empty") }}
      </p>

      <div v-else class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2" data-testid="home-locations-grid">
        <LocationCard v-for="card in locationCards" :key="card.id" variant="overview" :location="card" :detail="card" />
      </div>
    </section>

    <section class="min-w-0" data-testid="home-tags" :aria-busy="tagsPhase === 'loading'">
      <div class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 class="min-w-0 break-words text-2xl font-bold tracking-tight text-foreground">{{ $t("home.tags") }}</h2>
        <NuxtLink
          :to="TAGS_VIEW_ALL"
          class="glass-touch glass-focus inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold text-primary outline-none"
          data-testid="home-tags-view-all"
        >
          {{ tagsViewAllLabel }}
          <MdiChevronRight class="size-4" aria-hidden="true" />
        </NuxtLink>
      </div>

      <div v-if="tagsPhase === 'loading'" data-testid="home-tags-loading" role="status">
        <p class="text-sm text-muted-foreground">{{ $t("home.tags_loading") }}</p>
      </div>

      <div
        v-else-if="tagsPhase === 'error'"
        role="alert"
        data-testid="home-tags-error"
        class="flex flex-col items-start gap-3"
      >
        <p class="max-w-prose text-sm text-foreground">{{ $t("home.tags_error") }}</p>
        <Button type="button" variant="outline" size="touch" data-testid="home-tags-retry" @click="places.refreshTags">
          {{ $t("home.retry") }}
        </Button>
      </div>

      <p
        v-else-if="tagsPhase === 'no-collection'"
        class="max-w-prose text-sm text-foreground"
        data-testid="home-tags-no-collection"
      >
        {{ $t("home.no_collection") }}
      </p>

      <p v-else-if="tagsPhase === 'empty'" class="max-w-prose text-sm text-foreground" data-testid="home-tags-empty">
        {{ $t("home.tags_empty") }}
      </p>

      <div v-else class="flex min-w-0 flex-wrap gap-3" data-testid="home-tags-list">
        <TagChip
          v-for="card in tagCards"
          :key="card.id"
          size="lg"
          :tag="card.tag"
          class="glass-focus min-h-11 min-w-11 max-w-full break-words px-4 shadow-none [overflow-wrap:anywhere]"
          :data-testid="`home-tag-${card.id}`"
        />
      </div>
    </section>
  </div>
</template>
