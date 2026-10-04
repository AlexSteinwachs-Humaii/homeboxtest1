<script setup lang="ts">
  import type { Table as TableType } from "@tanstack/vue-table";
  import type { EntitySummary } from "~/lib/api/types/data-contracts";

  import MdiTableCog from "~icons/mdi/table-cog";
  import { ChevronLeft, ChevronRight } from "lucide-vue-next";

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
  import { searchPageWindow } from "../search-pagination";

  const { openDialog } = useDialog();

  const props = defineProps<{
    table: TableType<EntitySummary>;
    dataLength: number;
    externalPagination?: PaginationType;
    presentation?: "search";
    resultPhase?: "loading" | "ready" | "empty" | "error";
  }>();

  const setPage = (page: number) => {
    if (props.externalPagination) {
      if (page !== props.externalPagination.page) {
        // clear selection and expanded — a new page must not inherit the previous page's selection
        props.table.resetRowSelection();
        props.table.resetExpanded();
      }
      props.externalPagination.setPage(page);
    } else {
      props.table.setPageIndex(page - 1);
    }
  };

  const searchWindow = computed(() => {
    if (!props.externalPagination) {
      return null;
    }
    const showReturned = !props.resultPhase || props.resultPhase === "ready" || props.resultPhase === "empty";
    return searchPageWindow({
      page: props.externalPagination.page,
      pageSize: props.externalPagination.pageSize,
      total: props.externalPagination.totalSize,
      returned: showReturned ? props.dataLength : 0,
    });
  });

  const selectedCount = computed(() => props.table.getSelectedRowModel().rows.length);

  const goToSearchPage = (page: number) => {
    const window = searchWindow.value;
    if (!window || props.resultPhase === "loading" || props.resultPhase === "error") {
      return;
    }
    if (window.pageCount === 0 || page < 1 || page > window.pageCount || page === window.page) {
      return;
    }
    setPage(page);
  };
</script>

<template>
  <div v-if="presentation === 'search'" class="flex min-w-0 flex-col gap-2" data-testid="search-pagination">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <Button
          class="size-11 min-h-11 min-w-11 shrink-0 p-0"
          variant="outline"
          type="button"
          data-testid="search-table-settings"
          :aria-label="$t('components.item.view.table.table_settings')"
          @click="openDialog(DialogID.ItemTableSettings)"
        >
          <MdiTableCog />
        </Button>
        <p v-if="resultPhase === 'error'" class="min-w-0 text-sm text-muted-foreground" data-testid="search-range">
          {{ $t("items.search_error") }}
        </p>
        <p
          v-else-if="resultPhase === 'loading'"
          class="min-w-0 text-sm text-muted-foreground"
          data-testid="search-range"
          role="status"
        >
          {{ $t("items.search_loading") }}
        </p>
        <p v-else class="min-w-0 text-sm text-muted-foreground" data-testid="search-range">
          <template v-if="searchWindow && searchWindow.end >= 1">
            {{
              $t("items.search_range", {
                start: searchWindow.start,
                end: searchWindow.end,
                total: searchWindow.total,
              })
            }}
          </template>
          <template v-else>
            {{ $t("items.search_range_empty", { total: searchWindow?.total ?? 0 }) }}
          </template>
          <span aria-hidden="true"> · </span>
          <span data-testid="search-selected">{{ $t("items.search_selected_inline", { count: selectedCount }) }}</span>
        </p>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="glass"
          size="touch-icon"
          class="rounded-full"
          data-testid="search-page-prev"
          :aria-label="$t('items.prev_page')"
          :disabled="!searchWindow?.hasPrevious || resultPhase === 'loading' || resultPhase === 'error'"
          @click="searchWindow && goToSearchPage(searchWindow.page - 1)"
        >
          <ChevronLeft />
        </Button>
        <span
          v-if="searchWindow && searchWindow.pageCount > 0 && resultPhase !== 'error'"
          class="min-w-14 text-center text-sm tabular-nums text-foreground"
          data-testid="search-page-status"
        >
          {{ $t("items.search_page_status", { page: searchWindow.page, totalPages: searchWindow.pageCount }) }}
        </span>
        <Button
          type="button"
          variant="glass"
          size="touch-icon"
          class="rounded-full"
          data-testid="search-page-next"
          :aria-label="$t('items.next_page')"
          :disabled="!searchWindow?.hasNext || resultPhase === 'loading' || resultPhase === 'error'"
          @click="searchWindow && goToSearchPage(searchWindow.page + 1)"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
    <p v-if="resultPhase !== 'error'" class="max-w-prose text-sm text-muted-foreground" data-testid="search-open-hint">
      {{ $t("items.search_open_hint") }}
    </p>
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
