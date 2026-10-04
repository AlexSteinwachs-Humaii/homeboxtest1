<script setup lang="ts">
  import type { Table as TableType } from "@tanstack/vue-table";
  import type { EntitySummary } from "~/lib/api/types/data-contracts";

  import MdiTableCog from "~icons/mdi/table-cog";

  import Button from "~/components/ui/button/Button.vue";
  import {
    Pagination,
    PaginationEllipsis,
    PaginationFirst,
    PaginationLast,
    PaginationList,
    PaginationListItem,
  } from "@/components/ui/pagination";
  import { DialogID, useDialog } from "~/components/ui/dialog-provider/utils";
  import type { Pagination as PaginationType } from "../pagination";
  import { searchPageWindow, type SearchResultPhase } from "../search-pagination";

  const { openDialog } = useDialog();

  const props = defineProps<{
    table: TableType<EntitySummary>;
    dataLength: number;
    externalPagination?: PaginationType;
    presentation?: "default" | "search";
    resultPhase?: SearchResultPhase;
  }>();

  const searchWindow = computed(() => {
    if (props.presentation !== "search" || !props.externalPagination) {
      return null;
    }
    return searchPageWindow({
      page: props.externalPagination.page,
      pageSize: props.externalPagination.pageSize,
      total: props.externalPagination.totalSize,
      returned: props.resultPhase === "empty" || props.resultPhase === "error" ? 0 : props.dataLength,
    });
  });

  const pagingDisabled = computed(
    () => props.resultPhase === "loading" || props.resultPhase === "error" || props.resultPhase === "idle"
  );

  const setPage = (page: number) => {
    if (props.externalPagination) {
      if (page !== props.externalPagination.page) {
        // clear selection and expanded
        props.table.resetRowSelection();
        props.table.resetExpanded();
      }
      props.externalPagination.setPage(page);
    } else {
      props.table.setPageIndex(page - 1);
    }
  };
</script>

<template>
  <div
    v-if="searchWindow"
    class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    data-testid="search-pagination"
  >
    <div class="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        class="size-11 shrink-0 p-0"
        variant="outline"
        data-testid="table-settings"
        :aria-label="$t('components.item.view.table.table_settings')"
        @click="openDialog(DialogID.ItemTableSettings)"
      >
        <MdiTableCog />
      </Button>
      <p class="min-w-0 text-sm text-muted-foreground" data-testid="search-range">
        <template v-if="searchWindow.returned === 0">
          {{ $t("items.search_range_empty", { total: searchWindow.total }) }}
        </template>
        <template v-else>
          {{
            $t("items.search_range", {
              start: searchWindow.rangeStart,
              end: searchWindow.rangeEnd,
              total: searchWindow.total,
            })
          }}
        </template>
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="touch"
        class="glass-focus"
        data-testid="search-prev"
        :disabled="pagingDisabled || !searchWindow.hasPrevious"
        :aria-label="$t('items.search_previous')"
        @click="setPage(searchWindow.page - 1)"
      >
        {{ $t("items.search_previous") }}
      </Button>
      <p
        v-if="searchWindow.pageCount > 0"
        class="min-w-0 text-sm tabular-nums text-foreground"
        data-testid="search-page-status"
      >
        {{ $t("items.search_page_status", { page: searchWindow.page, pages: searchWindow.pageCount }) }}
      </p>
      <p v-else class="sr-only" data-testid="search-page-status">
        {{ $t("items.search_range_empty", { total: searchWindow.total }) }}
      </p>
      <Button
        type="button"
        variant="outline"
        size="touch"
        class="glass-focus"
        data-testid="search-next"
        :disabled="pagingDisabled || !searchWindow.hasNext"
        :aria-label="$t('items.search_next')"
        @click="setPage(searchWindow.page + 1)"
      >
        {{ $t("items.search_next") }}
      </Button>
    </div>
  </div>
  <div v-else class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-0">
    <div class="order-2 flex items-center gap-2 md:order-1">
      <Button class="size-10 p-0" variant="outline" @click="openDialog(DialogID.ItemTableSettings)">
        <MdiTableCog />
      </Button>
      <div class="text-sm text-muted-foreground">
        {{
          $t("components.item.view.table.selected_rows", {
            selected: table.getFilteredSelectedRowModel().rows.length,
            total: table.getFilteredRowModel().rows.length,
          })
        }}
      </div>
    </div>
    <div class="order-1 flex w-full justify-center md:order-2 md:w-auto">
      <Pagination
        v-slot="{ page }"
        :items-per-page="externalPagination ? externalPagination.pageSize : table.getState().pagination.pageSize"
        :total="externalPagination ? externalPagination.totalSize : dataLength"
        :sibling-count="2"
        :page="externalPagination ? externalPagination.page : table.getState().pagination.pageIndex + 1"
        @update:page="val => setPage(val)"
      >
        <PaginationList v-slot="{ items: pageItems }" class="flex items-center gap-1">
          <PaginationFirst @click="() => setPage(1)" />
          <template v-for="(item, index) in pageItems">
            <PaginationListItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
              <Button
                class="size-10 p-0"
                :variant="item.value === page ? 'default' : 'outline'"
                @click="() => setPage(item.value)"
              >
                {{ item.value }}
              </Button>
            </PaginationListItem>
            <PaginationEllipsis v-else :key="item.type" :index="index" />
          </template>
          <PaginationLast
            @click="
              () =>
                setPage(
                  externalPagination
                    ? Math.ceil(externalPagination.totalSize / externalPagination.pageSize)
                    : table.getPageCount()
                )
            "
          />
        </PaginationList>
      </Pagination>
    </div>
  </div>
</template>
