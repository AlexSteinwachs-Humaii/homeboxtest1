<template>
  <Card v-if="variant === 'overview' && detail" class="min-w-0 overflow-hidden shadow-sm">
    <NuxtLink
      :to="detail.href"
      class="flex h-full min-w-0 flex-col rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :data-testid="`home-recent-card-${detail.id}`"
    >
      <div class="relative h-36 shrink-0 bg-muted">
        <img
          v-if="overviewPhoto && !photoFailed"
          class="size-full object-cover"
          loading="lazy"
          :src="overviewPhoto"
          alt=""
          data-testid="home-recent-photo"
          @error="photoFailed = true"
        />
        <div
          v-else
          class="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground"
          data-testid="home-recent-no-photo"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="M3 16l5-4 4 3 3-2 6 5" />
          </svg>
          <span class="text-xs font-medium">{{ $t("home.recent_no_photo") }}</span>
        </div>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3
          class="line-clamp-2 break-words text-base font-semibold leading-snug"
          :title="detail.nameMissing ? undefined : detail.name"
        >
          {{ detail.nameMissing ? $t("home.recent_untitled") : detail.name }}
        </h3>
        <p v-if="detail.assetId || detail.quantityText" class="break-words text-sm text-muted-foreground">
          <span v-if="detail.assetId">{{ detail.assetId }}</span>
          <span v-if="detail.assetId && detail.quantityText"> · </span>
          <span v-if="detail.quantityText">{{ $t("home.recent_qty", { count: detail.quantityText }) }}</span>
        </p>
        <div class="mt-auto flex min-w-0 items-center gap-2 pt-2">
          <span
            v-if="detail.location"
            class="inline-flex min-w-0 max-w-[70%] items-center truncate rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
            :title="detail.location"
          >
            {{ detail.location }}
          </span>
          <span v-if="detail.value" class="ml-auto shrink-0 text-sm font-medium tabular-nums text-foreground">
            {{ detail.value }}
          </span>
        </div>
      </div>
    </NuxtLink>
  </Card>
  <Card
    v-else-if="variant === 'search' && searchView"
    class="min-w-0 overflow-hidden shadow-sm"
    :data-testid="`search-result-card-${searchView.id}`"
  >
    <!-- Selection is a sibling of the item link so a tap cannot open the record. -->
    <div
      class="flex h-[48px] min-h-[48px] items-center justify-between gap-2 border-b border-border/60 px-1"
      data-testid="search-card-strip"
    >
      <div
        v-if="tableRow"
        class="relative size-12 min-h-[48px] min-w-[48px] shrink-0 rounded-md focus-within:ring-2 focus-within:ring-ring"
      >
        <span
          class="pointer-events-none absolute left-1/2 top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-primary bg-background"
          :class="tableRow.getIsSelected() ? 'bg-primary text-primary-foreground' : ''"
          aria-hidden="true"
        >
          <Check v-if="tableRow.getIsSelected()" class="size-3.5" />
        </span>
        <Checkbox
          class="absolute inset-0 size-12 min-h-[48px] min-w-[48px] border-0 bg-transparent opacity-0"
          :model-value="tableRow.getIsSelected()"
          :aria-label="selectLabel"
          :data-testid="`search-card-select-${searchView.id}`"
          @update:model-value="onSearchSelect"
          @click.stop
          @keydown.enter.stop
          @keydown.space.stop
        />
      </div>
      <span
        v-else
        class="inline-block size-12 min-h-[48px] min-w-[48px] shrink-0"
        aria-hidden="true"
        data-testid="search-card-select-off"
      />
      <span
        v-if="searchView.assetId"
        class="min-w-0 truncate pr-3 text-xs tabular-nums tracking-wide text-muted-foreground"
        data-testid="search-card-asset"
      >
        {{ searchView.assetId }}
      </span>
    </div>
    <NuxtLink
      :to="searchView.href"
      class="flex min-w-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :data-testid="`search-card-link-${searchView.id}`"
    >
      <div class="relative h-36 shrink-0 bg-muted">
        <img
          v-if="searchPhoto && !photoFailed"
          class="size-full object-cover"
          loading="lazy"
          :src="searchPhoto"
          alt=""
          data-testid="search-card-photo"
          @error="photoFailed = true"
        />
        <div
          v-else
          class="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground"
          data-testid="search-card-no-photo"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="M3 16l5-4 4 3 3-2 6 5" />
          </svg>
          <span class="text-xs font-medium">{{ $t("home.recent_no_photo") }}</span>
        </div>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div class="flex min-w-0 items-start justify-between gap-3">
          <h3
            class="line-clamp-2 min-w-0 break-words text-base font-semibold leading-snug"
            data-testid="search-card-name"
          >
            {{ searchView.nameMissing ? $t("home.recent_untitled") : searchView.name }}
          </h3>
          <span class="shrink-0 pt-0.5 text-sm text-muted-foreground" data-testid="search-card-insured">
            {{ searchView.insured ? $t("items.search_card_insured") : $t("items.search_card_not_insured") }}
          </span>
        </div>
        <p class="text-sm text-muted-foreground" data-testid="search-card-quantity">
          {{ $t("items.search_card_quantity", { count: searchView.quantity }) }}
        </p>
        <div class="mt-auto flex min-w-0 items-center gap-2 pt-2">
          <span
            v-if="searchView.location"
            class="inline-flex min-w-0 max-w-[70%] items-center truncate rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
            data-testid="search-card-location"
          >
            {{ searchView.location }}
          </span>
          <span
            class="ml-auto shrink-0 text-sm font-medium tabular-nums text-foreground"
            data-testid="search-card-value"
          >
            <Currency :amount="searchView.purchasePrice" />
          </span>
        </div>
      </div>
    </NuxtLink>
  </Card>
  <Card v-else class="relative overflow-hidden">
    <div v-if="tableRow" class="absolute left-1 top-1 z-10">
      <Checkbox
        class="size-5 bg-accent hover:bg-background-accent"
        :model-value="tableRow.getIsSelected()"
        :aria-label="$t('components.item.view.selectable.select_card')"
        @update:model-value="tableRow.toggleSelected()"
      />
    </div>
    <NuxtLink :to="`/item/${item.id}`">
      <div class="relative h-[200px]">
        <img
          v-if="imageUrl && objectContain"
          class="absolute h-[200px] w-full object-cover blur-md"
          loading="lazy"
          :src="imageUrl"
          alt=""
        />
        <img
          v-if="imageUrl"
          class="absolute h-[200px] w-full shadow-md"
          :class="objectContain ? 'object-contain' : 'object-cover'"
          loading="lazy"
          :src="imageUrl"
          :alt="item.name"
        />
        <div class="absolute inset-x-1 bottom-1">
          <Badge class="text-wrap bg-secondary text-secondary-foreground hover:bg-secondary/70 hover:underline">
            <NuxtLink v-if="item.parent" :to="`/location/${item.parent.id}`">
              {{ locationString }}
            </NuxtLink>
          </Badge>
        </div>
      </div>
      <div class="col-span-4 flex grow flex-col gap-y-1 p-4 pt-2">
        <h2 class="line-clamp-2 text-ellipsis text-wrap text-lg font-bold">{{ item.name }}</h2>
        <Separator class="mb-1" />
        <TooltipProvider :delay-duration="0">
          <div class="flex items-center gap-2">
            <Tooltip v-if="item.insured">
              <TooltipTrigger>
                <MdiShieldCheck class="size-5 text-primary" />
              </TooltipTrigger>
              <TooltipContent>
                {{ $t("global.insured") }}
              </TooltipContent>
            </Tooltip>
            <Tooltip v-if="item.archived">
              <TooltipTrigger>
                <MdiArchive class="size-5 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>
                {{ $t("global.archived") }}
              </TooltipContent>
            </Tooltip>
            <div class="grow" />
            <Tooltip>
              <TooltipTrigger>
                <Badge>
                  {{ item.quantity }}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {{ $t("global.quantity") }}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <Markdown class="mb-2 line-clamp-3 text-ellipsis" :source="item.description" />
        <div class="-mr-1 mt-auto flex flex-wrap justify-end gap-2">
          <TagChip v-for="tag in itemTags" :key="tag.id" :tag="tag" size="sm" :ancestors="tag.ancestors" />
        </div>
      </div>
    </NuxtLink>
  </Card>
</template>

<script setup lang="ts">
  import type { EntityOut, EntitySummary } from "~~/lib/api/types/data-contracts";
  import type { RecentCardView } from "~~/pages/home/recent";
  import MdiShieldCheck from "~icons/mdi/shield-check";
  import MdiArchive from "~icons/mdi/archive";
  import { Badge } from "@/components/ui/badge";
  import { Card } from "@/components/ui/card";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import { Separator } from "@/components/ui/separator";
  import Markdown from "@/components/global/Markdown.vue";
  import TagChip from "@/components/Tag/Chip.vue";
  import type { Row } from "@tanstack/vue-table";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Check } from "lucide-vue-next";
  import Currency from "@/components/global/Currency.vue";
  import { presentSearchCard } from "@/components/Item/View/search-card";
  import { useI18n } from "vue-i18n";

  const api = useUserApi();
  const preferences = useViewPreferences();

  const imageUrl = computed(() => {
    if (!props.item.imageId) {
      return "/no-image.jpg";
    }
    if (props.item.thumbnailId) {
      return api.authURL(`/entities/${props.item.id}/attachments/${props.item.thumbnailId}`);
    } else {
      return api.authURL(`/entities/${props.item.id}/attachments/${props.item.imageId}`);
    }
  });

  const itemTags = computed(() => {
    return useTagStore().withAncestors(props.item.tags);
  });

  const props = defineProps({
    item: {
      type: Object as () => EntityOut | EntitySummary,
      required: true,
    },
    locationFlatTree: {
      type: Array as () => FlatTreeItem[],
      required: false,
      default: () => [],
    },
    tableRow: {
      type: Object as () => Row<EntitySummary>,
      required: false,
      default: () => null,
    },
    variant: {
      type: String as () => "default" | "overview" | "search",
      required: false,
      default: "default",
    },
    detail: {
      type: Object as () => RecentCardView | null,
      required: false,
      default: null,
    },
  });

  const { t } = useI18n();
  const photoFailed = ref(false);
  const searchView = computed(() => (props.variant === "search" ? presentSearchCard(props.item) : null));
  const selectLabel = computed(() => {
    const view = searchView.value;
    const name = !view || view.nameMissing ? t("home.recent_untitled") : view.name;
    return t("items.search_card_select", { name });
  });

  function onSearchSelect(value: boolean | "indeterminate") {
    props.tableRow?.toggleSelected(value === true);
  }

  watch(
    () => [props.detail?.photoPath, props.item.imageId, props.item.thumbnailId],
    () => {
      photoFailed.value = false;
    }
  );

  const overviewPhoto = computed(() => {
    if (props.variant !== "overview" || !props.detail?.photoPath) {
      return "";
    }
    return api.authURL(props.detail.photoPath);
  });

  const searchPhoto = computed(() => {
    if (!searchView.value?.photoPath) {
      return "";
    }
    return api.authURL(searchView.value.photoPath);
  });

  const objectContain = computed(() => imageUrl.value !== "/no-image.jpg" && !preferences.value.legacyImageFit);

  const locationString = computed(
    () => props.locationFlatTree.find(l => l.id === props.item.parent?.id)?.treeString || props.item.parent?.name
  );
</script>

<style lang="css"></style>
