<template>
  <Card v-if="variant === 'overview' && detail" class="min-w-0 shadow-sm">
    <NuxtLink
      :to="detail.href"
      class="glass-focus flex min-h-11 min-w-0 items-center gap-3 rounded-[inherit] p-3 outline-none"
      :data-testid="`home-location-card-${detail.id}`"
      :data-count="detail.count"
      :data-empty="detail.empty ? 'true' : 'false'"
    >
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"
        aria-hidden="true"
      >
        <MdiMapMarkerOutline class="size-6" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block break-words text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          {{ detail.name || $t("home.location_untitled") }}
        </span>
        <span
          class="mt-0.5 block break-words text-sm text-muted-foreground"
          :data-testid="detail.empty ? 'home-location-empty' : 'home-location-count'"
        >
          {{ detail.empty ? $t("home.location_empty") : $t("home.location_count", { count: detail.count }) }}
        </span>
      </span>
      <MdiChevronRight class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </NuxtLink>
  </Card>
  <Card v-else>
    <NuxtLink
      :to="`/location/${location.id}`"
      class="glass-focus group/location-card block min-h-11 rounded-[inherit] outline-none transition duration-300"
    >
      <div
        :class="{
          'p-4': !dense,
          'px-3 py-2': dense,
        }"
      >
        <h2 class="flex min-w-0 items-center justify-between gap-2">
          <div class="relative size-6 shrink-0">
            <div
              class="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover/location-card:-rotate-90"
            >
              <MdiMapMarkerOutline class="size-6 group-hover/location-card:hidden" />
              <MdiArrowUp class="hidden size-6 group-hover/location-card:block" />
            </div>
          </div>
          <span class="mx-auto min-w-0 break-words [overflow-wrap:anywhere]">
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
  import type { LocationCardView } from "~~/pages/home/browse";
  import MdiArrowUp from "~icons/mdi/arrow-down";
  import MdiChevronRight from "~icons/mdi/chevron-right";
  import MdiMapMarkerOutline from "~icons/mdi/map-marker-outline";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { explicitItemCount } from "~~/pages/home/browse";

  const props = defineProps({
    location: {
      type: Object as () => { id: string; name?: string; itemCount?: number },
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
      type: Object as () => LocationCardView | null,
      default: null,
    },
  });

  const countValue = computed(() => explicitItemCount(props.location));

  const hasCount = computed(() => countValue.value !== null);

  const count = computed(() => (hasCount.value ? countValue.value : undefined));
</script>
