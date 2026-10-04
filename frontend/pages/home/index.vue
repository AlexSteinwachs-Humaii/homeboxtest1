<script setup lang="ts">
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";
  import MdiPlus from "~icons/mdi/plus";
  import { useHomeOverview } from "./statistics";
  import { itemsTable } from "./table";
  import { formatCollectionValue } from "./overview";
  import { useTagStore } from "~/stores/tags";
  import { useLocationStore } from "~~/stores/locations";
  import { getLocaleCode } from "~~/composables/use-formatters";
  import { useCollections } from "~~/composables/use-collections";
  import { DialogID } from "@/components/ui/dialog-provider/utils";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { Button } from "~/components/ui/button";
  import BaseContainer from "@/components/Base/Container.vue";
  import BaseCard from "@/components/Base/Card.vue";
  import Subtitle from "~/components/global/Subtitle.vue";
  import ItemCard from "~/components/Item/Card.vue";
  import LocationCard from "~/components/Location/Card.vue";
  import TagChip from "~/components/Tag/Chip.vue";
  import Table from "~/components/Item/View/Table.vue";

  const { t } = useI18n();
  const { openDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const api = useUserApi();
  const breakpoints = useBreakpoints();
  const overview = useHomeOverview();
  const { collections } = useCollections();

  const locationStore = useLocationStore();
  const locations = computed(() => locationStore.parentLocations);

  const tagsStore = useTagStore();
  const tags = computed(() => tagsStore.tags);

  const itemTable = itemsTable(api);

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

      <section>
        <Subtitle> {{ $t("home.recently_added") }} </Subtitle>

        <p v-if="itemTable.items.length === 0" class="ml-2 text-sm">{{ $t("items.no_results") }}</p>
        <BaseCard v-else-if="breakpoints.lg">
          <Table :items="itemTable.items" />
        </BaseCard>
        <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ItemCard v-for="item in itemTable.items" :key="item.id" :item="item" />
        </div>
      </section>

      <section>
        <Subtitle> {{ $t("home.storage_locations") }} </Subtitle>
        <p v-if="locations.length === 0" class="ml-2 text-sm">{{ $t("locations.no_results") }}</p>
        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <LocationCard v-for="location in locations" :key="location.id" :location="location" />
        </div>
      </section>

      <section>
        <Subtitle> {{ $t("home.tags") }} </Subtitle>
        <p v-if="tags.length === 0" class="ml-2 text-sm">{{ $t("tags.no_results") }}</p>
        <div v-else class="flex flex-wrap gap-4">
          <TagChip v-for="tag in tags" :key="tag.id" size="lg" :tag="tag" class="shadow-md" />
        </div>
      </section>
    </BaseContainer>
  </div>
</template>
