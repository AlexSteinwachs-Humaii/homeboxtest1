<script setup lang="ts">
  import type { ViewType } from "~~/composables/use-preferences";
  import type { EntitySummary } from "~~/lib/api/types/data-contracts";
  import MdiCardTextOutline from "~icons/mdi/card-text-outline";
  import MdiTable from "~icons/mdi/table";
  import { Badge } from "@/components/ui/badge";
  import { Button, ButtonGroup } from "@/components/ui/button";
  import BaseSectionHeader from "@/components/Base/SectionHeader.vue";
  import DataTable from "./table/data-table.vue";
  import { makeColumns } from "./table/columns";
  import { useI18n } from "vue-i18n";
  import type { Pagination } from "./pagination";
  import MaintenanceEditModal from "@/components/Maintenance/EditModal.vue";
  import ItemChangeDetails from "./ItemChangeDetails.vue";

  const props = defineProps<{
    view?: ViewType;
    items: EntitySummary[];
    locationFlatTree?: FlatTreeItem[];
    pagination?: Pagination;
    disableSort?: boolean;
    /** Search page chrome. Other callers keep the default items header. */
    presentation?: "search";
    /** Compact Search cards use a fixed page size and must not edit the table preference. */
    lockPageSize?: boolean;
    resultPhase?: "loading" | "ready" | "empty" | "error";
  }>();

  const emit = defineEmits<{
    (e: "refresh"): void;
  }>();

  const preferences = useViewPreferences();
  const { t } = useI18n();
  const columns = computed(() =>
    makeColumns({
      t,
      refresh: () => emit("refresh"),
      disableSort: props.disableSort,
    })
  );

  const viewSet = computed(() => {
    return !!props.view;
  });

  const itemView = computed(() => {
    return props.view ?? preferences.value.itemDisplayView;
  });

  function setViewPreference(view: ViewType) {
    preferences.value.itemDisplayView = view;
  }

  const externalPagination = computed(() => !!props.pagination);
</script>

<template>
  <section>
    <MaintenanceEditModal />
    <ItemChangeDetails />

    <!--
      Search draws its own heading, count and Card/Table control.
      Keep the teleport target so card quick-actions still land here.
    -->
    <div
      v-if="presentation === 'search'"
      id="selectable-subtitle"
      class="flex min-w-0 flex-wrap items-center gap-2"
      :class="preferences.quickActions.enabled ? 'mb-2 min-h-11' : 'hidden'"
    />

    <BaseSectionHeader
      v-else
      class="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2"
      :class="{ 'mb-2 mt-4': !externalPagination }"
    >
      <div class="flex gap-2 text-nowrap">
        {{ $t("components.item.view.selectable.items") }}
        <Badge v-if="!externalPagination">
          {{ items.length }}
        </Badge>
      </div>
      <template #subtitle>
        <div
          id="selectable-subtitle"
          class="flex grow items-center px-2"
          :class="{ hidden: !preferences.quickActions.enabled }"
        />
      </template>
      <template #description>
        <div v-if="!viewSet">
          <ButtonGroup class="max-w-full flex-wrap">
            <Button size="sm" :variant="itemView === 'card' ? 'default' : 'outline'" @click="setViewPreference('card')">
              <MdiCardTextOutline class="size-5" />
              {{ $t("components.item.view.selectable.card") }}
            </Button>
            <Button
              size="sm"
              :variant="itemView === 'table' ? 'default' : 'outline'"
              @click="setViewPreference('table')"
            >
              <MdiTable class="size-5" />
              {{ $t("components.item.view.selectable.table") }}
            </Button>
          </ButtonGroup>
        </div>
      </template>
    </BaseSectionHeader>

    <p
      v-if="presentation !== 'search' && externalPagination && pagination!.totalSize > 0"
      class="mb-4 flex items-center text-base font-medium"
    >
      {{ $t("items.results", { total: pagination!.totalSize }) }}
      <span class="ml-auto text-base">
        {{
          $t("items.pages", {
            page: pagination!.page,
            totalPages: Math.ceil(pagination!.totalSize / pagination!.pageSize),
          })
        }}
      </span>
    </p>

    <DataTable
      :view="itemView"
      :presentation="presentation"
      :columns="preferences.quickActions.enabled ? columns : columns.filter(c => c.enableHiding !== false)"
      :data="items"
      :location-flat-tree="locationFlatTree"
      :external-pagination="pagination"
      :lock-page-size="lockPageSize"
      :result-phase="resultPhase"
      @refresh="$emit('refresh')"
    />
  </section>
</template>

<style scoped></style>
