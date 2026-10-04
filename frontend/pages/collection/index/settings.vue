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
  import { setCurrency } from "~/composables/use-formatters";
  import {
    beginCurrencyPreview,
    canSubmitSettings,
    currencyPreviewIsCurrent,
    draftAfterLoad,
    draftAfterSuccessfulSave,
    formatSettingsCurrencyExample,
    settingsFailureMessage,
    type SettingsHydration,
  } from "~/lib/collection-settings";

  definePageMeta({
    middleware: ["auth"],
  });

  const { t } = useI18n();

  useHead({ title: `HomeBox | ${t("collection.tabs.settings")}` });

  const api = useUserApi();
  const { selectedCollection, collections, load: reloadCollections } = useCollections();

  const loading = ref(true);
  const saving = ref(false);
  const loadFailed = ref(false);
  const error = ref<string | null>(null);

  const group = ref<Group | null>(null);
  const currencies = ref<CurrenciesCurrency[]>([]);
  const name = ref("");
  const currencyCode = ref("");
  const currencyExample = ref("");
  const hydration = ref<SettingsHydration | null>(null);
  const currencyFieldId = useId();

  const activeId = computed(() => selectedCollection.value?.id ?? null);
  const hasDraftForActive = computed(() => Boolean(activeId.value && hydration.value?.loadedId === activeId.value));
  const showLoading = computed(() => Boolean(activeId.value) && loading.value && !hasDraftForActive.value);
  const showEmpty = computed(() => !loading.value && !activeId.value);
  const showLoadFailure = computed(
    () => Boolean(activeId.value) && !loading.value && loadFailed.value && !hasDraftForActive.value
  );
  const showForm = computed(() => hasDraftForActive.value && !showLoading.value);
  const identityName = computed(() => group.value?.name || selectedCollection.value?.name || "");
  const canSave = computed(() => canSubmitSettings({ hasCollection: Boolean(activeId.value), saving: saving.value }));
  const currencyChoices = computed(() => {
    const list = currencies.value;
    if (currencyCode.value && !list.some(item => item.code === currencyCode.value)) {
      return [{ code: currencyCode.value, name: currencyCode.value, decimals: 2, local: "", symbol: "" }, ...list];
    }
    return list;
  });

  function isDirty() {
    if (!hydration.value) return false;
    return name.value !== hydration.value.name || currencyCode.value !== hydration.value.currency;
  }

  const loadSettings = async () => {
    const collectionId = selectedCollection.value?.id;
    if (!collectionId) {
      loading.value = false;
      return;
    }

    loading.value = true;

    try {
      if (!currencies.value.length) {
        const respCurrencies = await api.group.currencies();
        if (respCurrencies.error) {
          toast.error(t("profile.toast.failed_get_currencies"));
        } else if (respCurrencies.data) {
          currencies.value = respCurrencies.data;
        }
      }

      if (selectedCollection.value?.id !== collectionId) {
        return;
      }

      const res = await api.group.get(collectionId);
      if (selectedCollection.value?.id !== collectionId) {
        return;
      }

      if (res.error || !res.data) {
        loadFailed.value = true;
        const msg = t("errors.api_failure") + String(res.error ?? "");
        error.value = msg;
        toast.error(msg);
        return;
      }

      const next = draftAfterLoad(
        {
          name: name.value,
          currency: currencyCode.value,
          loadedId: hydration.value?.loadedId ?? null,
          dirty: isDirty(),
        },
        { id: collectionId, name: res.data.name, currency: res.data.currency }
      );
      name.value = next.name;
      currencyCode.value = next.currency;
      if (!next.dirty) {
        hydration.value = next;
        error.value = null;
      }
      group.value = res.data;
      loadFailed.value = false;
    } catch (e) {
      if (selectedCollection.value?.id !== collectionId) {
        return;
      }
      loadFailed.value = true;
      const msg = (e as Error).message ?? String(e);
      error.value = msg;
      toast.error(msg);
    } finally {
      if (!selectedCollection.value || selectedCollection.value.id === collectionId) {
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

  let previewGeneration = 0;
  watch(
    currencyCode,
    async code => {
      const generation = beginCurrencyPreview(previewGeneration);
      previewGeneration = generation;
      const preview = await formatSettingsCurrencyExample(
        code,
        getLocaleCode(),
        (amount, currency, locale) => fmtCurrencyAsync(amount, currency, locale),
        () => currencyPreviewIsCurrent(generation, previewGeneration)
      );
      if (preview.status === "stale") {
        return;
      }
      currencyExample.value = preview.status === "ready" ? preview.value : "";
    },
    { immediate: true }
  );

  const save = async () => {
    const collection = selectedCollection.value;
    if (!canSubmitSettings({ hasCollection: Boolean(collection), saving: saving.value }) || !collection) {
      return;
    }

    saving.value = true;
    error.value = null;
    const submitted = { name: name.value, currency: currencyCode.value };

    try {
      const res = await api.group.update(
        {
          name: submitted.name,
          currency: submitted.currency,
        },
        collection.id
      );

      if (res.error || !res.data) {
        const msg = settingsFailureMessage(t("profile.toast.failed_update_group"), res.data);
        error.value = msg;
        toast.error(t("profile.toast.failed_update_group"));
        return;
      }

      const next = draftAfterSuccessfulSave({ name: name.value, currency: currencyCode.value }, submitted, {
        id: collection.id,
        name: res.data.name,
        currency: res.data.currency,
      });
      name.value = next.name;
      currencyCode.value = next.currency;
      hydration.value = {
        name: res.data.name,
        currency: res.data.currency,
        loadedId: collection.id,
        dirty: next.dirty,
      };
      group.value = res.data;
      loadFailed.value = false;
      setCurrency(res.data.currency);
      const listed = collections.value.find(item => item.id === collection.id);
      if (listed) {
        listed.name = res.data.name;
      }
      toast.success(t("profile.toast.group_updated"));
      await reloadCollections();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      error.value = msg;
      toast.error(msg);
    } finally {
      saving.value = false;
    }
  };
</script>

<template>
  <div class="min-w-0" data-testid="collection-settings">
    <div
      v-if="showLoading"
      role="status"
      aria-busy="true"
      data-testid="collection-settings-loading"
      class="glass-panel px-5 py-6 text-sm text-muted-foreground"
    >
      {{ $t("global.loading") }}
    </div>

    <div
      v-else-if="showEmpty"
      data-testid="collection-settings-empty"
      class="glass-panel px-5 py-6 text-sm text-muted-foreground"
    >
      {{ $t("components.collection.selector.select_collection") }}
    </div>

    <div
      v-else-if="showLoadFailure"
      role="alert"
      data-testid="collection-settings-load-error"
      class="glass-panel flex flex-col items-start gap-4 px-5 py-6"
    >
      <p class="text-sm text-foreground">{{ error }}</p>
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
      v-else-if="showForm"
      class="glass-panel min-w-0 px-5 py-6 shadow-sm md:px-6"
      data-testid="collection-settings-form"
      aria-labelledby="collection-settings-title"
      @submit.prevent="save"
    >
      <h2 id="collection-settings-title" class="text-2xl font-bold tracking-tight text-foreground">
        {{ $t("collection.settings_title") }}
      </h2>
      <p class="mt-1 text-base text-muted-foreground">
        {{ $t("collection.settings_subtitle", { name: identityName }) }}
      </p>

      <div class="mt-6 flex min-w-0 flex-col gap-5">
        <FormTextField
          id="collection-settings-name"
          v-model="name"
          :label="$t('global.name')"
          name="name"
          data-testid="collection-settings-name"
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'collection-settings-error' : undefined"
        />

        <div class="flex min-w-0 flex-col gap-1.5">
          <Label :for="currencyFieldId" class="px-1 font-semibold text-foreground">
            {{ $t("profile.currency_format") }}
          </Label>
          <Select :model-value="currencyCode" @update:model-value="val => (currencyCode = String(val || ''))">
            <SelectTrigger
              :id="currencyFieldId"
              data-collection-currency
              data-testid="collection-settings-currency"
              class="glass-field-touch h-11 min-h-11 rounded-glass-control bg-background"
              :aria-invalid="Boolean(error)"
              :aria-describedby="
                error ? 'collection-settings-example collection-settings-error' : 'collection-settings-example'
              "
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in currencyChoices" :key="c.code" :value="c.code">
                {{ c.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p
            id="collection-settings-example"
            data-testid="collection-settings-example"
            class="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-glass-control bg-accent px-4 text-sm"
          >
            <span class="text-muted-foreground">{{ $t("profile.example") }}</span>
            <span class="font-semibold tabular-nums text-foreground" aria-live="polite">{{ currencyExample }}</span>
          </p>
        </div>

        <p
          v-if="error"
          id="collection-settings-error"
          role="alert"
          data-testid="collection-settings-error"
          class="text-sm text-destructive"
        >
          {{ error }}
        </p>

        <div data-collection-settings-actions>
          <Button
            type="submit"
            variant="action"
            size="touch"
            class="max-w-full"
            data-collection-settings-save
            data-testid="collection-settings-save"
            :disabled="!canSave"
            :aria-busy="saving"
          >
            <MdiLoading v-if="saving" class="animate-spin" aria-hidden="true" />
            <span>{{ $t("collection.update_collection") }}</span>
          </Button>
        </div>
      </div>
    </form>
  </div>
</template>

<style>
  [data-testid="collection-settings"] label {
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  [data-testid="collection-settings"] input,
  [data-testid="collection-settings"] [data-collection-currency] {
    min-height: var(--glass-touch);
    height: var(--glass-touch);
    border-radius: var(--glass-radius-control);
    background-color: hsl(var(--background));
  }

  [data-collection-settings-actions] {
    display: flex;
    min-width: 0;
    justify-content: flex-end;
    border-top: 1px solid hsl(var(--border));
    padding-top: 1.25rem;
  }

  [data-collection-settings-save] {
    max-width: 100%;
    white-space: normal;
  }

  @media (max-width: 340px) {
    [data-collection-settings-save] {
      width: 100%;
    }
  }
</style>
