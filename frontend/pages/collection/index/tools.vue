<template>
  <div>
    <AppImportDialog />
    <BaseContainer class="m-0 flex flex-col gap-4 px-0">
      <BaseCard>
        <template #title>
          <BaseSectionHeader>
            <MdiFileChart class="mr-2" />
            <span> {{ $t("tools.reports") }} </span>
            <template #description> {{ $t("tools.reports_sub") }} </template>
          </BaseSectionHeader>
        </template>
        <div class="divide-y border-t px-6 pb-3">
          <DetailAction to="/reports/label-generator">
            <template #title>{{ $t("tools.reports_set.asset_labels") }}</template>
            {{ $t("tools.reports_set.asset_labels_sub") }}
            <template #button>
              {{ $t("tools.reports_set.asset_labels_button") }}
              <MdiArrowRight class="ml-2" />
            </template>
          </DetailAction>
          <DetailAction @action="getBillOfMaterials()">
            <template #title>{{ $t("tools.reports_set.bill_of_materials") }}</template>
            {{ $t("tools.reports_set.bill_of_materials_sub") }}
            <template #button> {{ $t("tools.reports_set.bill_of_materials_button") }} </template>
          </DetailAction>
        </div>
      </BaseCard>
      <BaseCard>
        <template #title>
          <BaseSectionHeader>
            <MdiDatabase class="mr-2" />
            <span> {{ $t("tools.import_export") }} </span>
            <template #description>
              {{ $t("tools.import_export_sub") }}
            </template>
          </BaseSectionHeader>
        </template>
        <div class="divide-y border-t px-6 pb-3">
          <DetailAction @action="openDialog(DialogID.Import)">
            <template #title> {{ $t("tools.import_export_set.import") }} </template>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="DOMPurify.sanitize($t('tools.import_export_set.import_sub'))" />
            <template #button> {{ $t("tools.import_export_set.import_button") }} </template>
          </DetailAction>
          <DetailAction @action="getExportCSV()">
            <template #title>{{ $t("tools.import_export_set.export") }}</template>
            {{ $t("tools.import_export_set.export_sub") }}
            <template #button> {{ $t("tools.import_export_set.export_button") }} </template>
          </DetailAction>
          <form class="space-y-4 py-4" :aria-busy="exportBusy" @submit.prevent="downloadFilteredCSV">
            <h3 class="font-semibold">{{ $t("tools.filtered_export.title") }}</h3>
            <p class="text-sm text-muted-foreground">{{ $t("tools.filtered_export.description") }}</p>
            <div class="space-y-2">
              <Label for="inventory-export-search">{{ $t("tools.filtered_export.search") }}</Label>
              <Input id="inventory-export-search" v-model="exportSearch" type="search" />
            </div>
            <div class="flex flex-wrap gap-2">
              <SearchFilter
                v-model="exportLocations"
                :label="$t('global.locations')"
                :options="exportLocationOptions"
              />
              <SearchFilter v-model="exportTags" :label="$t('global.tags')" :options="exportTagOptions" />
            </div>
            <div class="flex items-center gap-2">
              <Switch id="inventory-export-archived" v-model="exportArchived" />
              <Label for="inventory-export-archived">{{ $t("tools.filtered_export.include_archived") }}</Label>
            </div>
            <p v-if="exportError" role="alert" class="text-sm text-destructive">{{ exportError }}</p>
            <div class="flex flex-wrap gap-2">
              <Button type="submit" :disabled="exportBusy || exportOptionsLoading">
                {{ $t(exportBusy ? "tools.filtered_export.busy" : "tools.filtered_export.download") }}
              </Button>
              <Button type="button" variant="outline" @click="clearExportFilters">{{
                $t("tools.filtered_export.clear")
              }}</Button>
            </div>
          </form>
        </div>
      </BaseCard>
      <BaseCard>
        <template #title>
          <BaseSectionHeader>
            <MdiPackageVariant class="mr-2" />
            <span> {{ $t("tools.backups") }} </span>
            <template #description> {{ $t("tools.backups_sub") }} </template>
          </BaseSectionHeader>
        </template>
        <div class="divide-y border-t px-6 pb-3">
          <DetailAction @action="startBackup">
            <template #title>{{ $t("tools.backups_set.create") }}</template>
            {{ $t("tools.backups_set.create_sub") }}
            <template #button> {{ $t("tools.backups_set.create_button") }} </template>
          </DetailAction>
          <div class="py-3">
            <table v-if="backups.length > 0" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted-foreground">
                  <th class="py-1">{{ $t("tools.backups_set.table.created") }}</th>
                  <th class="py-1">{{ $t("tools.backups_set.table.status") }}</th>
                  <th class="py-1">{{ $t("tools.backups_set.table.size") }}</th>
                  <th class="py-1 text-right">{{ $t("tools.backups_set.table.actions") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in backups" :key="b.id" class="border-t">
                  <td class="py-2">{{ formatCreated(b.createdAt) }}</td>
                  <td class="py-2">
                    <span>{{ b.status }}</span>
                    <span v-if="b.status === 'running'"> ({{ b.progress }}%)</span>
                    <span
                      v-if="b.status === 'failed' && b.error"
                      class="block text-xs text-destructive"
                      :title="b.error"
                    >
                      {{ $t("tools.backups_set.failed") }}
                    </span>
                  </td>
                  <td class="py-2">{{ b.status === "completed" ? formatBytes(b.sizeBytes) : "—" }}</td>
                  <td class="space-x-2 py-2 text-right">
                    <a
                      v-if="b.status === 'completed'"
                      :href="downloadUrl(b.id)"
                      class="text-primary underline"
                      :download="`homebox-export-${b.id}.zip`"
                    >
                      {{ $t("tools.backups_set.download") }}
                    </a>
                    <button class="text-destructive underline" @click="deleteBackup(b.id)">
                      {{ $t("global.delete") }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="text-sm text-muted-foreground">
              {{ $t("tools.backups_set.list_empty") }}
            </p>
          </div>
          <DetailAction>
            <template #title>{{ $t("tools.backups_set.restore") }}</template>
            {{ $t("tools.backups_set.restore_sub") }}
            <template #button>
              <input ref="restoreInput" type="file" accept=".zip" class="hidden" @change="onRestoreFile" />
              <button class="rounded bg-primary px-3 py-1 text-primary-foreground" @click="restoreInput?.click()">
                {{ $t("tools.backups_set.restore_button") }}
              </button>
            </template>
          </DetailAction>
        </div>
      </BaseCard>
      <BaseCard>
        <template #title>
          <BaseSectionHeader>
            <MdiAlert class="mr-2" />
            <span> {{ $t("tools.actions") }} </span>
            <template #description>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="DOMPurify.sanitize($t('tools.actions_sub'))" />
            </template>
          </BaseSectionHeader>
        </template>
        <div class="divide-y border-t px-6 pb-3">
          <DetailAction @action="ensureAssetIDs">
            <template #title>{{ $t("tools.actions_set.ensure_ids") }}</template>
            {{ $t("tools.actions_set.ensure_ids_sub") }}
            <template #button> {{ $t("tools.actions_set.ensure_ids_button") }} </template>
          </DetailAction>
          <DetailAction @action="ensureImportRefs">
            <template #title>{{ $t("tools.actions_set.ensure_import_refs") }}</template>
            {{ $t("tools.actions_set.ensure_import_refs_sub") }}
            <template #button> {{ $t("tools.actions_set.ensure_import_refs_button") }} </template>
          </DetailAction>
          <DetailAction @action="resetItemDateTimes">
            <template #title> {{ $t("tools.actions_set.zero_datetimes") }} </template>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="DOMPurify.sanitize($t('tools.actions_set.zero_datetimes_sub'))" />
            <template #button> {{ $t("tools.actions_set.zero_datetimes_button") }} </template>
          </DetailAction>
          <DetailAction @action="setPrimaryPhotos">
            <template #title> {{ $t("tools.actions_set.set_primary_photo") }} </template>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="DOMPurify.sanitize($t('tools.actions_set.set_primary_photo_sub'))" />
            <template #button> {{ $t("tools.actions_set.set_primary_photo_button") }} </template>
          </DetailAction>
          <DetailAction @action="createMissingThumbnails">
            <template #title> {{ $t("tools.actions_set.create_missing_thumbnails") }} </template>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="DOMPurify.sanitize($t('tools.actions_set.create_missing_thumbnails_sub'))" />
            <template #button> {{ $t("tools.actions_set.create_missing_thumbnails_button") }} </template>
          </DetailAction>
          <DetailAction @action="wipeInventory">
            <template #title> {{ $t("tools.actions_set.wipe_inventory") }} </template>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="DOMPurify.sanitize($t('tools.actions_set.wipe_inventory_sub'))" />
            <template #button> {{ $t("tools.actions_set.wipe_inventory_button") }} </template>
          </DetailAction>
        </div>
      </BaseCard>
    </BaseContainer>
  </div>
</template>

<script setup lang="ts">
  import DOMPurify from "dompurify";
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import MdiFileChart from "~icons/mdi/file-chart";
  import MdiArrowRight from "~icons/mdi/arrow-right";
  import MdiDatabase from "~icons/mdi/database";
  import MdiAlert from "~icons/mdi/alert";
  import MdiPackageVariant from "~icons/mdi/package-variant";
  import { ServerEvent, onServerEvent } from "@/composables/use-server-events";
  import type { CollectionExport } from "@/lib/api/classes/backups";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import AppImportDialog from "@/components/App/ImportDialog.vue";
  import BaseContainer from "@/components/Base/Container.vue";
  import BaseCard from "@/components/Base/Card.vue";
  import BaseSectionHeader from "@/components/Base/SectionHeader.vue";
  import DetailAction from "@/components/DetailAction.vue";

  import SearchFilter from "~/components/Search/Filter.vue";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Button } from "@/components/ui/button";
  import { Switch } from "@/components/ui/switch";
  import type { TreeItem } from "@/lib/api/types/data-contracts";

  const { t } = useI18n();
  const prefs = useViewPreferences();

  definePageMeta({
    middleware: ["auth"],
  });
  useHead({
    title: "HomeBox | " + t("collection.tabs.tools"),
  });

  const { openDialog } = useDialog();

  const api = useUserApi();
  const confirm = useConfirm();
  const pubApi = usePublicApi();
  const { data: status } = useAsyncData(async () => {
    const { data } = await pubApi.status();
    return data;
  });

  const getBillOfMaterials = () => {
    const url = api.reports.billOfMaterialsURL(prefs.value.collectionId ?? undefined);
    window.open(url, "_blank");
  };

  const getExportCSV = () => {
    const url = api.items.exportURL(prefs.value.collectionId ?? undefined);
    window.open(url, "_blank");
  };

  type ExportOption = { id: string; name: string; treeString?: string };
  const exportSearch = ref("");
  const exportLocations = ref<ExportOption[]>([]);
  const exportTags = ref<ExportOption[]>([]);
  const exportArchived = ref(false);
  const exportLocationOptions = ref<ExportOption[]>([]);
  const exportTagOptions = ref<ExportOption[]>([]);
  const exportOptionsLoading = ref(true);
  const exportBusy = ref(false);
  const exportError = ref("");
  let collectionVersion = 0;

  function clearExportFilters() {
    exportSearch.value = "";
    exportLocations.value = [];
    exportTags.value = [];
    exportArchived.value = false;
    exportError.value = "";
  }

  // Load fresh Tools-local options. Shared store caches may still belong to the
  // previous collection, and older in-flight responses must not replace these.
  watch(
    () => prefs.value.collectionId,
    async () => {
      const version = ++collectionVersion;
      clearExportFilters();
      exportLocationOptions.value = [];
      exportTagOptions.value = [];
      exportOptionsLoading.value = true;
      try {
        const client = useUserApi();
        const [locations, tags] = await Promise.all([client.items.getTree(), client.tags.getAll()]);
        if (version !== collectionVersion) return;
        if (locations.error || tags.error) throw new Error("Filter options unavailable");
        const flatten = (items: TreeItem[], prefix = ""): ExportOption[] =>
          items.flatMap(item => [
            { id: item.id, name: item.name, treeString: prefix + item.name },
            ...flatten(item.children ?? [], prefix + item.name + " > "),
          ]);
        exportLocationOptions.value = flatten(locations.data);
        exportTagOptions.value = tags.data;
      } catch {
        if (version === collectionVersion) exportError.value = t("tools.filtered_export.options_error");
      } finally {
        if (version === collectionVersion) exportOptionsLoading.value = false;
      }
    },
    { immediate: true, flush: "sync" }
  );

  async function downloadFilteredCSV() {
    if (exportBusy.value || exportOptionsLoading.value) return;
    const version = collectionVersion;
    const tenant = prefs.value.collectionId ?? undefined;
    const filters = {
      q: exportSearch.value,
      parentIds: exportLocations.value.map(o => o.id),
      tags: exportTags.value.map(o => o.id),
      includeArchived: exportArchived.value,
    };
    exportBusy.value = true;
    exportError.value = "";
    try {
      const blob = await useUserApi().items.exportFilteredCSV(filters, tenant);
      if (version !== collectionVersion) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `homebox-filtered-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Allow the browser to consume the object URL before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (version === collectionVersion) exportError.value = t("tools.filtered_export.error");
    } finally {
      exportBusy.value = false;
    }
  }

  onBeforeUnmount(() => {
    collectionVersion++;
  });

  const ensureAssetIDs = async () => {
    const { isCanceled } = await confirm.open(t("tools.actions_set.ensure_ids_confirm"));

    if (isCanceled) {
      return;
    }

    const result = await api.actions.ensureAssetIDs();

    if (result.error) {
      toast.error(t("tools.toast.failed_ensure_ids"));
      return;
    }

    toast.success(t("tools.toast.asset_success", { results: result.data.completed }));
  };

  const createMissingThumbnails = async () => {
    const { isCanceled } = await confirm.open(t("tools.actions_set.create_missing_thumbnails_confirm"));

    if (isCanceled) {
      return;
    }

    const result = await api.actions.createMissingThumbnails();

    if (result.error) {
      toast.error(t("tools.toast.failed_create_missing_thumbnails"));
      return;
    }

    toast.success(t("tools.toast.asset_success", { results: result.data.completed }));
  };

  const ensureImportRefs = async () => {
    const { isCanceled } = await confirm.open(t("tools.import_export_set.import_ref_confirm"));

    if (isCanceled) {
      return;
    }

    const result = await api.actions.ensureImportRefs();

    if (result.error) {
      toast.error(t("tools.toast.failed_ensure_import_refs"));
      return;
    }

    toast.success(t("tools.toast.asset_success", { results: result.data.completed }));
  };

  const resetItemDateTimes = async () => {
    const { isCanceled } = await confirm.open(t("tools.actions_set.zero_datetimes_confirm"));

    if (isCanceled) {
      return;
    }

    const result = await api.actions.resetItemDateTimes();

    if (result.error) {
      toast.error(t("tools.toast.failed_zero_datetimes"));
      return;
    }

    toast.success(t("tools.toast.asset_success", { results: result.data.completed }));
  };

  const setPrimaryPhotos = async () => {
    const { isCanceled } = await confirm.open(t("tools.actions_set.set_primary_photo_confirm"));

    if (isCanceled) {
      return;
    }

    const result = await api.actions.setPrimaryPhotos();

    if (result.error) {
      toast.error(t("tools.toast.failed_set_primary_photos"));
      return;
    }

    toast.success(t("tools.toast.asset_success", { results: result.data.completed }));
  };

  // ---------------------------------------------------------------------------
  // Backup & Restore
  // ---------------------------------------------------------------------------

  const backups = ref<CollectionExport[]>([]);
  const restoreInput = ref<HTMLInputElement | null>(null);

  async function refreshBackups() {
    const { data, error } = await api.backups.list();
    if (error || !data) {
      return;
    }
    backups.value = data.items ?? [];
  }

  // Initial fetch + live refresh on export/import lifecycle events.
  refreshBackups();
  onServerEvent(ServerEvent.ExportMutation, refreshBackups);
  onServerEvent(ServerEvent.ImportMutation, refreshBackups);

  function downloadUrl(id: string): string {
    return api.backups.downloadURL(id);
  }

  function formatBytes(n: number): string {
    if (!n) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatCreated(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  async function startBackup() {
    const { error } = await api.backups.startExport();
    if (error) {
      toast.error(t("tools.toast.backup_start_failed"));
      return;
    }
    toast.success(t("tools.toast.backup_started"));
    await refreshBackups();
  }

  async function deleteBackup(id: string) {
    const { isCanceled } = await confirm.open(t("tools.backups_set.delete_confirm"));
    if (isCanceled) {
      return;
    }
    const { error } = await api.backups.delete(id);
    if (error) {
      toast.error(t("tools.toast.backup_delete_failed"));
      return;
    }
    await refreshBackups();
  }

  async function onRestoreFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so the user can re-pick the same file later if needed.
    input.value = "";
    if (!file) {
      return;
    }
    const { error, status } = await api.backups.importZip(file);
    if (error) {
      // 409 = empty-group precondition failed.
      if (status === 409) {
        toast.error(t("tools.toast.restore_requires_empty"));
      } else {
        toast.error(t("tools.toast.restore_failed"));
      }
      return;
    }
    toast.success(t("tools.toast.restore_started"));
  }

  const wipeInventory = async () => {
    if (status.value?.demo) {
      await confirm.open(t("tools.demo_mode_error.wipe_inventory"));
      return;
    }

    openDialog(DialogID.WipeInventory, {
      onClose: async result => {
        if (!result) {
          return;
        }

        const apiResult = await api.actions.wipeInventory({
          wipeTags: result.wipeTags,
          wipeLocations: result.wipeLocations,
          wipeMaintenance: result.wipeMaintenance,
        });

        if (apiResult.error) {
          toast.error(t("tools.toast.failed_wipe_inventory"));
          return;
        }

        toast.success(t("tools.toast.wipe_inventory_success", { results: apiResult.data.completed }));
      },
    });
  };
</script>
