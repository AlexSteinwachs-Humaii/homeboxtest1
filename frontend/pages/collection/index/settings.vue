<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import { Button } from "@/components/ui/button";
  import { Label } from "@/components/ui/label";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import MdiLoading from "~icons/mdi/loading";
  import FormTextField from "~/components/Form/TextField.vue";
  import type { CurrenciesCurrency, Group } from "~~/lib/api/types/data-contracts";
  import { fmtCurrencyAsync } from "~/composables/utils";
  import {
    SETTINGS_PREVIEW_AMOUNT,
    canSubmitSettings,
    commitCurrencyPreview,
    currencyOptions,
    formatSettingsFailure,
    settingsView,
    shouldApplyServerValues,
    shouldKeepDraftAfterSave,
    startCurrencyPreview,
    type PreviewState,
  } from "~/lib/collection-settings";

  definePageMeta({
    middleware: ["auth"],
  });

  const { t } = useI18n();

  useHead({ title: `HomeBox | ${t("collection.tabs.settings")}` });

  const api = useUserApi();
  // Watch the collection id only. reloadCollections() replaces the summary
  // object after a successful save; watching the whole object would wipe a
  // failed or in-progress draft.
  const { selectedCollection, load: reloadCollections } = useCollections();

  const loading = ref(true);
  const saving = ref(false);
  const loadFailed = ref(false);
  const loadError = ref("");
  const saveError = ref<string | null>(null);

  const group = ref<Group | null>(null);
  const displayedCollectionId = ref<string | null>(null);
  const currencies = ref<CurrenciesCurrency[]>([]);
  const name = ref("");
  const currencyCode = ref("");
  const currencyExample = ref("");
  const dirty = ref(false);
  const draftCollectionId = ref<string | null>(null);
  const preview = ref<PreviewState>({ generation: 0, example: "" });

  let loadGeneration = 0;

  const hasLoadedValues = computed(
    () => Boolean(group.value) && displayedCollectionId.value === (selectedCollection.value?.id ?? null)
  );

  const view = computed(() =>
    settingsView({
      hasCollection: Boolean(selectedCollection.value),
      loading: loading.value,
      loadFailed: loadFailed.value,
      hasLoadedValues: hasLoadedValues.value,
    })
  );

  const phase = computed(() => (saving.value && view.value === "form" ? "saving" : view.value));

  const currencySelectOptions = computed(() => currencyOptions(currencies.value, currencyCode.value));

  const submitAllowed = computed(() =>
    canSubmitSettings({
      hasCollection: Boolean(selectedCollection.value),
      view: view.value,
      saving: saving.value,
    })
  );

  function markDirty() {
    dirty.value = true;
    draftCollectionId.value = selectedCollection.value?.id ?? null;
  }

  function onCurrencyChange(value: unknown) {
    currencyCode.value = String(value || "");
    markDirty();
  }

  const loadSettings = async () => {
    const collection = selectedCollection.value;
    const generation = ++loadGeneration;

    if (!collection) {
      loading.value = false;
      loadFailed.value = false;
      return;
    }

    if (displayedCollectionId.value !== collection.id) {
      dirty.value = false;
      draftCollectionId.value = null;
      group.value = null;
      saveError.value = null;
      displayedCollectionId.value = null;
    }

    loading.value = true;
    loadFailed.value = false;

    try {
      if (!currencies.value.length) {
        const respCurrencies = await api.group.currencies();
        if (generation !== loadGeneration) {
          return;
        }
        if (respCurrencies.error) {
          toast.error(t("profile.toast.failed_get_currencies"));
        } else if (respCurrencies.data) {
          currencies.value = respCurrencies.data;
        }
      }

      const res = await api.group.get(collection.id);
      if (generation !== loadGeneration) {
        return;
      }

      if (res.error || !res.data) {
        loadFailed.value = true;
        loadError.value = formatSettingsFailure(res.data, t("collection.settings_load_failed"));
        toast.error(t("errors.api_failure") + String(res.error ?? ""));
        return;
      }

      const apply = shouldApplyServerValues({
        requestCollectionId: collection.id,
        activeCollectionId: selectedCollection.value?.id ?? null,
        draftCollectionId: draftCollectionId.value,
        dirty: dirty.value,
      });

      group.value = res.data;
      displayedCollectionId.value = collection.id;
      loadFailed.value = false;
      if (apply) {
        name.value = res.data.name;
        currencyCode.value = res.data.currency;
        dirty.value = false;
        draftCollectionId.value = collection.id;
      }
    } catch (e) {
      if (generation !== loadGeneration) {
        return;
      }
      const msg = (e as Error).message ?? String(e);
      loadFailed.value = true;
      loadError.value = msg || t("collection.settings_load_failed");
      toast.error(msg);
    } finally {
      if (generation === loadGeneration) {
        loading.value = false;
      }
    }
  };

  watch(
    () => selectedCollection.value?.id,
    () => {
      void loadSettings();
    },
    { immediate: true }
  );

  watch(
    currencyCode,
    async code => {
      const next = startCurrencyPreview(preview.value, code);
      const started = next.generation;
      preview.value = next;
      currencyExample.value = next.example;
      if (!code) {
        return;
      }

      try {
        const formatted = await fmtCurrencyAsync(SETTINGS_PREVIEW_AMOUNT, code, getLocaleCode());
        const committed = commitCurrencyPreview(preview.value, started, formatted);
        preview.value = committed;
        if (committed.generation === started) {
          currencyExample.value = committed.example;
        }
      } catch {
        const committed = commitCurrencyPreview(preview.value, started, next.example);
        preview.value = committed;
        if (committed.generation === started) {
          currencyExample.value = committed.example;
        }
      }
    },
    { immediate: true }
  );

  const save = async () => {
    if (saving.value || !submitAllowed.value) {
      return;
    }

    const collection = selectedCollection.value;
    if (!collection) {
      return;
    }

    const sent = { name: name.value, currency: currencyCode.value };
    saving.value = true;
    saveError.value = null;

    try {
      const res = await api.group.update(
        {
          name: sent.name,
          currency: sent.currency,
        },
        collection.id
      );

      if (selectedCollection.value?.id !== collection.id) {
        return;
      }

      if (res.error || !res.data) {
        const fallback = t("profile.toast.failed_update_group");
        saveError.value = formatSettingsFailure(res.data, fallback);
        toast.error(fallback);
        return;
      }

      group.value = res.data;
      displayedCollectionId.value = collection.id;
      if (
        !shouldKeepDraftAfterSave(sent, {
          name: name.value,
          currency: currencyCode.value,
        })
      ) {
        name.value = res.data.name;
        currencyCode.value = res.data.currency;
        dirty.value = false;
        draftCollectionId.value = collection.id;
      }
      setCurrency(res.data.currency);
      toast.success(t("profile.toast.group_updated"));
      await reloadCollections();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      saveError.value = msg;
      toast.error(msg);
    } finally {
      saving.value = false;
    }
  };
</script>

<template>
  <div class="min-w-0" data-testid="collection-settings" :data-phase="phase">
    <div
      v-if="view === 'loading'"
      class="glass-panel rounded-lg p-5 text-sm text-muted-foreground"
      role="status"
      aria-busy="true"
      data-testid="collection-settings-loading"
    >
      {{ $t("global.loading") }}
    </div>

    <div
      v-else-if="view === 'empty'"
      class="glass-panel rounded-lg p-5 text-sm text-muted-foreground"
      data-testid="collection-settings-empty"
    >
      {{ $t("components.collection.selector.select_collection") }}
    </div>

    <div
      v-else-if="view === 'failed'"
      class="glass-panel flex flex-col items-start gap-3 rounded-lg p-5"
      role="alert"
      data-testid="collection-settings-load-error"
    >
      <p class="text-sm text-foreground">
        {{ loadError || $t("collection.settings_load_failed") }}
      </p>
      <Button
        type="button"
        variant="outline"
        size="touch"
        data-testid="collection-settings-retry"
        @click="loadSettings"
      >
        {{ $t("collection.settings_retry") }}
      </Button>
    </div>

    <form
      v-else
      class="glass-panel min-w-0 space-y-5 rounded-lg p-5 sm:p-6"
      data-testid="collection-settings-form"
      @submit.prevent="save"
    >
      <div class="min-w-0">
        <h2 class="text-xl font-semibold tracking-tight text-foreground">
          {{ $t("collection.settings_title") }}
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {{
            $t("collection.settings_subtitle", {
              name: selectedCollection?.name || name,
            })
          }}
        </p>
      </div>

      <FormTextField
        id="collection-settings-name"
        v-model="name"
        data-testid="collection-settings-name"
        name="name"
        autocomplete="organization"
        :label="$t('global.name')"
        @update:model-value="markDirty"
      />

      <div class="min-w-0 space-y-1.5">
        <Label for="collection-settings-currency" class="px-1">{{ $t("profile.currency_format") }}</Label>
        <Select :model-value="currencyCode" @update:model-value="onCurrencyChange">
          <SelectTrigger
            id="collection-settings-currency"
            class="glass-focus min-h-touch"
            data-testid="collection-settings-currency"
            aria-describedby="collection-settings-example"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="currency in currencySelectOptions" :key="currency.code" :value="currency.code">
              {{ currency.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <div
          id="collection-settings-example"
          class="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm"
          data-testid="collection-settings-example"
        >
          <span class="text-muted-foreground">{{ $t("profile.example") }}</span>
          <span class="font-medium tabular-nums text-foreground">
            {{ currencyExample || $t("collection.settings_example_pending") }}
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
        <p
          v-if="saveError"
          class="min-w-0 text-sm text-destructive sm:mr-auto"
          role="alert"
          data-testid="collection-settings-error"
        >
          {{ saveError }}
        </p>
        <Button
          type="submit"
          variant="action"
          size="touch"
          class="w-full sm:w-auto"
          data-testid="collection-settings-save"
          :disabled="!submitAllowed"
          :aria-busy="saving"
        >
          <MdiLoading v-if="saving" class="animate-spin" aria-hidden="true" />
          <span>{{ saving ? $t("collection.settings_saving") : $t("collection.update_collection") }}</span>
        </Button>
      </div>
    </form>
  </div>
</template>
