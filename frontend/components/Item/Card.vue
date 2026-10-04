<template>
  <NuxtLink
    v-if="variant === 'overview' && detail"
    :to="detail.href"
    class="glass-focus glass-panel flex min-h-11 min-w-0 flex-col overflow-hidden rounded-lg text-foreground shadow"
    data-testid="home-recent-card"
    :aria-label="detail.name || $t('home.unnamed')"
  >
    <div class="relative h-36 w-full shrink-0 bg-secondary">
      <img
        v-if="overviewPhoto && !photoFailed"
        class="size-full object-cover"
        loading="lazy"
        :src="overviewPhoto"
        :alt="detail.name"
        data-testid="home-recent-photo"
        @error="photoFailed = true"
      />
      <div
        v-else
        class="flex h-full flex-col items-center justify-center gap-1 px-3 text-secondary-foreground"
        data-testid="home-recent-no-photo"
      >
        <svg class="size-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5" />
          <circle cx="9" cy="10" r="1.5" fill="currentColor" />
          <path d="M4 16l4.5-3.5 3 2.5 3-2 5.5 4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
        <span class="text-xs">{{ $t("home.no_photo") }}</span>
      </div>
    </div>
    <div class="flex min-w-0 grow flex-col gap-1 p-3">
      <h2
        class="line-clamp-2 min-w-0 text-base font-semibold leading-snug"
        data-testid="home-recent-name"
        :title="detail.name || undefined"
      >
        <template v-if="detail.name">{{ detail.name }}</template>
        <span v-else class="font-normal text-muted-foreground">{{ $t("home.unnamed") }}</span>
      </h2>
      <p
        v-if="detail.assetId || detail.quantity !== null"
        class="truncate text-xs text-muted-foreground"
        data-testid="home-recent-meta"
      >
        <span v-if="detail.assetId" data-testid="home-recent-asset">{{ detail.assetId }}</span>
        <span v-if="detail.assetId && detail.quantity !== null"> · </span>
        <span v-if="detail.quantity !== null" data-testid="home-recent-qty">
          {{ $t("home.qty", { count: detail.quantity }) }}
        </span>
      </p>
      <div class="mt-auto flex min-w-0 items-center gap-2 pt-1">
        <span
          v-if="detail.location"
          class="min-w-0 truncate rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
          data-testid="home-recent-location"
          :title="detail.location"
        >
          {{ detail.location }}
        </span>
        <span
          v-if="detail.value"
          class="ml-auto shrink-0 text-sm font-medium tabular-nums"
          data-testid="home-recent-value"
        >
          {{ detail.value }}
        </span>
      </div>
    </div>
  </NuxtLink>
  <Card v-else-if="item" class="relative overflow-hidden" data-variant="default">
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

  import { ref, watch } from "vue";

  type OverviewDetail = {
    href: string;
    name: string;
    assetId: string | null;
    quantity: number | null;
    location: string | null;
    value: string | null;
    photo: { kind: "none" } | { kind: "upload"; path: string };
  };

  const api = useUserApi();
  const preferences = useViewPreferences();

  const imageUrl = computed(() => {
    if (!props.item?.imageId) {
      return "/no-image.jpg";
    }
    if (props.item.thumbnailId) {
      return api.authURL(`/entities/${props.item.id}/attachments/${props.item.thumbnailId}`);
    } else {
      return api.authURL(`/entities/${props.item.id}/attachments/${props.item.imageId}`);
    }
  });

  const itemTags = computed(() => {
    return props.item ? useTagStore().withAncestors(props.item.tags) : [];
  });

  const props = defineProps({
    item: {
      type: Object as () => EntityOut | EntitySummary,
      required: false,
      default: undefined,
    },
    variant: {
      type: String as () => "default" | "overview",
      required: false,
      default: "default",
    },
    detail: {
      type: Object as () => OverviewDetail,
      required: false,
      default: undefined,
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
  });

  const photoFailed = ref(false);
  watch(
    () => props.detail?.photo,
    () => {
      photoFailed.value = false;
    }
  );

  const overviewPhoto = computed(() => {
    const photo = props.detail?.photo;
    if (!photo || photo.kind !== "upload" || !photo.path.startsWith("/entities/")) {
      return "";
    }
    return api.authURL(photo.path);
  });

  const objectContain = computed(() => imageUrl.value !== "/no-image.jpg" && !preferences.value.legacyImageFit);

  const locationString = computed(
    () => props.locationFlatTree.find(l => l.id === props.item?.parent?.id)?.treeString || props.item?.parent?.name
  );
</script>

<style lang="css"></style>
