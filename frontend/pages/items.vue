<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import { Input } from "~/components/ui/input";
  import type { EntitySummary, TagSummary } from "~~/lib/api/types/data-contracts";
  import { useTagStore } from "~/stores/tags";
  import { useLocationStore } from "~~/stores/locations";
  import MdiLoading from "~icons/mdi/loading";
  import MdiMagnify from "~icons/mdi/magnify";
  import MdiDelete from "~icons/mdi/delete";
  import MdiPlus from "~icons/mdi/plus";
  import { Button } from "@/components/ui/button";
  import { DialogID } from "@/components/ui/dialog-provider/utils";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { registerInventorySearch } from "~/composables/use-inventory-search";
  import type { ViewType } from "~~/composables/use-preferences";
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";
  import { Separator } from "@/components/ui/separator";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import BaseContainer from "@/components/Base/Container.vue";
  import SearchFilter from "~/components/Search/Filter.vue";
  import ItemViewSelectable from "~/components/Item/View/Selectable.vue";
  import type { LocationQueryRaw } from "vue-router";

  const { t } = useI18n();
  const { openDialog } = useDialog();
  const { selectedCollection } = useCollections();

  definePageMeta({
    middleware: ["auth"],
  });

  useHead({
    title: () => "HomeBox | " + t("menu.search"),
  });

  const searchLocked = ref(false);
  const queryParamsInitialized = ref(false);
  type ResultPhase = "idle" | "loading" | "ready" | "empty" | "error";
  const resultPhase = ref<ResultPhase>("idle");
  let searchSeq = 0;

  const api = useUserApi();
  const loading = useMinLoader(500);
  const items = ref<EntitySummary[]>([]);
  const total = ref(0);

  // Using useRouteQuery directly has two downsides
  // 1. It persists the default value in the query string
  // 2. The ref returned by useRouteQuery updates asynchronously after calling the setter.
  //    This can cause unintuitive behaviors.
  // -> We copy query parameters into separate refs on page load and update the query explicitly via `router.push`.
  type QueryParamValue = string | string[] | number | boolean;
  type QueryRef = Ref<boolean | string | string[] | number, boolean | string | string[] | number>;
  const queryParamDefaultValues: Record<string, QueryParamValue> = {};
  function useOptionalRouteQuery(key: string, defaultValue: string): Ref<string>;
  function useOptionalRouteQuery(key: string, defaultValue: string[]): Ref<string[]>;
  function useOptionalRouteQuery(key: string, defaultValue: number): Ref<number>;
  function useOptionalRouteQuery(key: string, defaultValue: boolean): Ref<boolean>;
  function useOptionalRouteQuery(key: string, defaultValue: QueryParamValue): QueryRef {
    queryParamDefaultValues[key] = defaultValue;
    if (typeof defaultValue === "string") {
      const val = useRouteQuery(key, defaultValue);
      return ref(val.value);
    }
    if (Array.isArray(defaultValue)) {
      const val = useRouteQuery(key, defaultValue);
      return ref(val.value);
    }
    if (typeof defaultValue === "number") {
      const val = useRouteQuery(key, defaultValue);
      return ref(val.value);
    }
    if (typeof defaultValue === "boolean") {
      const val = useRouteQuery(key, defaultValue);
      return ref(val.value);
    }

    throw Error(`Invalid query value type ${typeof defaultValue}`);
  }

  const page1 = useOptionalRouteQuery("page", 1);

  const page = computed({
    get: () => page1.value,
    set: value => {
      page1.value = value;
    },
  });

  const query = useOptionalRouteQuery("q", "");
  const includeArchived = useOptionalRouteQuery("archived", false);
  const fieldSelector = useOptionalRouteQuery("fieldSelector", false);
  const negateTags = useOptionalRouteQuery("negateTags", false);
  const onlyWithoutPhoto = useOptionalRouteQuery("onlyWithoutPhoto", false);
  const onlyWithPhoto = useOptionalRouteQuery("onlyWithPhoto", false);
  const orderBy = useOptionalRouteQuery("orderBy", "name");
  const qLoc = useOptionalRouteQuery("loc", []);
  const qTag = useOptionalRouteQuery("tag", []);

  const preferences = useViewPreferences();
  const pageSize = computed(() => preferences.value.itemsPerTablePage);
  const itemView = computed(() => preferences.value.itemDisplayView);

  function setItemView(view: ViewType) {
    preferences.value.itemDisplayView = view;
  }

  function createItem() {
    openDialog(DialogID.CreateEntity, { params: { baseType: "item" } });
  }

  const kicker = computed(() => t("items.search_kicker", { name: selectedCollection.value?.name || t("menu.home") }));

  registerInventorySearch(next => {
    query.value = next.trim();
    page.value = 1;
    void search();
  });

  const route = useRoute();
  const router = useRouter();

  onMounted(async () => {
    loading.value = true;
    searchLocked.value = true;
    await Promise.all([locationsStore.ensureLocationsFetched(), tagStore.ensureAllTagsFetched()]);
    if (qLoc) {
      selectedLocations.value = locations.value.filter(l => qLoc.value.includes(l.id));
    }

    if (qTag) {
      selectedTags.value = tags.value.filter(l => qTag.value.includes(l.id));
    }

    queryParamsInitialized.value = true;
    searchLocked.value = false;

    const qFields = route.query.fields as string[];
    if (qFields) {
      fieldTuples.value = qFields.map(f => f.split("=") as [string, string]);

      for (const t of fieldTuples.value) {
        if (t[0] && t[1]) {
          await fetchValues(t[0]);
        }
      }
    }

    await search();

    window.scroll({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  });

  const locationsStore = useLocationStore();

  const locationFlatTree = useFlatLocations();

  const locations = computed(() => locationsStore.allLocations);

  const tagStore = useTagStore();
  const tags = computed(() => tagStore.tags);

  const selectedLocations = ref<EntitySummary[]>([]);
  const selectedTags = ref<TagSummary[]>([]);

  const locIDs = computed(() => selectedLocations.value.map(l => l.id));
  const tagIDs = computed(() => selectedTags.value.map(l => l.id));

  function parseAssetIDString(d: string) {
    d = d.replace(/"/g, "").replace(/-/g, "");

    const aidInt = parseInt(d);
    if (isNaN(aidInt)) {
      return [-1, false];
    }

    return [aidInt, true];
  }

  const byAssetId = computed(() => query.value?.startsWith("#") || false);
  const parsedAssetId = computed(() => {
    if (!byAssetId.value) {
      return "";
    } else {
      const [aid, valid] = parseAssetIDString(query.value.replace("#", ""));
      if (!valid) {
        return t("items.invalid_asset_id");
      } else {
        return aid;
      }
    }
  });

  const fieldTuples = ref<[string, string][]>([]);
  const fieldValuesCache = ref<Record<string, string[]>>({});

  const { data: allFields } = useAsyncData(async () => {
    const { data, error } = await api.items.fields.getAll();

    if (error) {
      return [];
    }

    return data;
  });

  watch(includeArchived, (newV, oldV) => {
    if (newV !== oldV) {
      search();
    }
  });

  watch(fieldSelector, (newV, oldV) => {
    if (newV === false && oldV === true) {
      fieldTuples.value = [];
    }
  });

  watch(negateTags, (newV, oldV) => {
    if (newV !== oldV) {
      search();
    }
  });

  watch(onlyWithoutPhoto, (newV, oldV) => {
    if (newV && onlyWithPhoto.value) {
      // this triggers the watch on onlyWithPhoto
      onlyWithPhoto.value = false;
    } else if (newV !== oldV) {
      search();
    }
  });

  watch(onlyWithPhoto, (newV, oldV) => {
    if (newV && onlyWithoutPhoto.value) {
      // this triggers the watch on onlyWithoutPhoto
      onlyWithoutPhoto.value = false;
    } else if (newV !== oldV) {
      search();
    }
  });

  watch(orderBy, (newV, oldV) => {
    if (newV !== oldV) {
      search();
    }
  });

  watch(
    () => useRoute().query.q,
    (newV, oldV) => {
      if (newV !== oldV) {
        query.value = (newV as string) || "";
      }
    }
  );

  async function fetchValues(field: string): Promise<string[]> {
    if (fieldValuesCache.value[field]) {
      return fieldValuesCache.value[field];
    }

    const { data, error } = await api.items.fields.getAllValues(field);

    if (error) {
      return [];
    }

    fieldValuesCache.value[field] = data;

    return data;
  }

  async function search() {
    if (searchLocked.value) {
      return;
    }

    const seq = ++searchSeq;
    resultPhase.value = "loading";
    loading.value = true;

    const fields = [];

    for (const t of fieldTuples.value) {
      if (t[0] && t[1]) {
        fields.push(`${t[0]}=${t[1]}`);
      }
    }

    const push_query: Record<string, string | string[] | number | boolean | undefined> = {
      archived: includeArchived.value,
      fieldSelector: fieldSelector.value,
      negateTags: negateTags.value,
      onlyWithoutPhoto: onlyWithoutPhoto.value,
      onlyWithPhoto: onlyWithPhoto.value,
      orderBy: orderBy.value,
      page: page.value,
      q: query.value,
      loc: locIDs.value,
      tag: tagIDs.value,
      fields: fields,
    };

    for (const key in push_query) {
      const val = push_query[key];
      const defaultVal = queryParamDefaultValues[key];
      if (
        (Array.isArray(val) &&
          Array.isArray(defaultVal) &&
          val.length == defaultVal.length &&
          val.every(v => (defaultVal as string[]).includes(v))) ||
        val === queryParamDefaultValues[key]
      ) {
        push_query[key] = undefined;
      }

      // Empirically seen to be unnecessary but according to router.push types,
      // booleans are not supported. This might be more stable.
      if (typeof push_query[key] === "boolean") {
        push_query[key] = String(val);
      }
    }

    await router.push({ query: push_query as LocationQueryRaw });

    const { data, error } = await api.items.getAll({
      q: query.value || "",
      parentIds: locIDs.value,
      tags: tagIDs.value,
      negateTags: negateTags.value,
      onlyWithoutPhoto: onlyWithoutPhoto.value,
      onlyWithPhoto: onlyWithPhoto.value,
      includeArchived: includeArchived.value,
      page: page.value,
      pageSize: pageSize.value,
      orderBy: orderBy.value,
      fields,
    });

    if (seq !== searchSeq) {
      return;
    }

    if (error || !data) {
      resultPhase.value = "error";
      items.value = [];
      loading.value = false;
      toast.error(t("items.toast.failed_search_items"));
      return;
    }

    total.value = data.total ?? 0;
    items.value = data.items ?? [];
    resultPhase.value = items.value.length === 0 ? "empty" : "ready";
    loading.value = false;
  }

  const displayPhase = computed(() => {
    if (loading.value || resultPhase.value === "loading" || resultPhase.value === "idle") {
      return "loading";
    }
    return resultPhase.value;
  });

  function retrySearch() {
    void search();
  }

  watchDebounced([page, pageSize, query, selectedTags, selectedLocations], search, { debounce: 250, maxWait: 1000 });

  async function submit() {
    // Set URL Params
    const fields = [];
    for (const t of fieldTuples.value) {
      if (t[0] && t[1]) {
        fields.push(`${t[0]}=${t[1]}`);
      }
    }

    // Reset Pagination
    page.value = 1;

    // Perform Search
    await search();
  }

  async function reset() {
    // Set URL Params
    const fields = [];
    for (const t of fieldTuples.value) {
      if (t[0] && t[1]) {
        fields.push(`${t[0]}=${t[1]}`);
      }
    }

    await search();
  }

  const pagination = proxyRefs({
    page,
    pageSize,
    totalSize: total,
    setPage: (newPage: number) => {
      page.value = newPage;
    },
  });
</script>

<template>
  <BaseContainer class="flex min-w-0 flex-col gap-6">
    <section class="flex min-w-0 flex-col gap-4" data-testid="inventory-search">
      <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="glass-kicker truncate" data-testid="search-kicker" :title="kicker">{{ kicker }}</p>
          <h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground" data-testid="search-heading">
            {{ $t("menu.search") }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ $t("items.search_subtitle") }}</p>
        </div>
        <Button
          type="button"
          variant="action"
          size="touch"
          class="shrink-0 self-start"
          data-testid="search-create"
          @click="createItem"
        >
          <MdiPlus />
          {{ $t("global.create") }}
        </Button>
      </div>

      <form class="flex min-w-0 flex-col gap-2" role="search" @submit.prevent="submit">
        <Label for="inventory-query">{{ $t("items.search_query_label") }}</Label>
        <div class="flex min-w-0 items-center gap-2">
          <Input
            id="inventory-query"
            v-model:model-value="query"
            class="min-w-0 flex-1 rounded-full"
            data-testid="search-query"
            name="inventoryQuery"
            type="search"
            autocomplete="off"
            :placeholder="$t('items.search_query_placeholder')"
            :aria-describedby="byAssetId ? 'search-asset-hint' : undefined"
          />
          <Button
            type="submit"
            variant="glass"
            size="touch-icon"
            class="shrink-0"
            data-testid="search-submit"
            :aria-label="$t('global.search')"
          >
            <MdiLoading v-if="loading" class="animate-spin" />
            <MdiMagnify v-else />
          </Button>
        </div>
        <p v-if="byAssetId" id="search-asset-hint" class="text-sm text-muted-foreground">
          {{ $t("items.query_id", { id: parsedAssetId }) }}
        </p>
      </form>

      <div v-if="locations && tags" class="flex min-w-0 flex-col gap-4">
        <div class="flex w-full min-w-0 flex-wrap items-center gap-2">
          <SearchFilter v-model="selectedLocations" touch :label="$t('global.locations')" :options="locationFlatTree" />
          <SearchFilter v-model="selectedTags" touch :label="$t('global.tags')" :options="tags" />
          <Popover>
            <PopoverTrigger as-child>
              <Button type="button" size="touch" variant="glass" data-testid="search-options">
                {{ $t("items.options") }}
              </Button>
            </PopoverTrigger>
            <PopoverContent class="z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2">
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="includeArchived" class="ml-auto" />
                <div class="grow" />
                <span class="text-right"> {{ $t("items.include_archive") }} </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="fieldSelector" class="ml-auto" />
                <div class="grow" />
                <span class="text-right"> {{ $t("items.field_selector") }} </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="negateTags" class="ml-auto" />
                <div class="grow" />
                <span class="text-right"> {{ $t("items.negate_tags") }} </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="onlyWithoutPhoto" class="ml-auto" />
                <div class="grow" />
                <span class="text-right"> {{ $t("items.only_without_photo") }} </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="onlyWithPhoto" class="ml-auto" />
                <div class="grow" />
                <span class="text-right"> {{ $t("items.only_with_photo") }} </span>
              </Label>
              <Label class="flex cursor-pointer flex-col gap-2">
                <span class="text-right">
                  <span class="text-right"> {{ $t("items.order_by") }} </span>
                </span>

                <Select v-model="orderBy">
                  <SelectTrigger>
                    <SelectValue :placeholder="$t('items.order_by')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name"> {{ $t("items.name") }} </SelectItem>
                    <SelectItem value="createdAt"> {{ $t("items.created_at") }} </SelectItem>
                    <SelectItem value="updatedAt"> {{ $t("items.updated_at") }} </SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Separator />
              <Button type="button" class="glass-focus min-h-11" @click="reset">
                {{ $t("items.reset_search") }}
              </Button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger as-child>
              <Button type="button" size="touch" variant="glass" class="sm:ml-auto" data-testid="search-tips">
                {{ $t("items.tips") }}
              </Button>
            </PopoverTrigger>
            <PopoverContent class="z-40 w-[min(325px,calc(100vw-2rem))]" align="end">
              <p class="text-base">{{ $t("items.tips_sub") }}</p>
              <ul class="mt-1 list-disc pl-6 text-sm">
                <li>
                  {{ $t("items.tip_1") }}
                </li>
                <li>
                  {{ $t("items.tip_2") }}
                </li>
                <li>
                  {{ $t("items.tip_3") }}
                </li>
              </ul>
            </PopoverContent>
          </Popover>
        </div>
        <div v-if="fieldSelector" class="flex flex-col gap-2 pb-2">
          <p>{{ $t("items.custom_fields") }}</p>
          <div v-for="(f, idx) in fieldTuples" :key="idx" class="flex flex-wrap gap-2">
            <div class="flex w-full flex-col gap-1 md:w-auto md:grow">
              <Label> {{ $t("items.field") }} </Label>
              <Select v-model="fieldTuples[idx]![0]" @update:model-value="fetchValues(f[0])">
                <SelectTrigger>
                  <SelectValue :placeholder="$t('items.select_field')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="field in allFields" :key="field" :value="field"> {{ field }} </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex w-full flex-col gap-1 md:w-auto md:grow">
              <Label> {{ $t("items.field_value") }} </Label>
              <Select v-model="fieldTuples[idx]![1]">
                <SelectTrigger>
                  <SelectValue :placeholder="$t('items.select_value')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="value in fieldValuesCache[f[0]]" :key="value" :value="value">
                    {{ value }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="destructive" type="button" size="icon" class="my-auto" @click="fieldTuples.splice(idx, 1)">
              <MdiDelete />
            </Button>
          </div>
          <Button type="button" size="sm" class="glass-focus mt-2 min-h-11" @click="() => fieldTuples.push(['', ''])">
            {{ $t("items.add") }}
          </Button>
        </div>
      </div>
    </section>

    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <p
        class="min-w-0 text-lg font-semibold text-foreground"
        role="status"
        aria-live="polite"
        data-testid="search-status"
      >
        <template v-if="displayPhase === 'loading'">{{ $t("items.search_loading") }}</template>
        <template v-else-if="displayPhase !== 'error'">{{ $t("items.search_count", { count: total }) }}</template>
      </p>
      <div
        class="glass-tabs ml-auto shrink-0"
        role="group"
        :aria-label="$t('items.search_view')"
        data-testid="search-view"
      >
        <Button
          type="button"
          size="touch"
          data-testid="search-view-card"
          :variant="itemView === 'card' ? 'action' : 'glass'"
          :aria-pressed="itemView === 'card'"
          @click="setItemView('card')"
        >
          {{ $t("components.item.view.selectable.card") }}
        </Button>
        <Button
          type="button"
          size="touch"
          data-testid="search-view-table"
          :variant="itemView === 'table' ? 'action' : 'glass'"
          :aria-pressed="itemView === 'table'"
          @click="setItemView('table')"
        >
          {{ $t("components.item.view.selectable.table") }}
        </Button>
      </div>
    </div>

    <div
      v-if="displayPhase === 'error'"
      class="flex min-w-0 flex-col items-start gap-3"
      role="alert"
      data-testid="search-error"
    >
      <p class="text-sm text-foreground">{{ $t("items.search_error") }}</p>
      <Button
        type="button"
        variant="outline"
        size="touch"
        class="glass-focus"
        data-testid="search-retry"
        @click="retrySearch"
      >
        {{ $t("items.search_retry") }}
      </Button>
    </div>
    <p
      v-else-if="displayPhase === 'empty'"
      class="text-sm text-muted-foreground"
      role="status"
      data-testid="search-empty"
    >
      {{ $t("items.no_results") }}
    </p>

    <section
      v-if="displayPhase !== 'error'"
      class="min-w-0"
      data-testid="search-results"
      :aria-busy="displayPhase === 'loading'"
      :data-phase="displayPhase"
    >
      <ItemViewSelectable
        presentation="search"
        :view="itemView"
        :items="items"
        :location-flat-tree="locationFlatTree"
        :pagination="pagination"
        disable-sort
        @refresh="async () => search()"
      />
    </section>
  </BaseContainer>
</template>
