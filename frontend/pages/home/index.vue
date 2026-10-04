<script setup lang="ts">
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import MdiPlus from "~icons/mdi/plus";
  import { itemsTable } from "./table";
  import { useHomeOverview } from "./statistics";
  import { formatCollectionCount, formatCollectionValue } from "./overview";
  import { useTagStore } from "~/stores/tags";
  import { useLocationStore } from "~~/stores/locations";
  import { Button } from "~/components/ui/button";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import { useDialog } from "~/components/ui/dialog-provider";
  import BaseCard from "@/components/Base/Card.vue";
  import Subtitle from "~/components/global/Subtitle.vue";
  import ItemCard from "~/components/Item/Card.vue";
  import LocationCard from "~/components/Location/Card.vue";
  import TagChip from "~/components/Tag/Chip.vue";
  import Table from "~/components/Item/View/Table.vue";

  const { t, locale } = useI18n();
  const { openDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const api = useUserApi();
  const breakpoints = useBreakpoints();
  const { phase, stats, headingName, refresh } = useHomeOverview(api);

  useHead({
    title: () => "HomeBox | " + (headingName.value || t("menu.home")),
  });

  const locationStore = useLocationStore();
  const locations = computed(() => locationStore.parentLocations);

  const tagsStore = useTagStore();
  const tags = computed(() => tagsStore.tags);

  const itemTable = itemsTable(api);

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
          <dl class="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4 md:gap-0 md:divide-x md:divide-border">
            <div v-for="cell in statCells" :key="cell.id" class="min-w-0 md:px-6 md:first:pl-2 md:last:pr-2">
              <dd
                class="break-words text-2xl font-semibold tabular-nums leading-tight md:text-3xl"
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

    <section class="min-w-0">
      <Subtitle> {{ $t("home.recently_added") }} </Subtitle>

      <p v-if="itemTable.items.length === 0" class="ml-2 text-sm">{{ $t("items.no_results") }}</p>
      <BaseCard v-else-if="breakpoints.lg">
        <Table :items="itemTable.items" />
      </BaseCard>
      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ItemCard v-for="item in itemTable.items" :key="item.id" :item="item" />
      </div>
    </section>

    <section class="min-w-0">
      <Subtitle> {{ $t("home.storage_locations") }} </Subtitle>
      <p v-if="locations.length === 0" class="ml-2 text-sm">{{ $t("locations.no_results") }}</p>
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <LocationCard v-for="location in locations" :key="location.id" :location="location" />
      </div>
    </section>

    <section class="min-w-0">
      <Subtitle> {{ $t("home.tags") }} </Subtitle>
      <p v-if="tags.length === 0" class="ml-2 text-sm">{{ $t("tags.no_results") }}</p>
      <div v-else class="flex flex-wrap gap-4">
        <TagChip v-for="tag in tags" :key="tag.id" size="lg" :tag="tag" class="shadow-md" />
      </div>
    </section>
  </div>
</template>
