<template>
  <NuxtLink
    v-if="variant === 'overview' && detail"
    :to="detail.href"
    class="glass-focus glass-panel flex min-h-11 min-w-0 items-center gap-3 overflow-hidden rounded-lg p-3 text-foreground shadow"
    data-testid="home-location-card"
    :data-empty="detail.empty ? 'true' : 'false'"
  >
    <span
      class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
      aria-hidden="true"
    >
      <MdiMapMarkerOutline class="size-6" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-base font-semibold" data-testid="home-location-name" :title="detail.name">
        {{ detail.name }}
      </span>
      <span v-if="detail.empty" class="block text-sm text-muted-foreground" data-testid="home-location-empty">
        {{ $t("home.location_empty_count") }}
      </span>
      <span
        v-else-if="detail.count !== null"
        class="block text-sm text-muted-foreground"
        data-testid="home-location-count"
      >
        {{ $t("home.location_items", { count: detail.count }) }}
      </span>
    </span>
    <MdiChevronRight class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </NuxtLink>
  <Card v-else>
    <NuxtLink :to="`/location/${location.id}`" class="group/location-card transition duration-300">
      <div
        :class="{
          'p-4': !dense,
          'px-3 py-2': dense,
        }"
      >
        <h2 class="flex items-center justify-between gap-2">
          <div class="relative size-6">
            <div
              class="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover/location-card:-rotate-90"
            >
              <MdiMapMarkerOutline class="size-6 group-hover/location-card:hidden" />
              <MdiArrowUp class="hidden size-6 group-hover/location-card:block" />
            </div>
          </div>
          <span class="mx-auto">
            {{ location.name }}
          </span>
          <Badge :class="{ 'opacity-0': !hasCount }">
            {{ count }}
          </Badge>
        </h2>
      </div>
    </NuxtLink>
  </Card>
</template>

<script lang="ts" setup>
  import type { EntityOut, EntitySummary } from "~~/lib/api/types/data-contracts";
  import MdiArrowUp from "~icons/mdi/arrow-down";
  import MdiChevronRight from "~icons/mdi/chevron-right";
  import MdiMapMarkerOutline from "~icons/mdi/map-marker-outline";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { explicitItemCount } from "~~/components/Location/count";

  type OverviewDetail = {
    href: string;
    name: string;
    count: number | null;
    empty: boolean;
  };

  const props = defineProps({
    location: {
      type: Object as () => EntitySummary | EntityOut | { id: string; name: string },
      required: true,
    },
    dense: {
      type: Boolean,
      default: false,
    },
    variant: {
      type: String as () => "default" | "overview",
      default: "default",
    },
    detail: {
      type: Object as () => OverviewDetail | null,
      default: null,
    },
  });

  // Numeric presence, not truthiness: an explicit 0 is empty, an omitted field is not a count.
  const hasCount = computed(() => explicitItemCount(props.location) !== null);

  const count = computed(() => explicitItemCount(props.location) ?? undefined);
</script>
