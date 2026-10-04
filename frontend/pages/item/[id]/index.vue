<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import type { AnyDetail, Detail, Details } from "~~/components/global/DetailsSection/types";
  import { filterZeroValues } from "~~/components/global/DetailsSection/types";
  import type { ItemAttachment } from "~~/lib/api/types/data-contracts";
  import MdiPlus from "~icons/mdi/plus";
  import MdiMinus from "~icons/mdi/minus";
  import MdiDelete from "~icons/mdi/delete";
  import MdiPlusBoxMultipleOutline from "~icons/mdi/plus-box-multiple-outline";
  import MdiContentSaveEdit from "~icons/mdi/content-save-edit";
  import MdiDotsHorizontal from "~icons/mdi/dots-horizontal";
  import MdiChevronLeft from "~icons/mdi/chevron-left";
  import MdiChevronRight from "~icons/mdi/chevron-right";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import { Button } from "@/components/ui/button";
  import { inventoryResultsBackHref } from "~/lib/shell-nav";
  import { useDialog } from "@/components/ui/dialog-provider";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import BaseContainer from "@/components/Base/Container.vue";
  import ItemImageDialog from "~/components/Item/ImageDialog.vue";
  import ItemDuplicateSettings from "~/components/Item/DuplicateSettings.vue";
  import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import TagChip from "~/components/Tag/Chip.vue";
  import DateTime from "~/components/global/DateTime.vue";
  import LabelMaker from "~/components/global/LabelMaker.vue";
  import Markdown from "~/components/global/Markdown.vue";
  import BaseCard from "@/components/Base/Card.vue";
  import CopyText from "@/components/global/CopyText.vue";
  import DetailsSection from "~/components/global/DetailsSection/DetailsSection.vue";
  import ItemAttachmentsList from "~/components/Item/AttachmentsList.vue";
  import ItemViewSelectable from "~/components/Item/View/Selectable.vue";

  const { t } = useI18n();

  const { openDialog, closeDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const route = useRoute();
  const api = useUserApi();

  const backToSearch = ref("/items");
  function syncBackToSearch() {
    if (!import.meta.client) {
      return;
    }
    const state = window.history.state as { back?: unknown } | null;
    backToSearch.value = inventoryResultsBackHref(state?.back);
  }
  // During page setup the router may still hold the previous entry's history
  // state. Read it after mounting/navigation instead of caching that stale value.
  onMounted(syncBackToSearch);
  watch(() => route.fullPath, syncBackToSearch, { flush: "post" });

  const itemId = computed<string>(() => route.params.id as string);
  const preferences = useViewPreferences();

  const temporaryDuplicateSettings = ref<DuplicateSettings>({
    copyMaintenance: preferences.value.duplicateSettings.copyMaintenance,
    copyAttachments: preferences.value.duplicateSettings.copyAttachments,
    copyCustomFields: preferences.value.duplicateSettings.copyCustomFields,
    copyPrefixOverride: preferences.value.duplicateSettings.copyPrefixOverride,
  });

  const hasNested = computed<boolean>(() => {
    return route.fullPath.split("/").at(-1) !== itemId.value;
  });

  const itemLoadFailed = ref(false);

  const {
    data: item,
    pending: itemPending,
    refresh,
  } = useAsyncData(
    () => `item-detail:${itemId.value}`,
    async () => {
      itemLoadFailed.value = false;
      const { data, error } = await api.items.get(itemId.value);
      if (error || !data) {
        // Keep the existing toast and home recovery. Do not leave the previous record on screen.
        itemLoadFailed.value = true;
        toast.error(t("items.toast.failed_load_item"));
        await navigateTo("/home");
        return null;
      }
      return data;
    },
    {
      // Without lazy, Nuxt suspends the page until the item returns, so a held or failed
      // fetch never paints loading or error feedback.
      lazy: true,
    }
  );
  onMounted(() => {
    refresh();
  });

  const lastRoute = ref(route.fullPath);
  watchEffect(() => {
    if (lastRoute.value.endsWith("edit")) {
      refresh();
    }

    lastRoute.value = route.fullPath;
  });

  async function adjustQuantity(amount: number) {
    if (!item.value) {
      return;
    }

    const newQuantity = item.value.quantity + amount;
    if (newQuantity < 0) {
      toast.error(t("items.toast.quantity_cannot_negative"));
      return;
    }

    const resp = await api.items.patch(item.value.id, {
      id: item.value.id,
      quantity: newQuantity,
    });

    if (resp.error) {
      toast.error(t("items.toast.failed_adjust_quantity"));
      return;
    }

    if (resp.data) {
      item.value = resp.data;
    }
  }

  type FilteredAttachments = {
    attachments: ItemAttachment[];
    warranty: ItemAttachment[];
    manuals: ItemAttachment[];
    receipts: ItemAttachment[];
  };

  type Photo = {
    thumbnailSrc?: string;
    originalSrc: string;
    attachmentId: string;
    originalType?: string;
  };

  const itemTags = computed(() => {
    return useTagStore().withAncestors(item.value?.tags || []);
  });

  const photos = computed<Photo[]>(() => {
    if (!item.value) {
      return [];
    }
    return (
      item.value.attachments.reduce((acc, cur) => {
        if (cur.type === "photo") {
          const photo: Photo = {
            originalSrc: api.authURL(`/entities/${item.value!.id}/attachments/${cur.id}`),
            originalType: cur.mimeType,
            attachmentId: cur.id,
          };
          const thumbnailId = cur.thumbnail?.id;
          if (thumbnailId) {
            photo.thumbnailSrc = api.authURL(`/entities/${item.value!.id}/attachments/${thumbnailId}`);
          }
          acc.push(photo);
        }
        return acc;
      }, [] as Photo[]) || []
    );
  });

  const attachments = computed<FilteredAttachments>(() => {
    if (!item.value) {
      return {
        attachments: [],
        manuals: [],
        warranty: [],
        receipts: [],
      };
    }

    return item.value.attachments.reduce(
      (acc, attachment) => {
        if (attachment.type === "photo") {
          return acc;
        }
        if (attachment.type === "warranty") {
          acc.warranty.push(attachment);
        } else if (attachment.type === "manual") {
          acc.manuals.push(attachment);
        } else if (attachment.type === "receipt") {
          acc.receipts.push(attachment);
        } else {
          acc.attachments.push(attachment);
        }
        return acc;
      },
      {
        attachments: [] as ItemAttachment[],
        warranty: [] as ItemAttachment[],
        manuals: [] as ItemAttachment[],
        receipts: [] as ItemAttachment[],
      }
    );
  });

  const assetID = computed<Details>(() => {
    if (!item.value) {
      return [];
    }

    if (item.value?.assetId === "000-000") {
      return [];
    }

    return [
      {
        name: "items.asset_id",
        text: item.value?.assetId,
      },
    ];
  });

  const itemDetails = computed<Details>(() => {
    if (!item.value) {
      return [];
    }

    const ret: Details = [
      {
        name: "items.quantity",
        text: item.value?.quantity,
        slot: "quantity",
      },
      {
        name: "items.serial_number",
        text: item.value?.serialNumber,
        copyable: true,
      },
      {
        name: "items.model_number",
        text: item.value?.modelNumber,
        copyable: true,
      },
      {
        name: "items.manufacturer",
        text: item.value?.manufacturer,
        copyable: true,
      },
      {
        name: "items.insured",
        text: item.value?.insured ? "Yes" : "No",
      },
      {
        name: "items.archived",
        text: item.value?.archived ? "Yes" : "No",
      },
      {
        name: "items.notes",
        type: "markdown",
        text: item.value?.notes,
      },
      ...assetID.value,
      ...item.value.fields.map(field => {
        /**
         * Support Special URL Syntax
         */
        const url = maybeUrl(field.textValue);
        if (url.isUrl) {
          return {
            type: "link",
            name: field.name,
            text: url.text,
            href: url.url,
          } as AnyDetail;
        }

        return {
          name: field.name,
          text: field.textValue,
        };
      }),
    ];

    if (!preferences.value.showEmpty) {
      return filterZeroValues(ret);
    }

    return ret;
  });

  const showAttachments = computed(() => {
    if (preferences.value?.showEmpty) {
      return true;
    }

    return (
      attachments.value.attachments.length > 0 ||
      attachments.value.warranty.length > 0 ||
      attachments.value.manuals.length > 0 ||
      attachments.value.receipts.length > 0
    );
  });

  const attachmentDetails = computed(() => {
    const details: Detail[] = [];

    const push = (name: string, slot: string) => {
      details.push({
        name,
        text: "",
        slot,
      });
    };

    if (attachments.value.attachments.length > 0) {
      push("items.attachments", "attachments");
    }

    if (attachments.value.warranty.length > 0) {
      push("items.warranty", "warranty");
    }

    if (attachments.value.manuals.length > 0) {
      push("items.manuals", "manuals");
    }

    if (attachments.value.receipts.length > 0) {
      push("items.receipts", "receipts");
    }

    return details;
  });

  const showWarranty = computed(() => {
    if (preferences.value.showEmpty) {
      return true;
    }
    return item.value?.lifetimeWarranty || validDate(item.value?.warrantyExpires);
  });

  const warrantyDetails = computed(() => {
    const details: Details = [
      {
        name: "items.lifetime_warranty",
        text: item.value?.lifetimeWarranty ? "Yes" : "No",
      },
    ];

    if (item.value?.lifetimeWarranty) {
      details.push({
        name: "items.warranty_expires",
        text: "N/A",
      });
    } else {
      details.push({
        name: "items.warranty_expires",
        text: item.value?.warrantyExpires || "",
        type: "date",
        date: true,
      });
    }

    details.push({
      name: "items.warranty_details",
      type: "markdown",
      text: item.value?.warrantyDetails || "",
    });

    if (!preferences.value.showEmpty) {
      return filterZeroValues(details);
    }

    return details;
  });

  const showPurchase = computed(() => {
    if (preferences.value.showEmpty) {
      return true;
    }
    return item.value?.purchaseFrom || item.value?.purchasePrice !== 0 || validDate(item.value?.purchaseDate);
  });

  const purchaseDetails = computed<Details>(() => {
    const v: Details = [
      {
        name: "items.purchased_from",
        text: item.value?.purchaseFrom || "",
      },
      {
        name: "items.purchase_price",
        text: String(item.value?.purchasePrice) || "",
        type: "currency",
      },
      {
        name: "items.purchase_date",
        text: item.value?.purchaseDate || "",
        type: "date",
        date: true,
      },
    ];

    if (!preferences.value.showEmpty) {
      return filterZeroValues(v);
    }

    return v;
  });

  const showSold = computed(() => {
    if (preferences.value.showEmpty) {
      return true;
    }
    return item.value?.soldTo || item.value?.soldPrice !== 0 || validDate(item.value?.soldDate);
  });

  const soldDetails = computed<Details>(() => {
    const v: Details = [
      {
        name: "items.sold_to",
        text: item.value?.soldTo || "",
      },
      {
        name: "items.sold_price",
        text: String(item.value?.soldPrice) || "",
        type: "currency",
      },
      {
        name: "items.sold_at",
        text: item.value?.soldDate || "",
        type: "date",
        date: true,
      },
    ];

    if (!preferences.value.showEmpty) {
      return filterZeroValues(v);
    }

    return v;
  });

  function openImageDialog(img: Photo, itemId: string) {
    openDialog(DialogID.ItemImage, {
      params: {
        type: "preloaded",
        originalSrc: img.originalSrc,
        originalType: img.originalType,
        thumbnailSrc: img.thumbnailSrc,
        attachmentId: img.attachmentId,
        itemId,
      },
      onClose: result => {
        if (result?.action === "delete") {
          item.value!.attachments = item.value!.attachments.filter(a => a.id !== result.id);
        }
      },
    });
  }

  const currentUrl = computed(() => {
    return window.location.href;
  });

  const currentPath = computed(() => {
    return route.path;
  });

  const tabs = computed(() => {
    return [
      {
        id: "details",
        name: "global.details",
        to: `/item/${itemId.value}`,
      },
      {
        id: "log",
        name: "global.maintenance",
        to: `/item/${itemId.value}/maintenance`,
      },
      {
        id: "edit",
        name: "global.edit",
        to: `/item/${itemId.value}/edit`,
      },
    ];
  });

  const fullpath = computedAsync(async () => {
    if (!item.value) {
      return [];
    }

    const resp = await api.items.fullpath(item.value.id);
    if (resp.error) {
      toast.error(t("items.toast.failed_load_item"));
      return [];
    }

    return resp.data;
  });

  const locationAncestors = computed(() => {
    const path = fullpath.value;
    if (!Array.isArray(path)) {
      return [];
    }
    const currentId = item.value?.id;
    return path.filter(part => part.id !== currentId);
  });

  const recordedAssetId = computed(() => {
    const raw = item.value?.assetId;
    if (typeof raw !== "string") {
      return "";
    }
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "000-000") {
      return "";
    }
    return raw;
  });

  const { data: items, refresh: refreshItemList } = useAsyncData(
    () => itemId.value + "_item_list",
    async () => {
      if (!itemId.value) {
        return [];
      }

      const resp = await api.items.getAll({
        parentIds: [itemId.value],
      });

      if (resp.error) {
        toast.error(t("items.toast.failed_load_items"));
        return [];
      }

      return resp.data.items;
    },
    {
      watch: [itemId],
    }
  );

  async function duplicateItem(settings?: DuplicateSettings) {
    if (!item.value) {
      return;
    }

    const duplicateSettings = settings
      ? {
          copyMaintenance: settings.copyMaintenance,
          copyAttachments: settings.copyAttachments,
          copyCustomFields: settings.copyCustomFields,
          copyPrefix: settings.copyPrefixOverride ?? t("items.duplicate.prefix"),
        }
      : {
          copyMaintenance: preferences.value.duplicateSettings.copyMaintenance,
          copyAttachments: preferences.value.duplicateSettings.copyAttachments,
          copyCustomFields: preferences.value.duplicateSettings.copyCustomFields,
          copyPrefix: preferences.value.duplicateSettings.copyPrefixOverride ?? t("items.duplicate.prefix"),
        };

    const { error, data } = await api.items.duplicate(itemId.value, duplicateSettings);

    if (error) {
      toast.error(t("items.toast.failed_duplicate_item"));
      return;
    }

    navigateTo(`/item/${data.id}`);
  }

  function handleDuplicateClick(event: MouseEvent) {
    if (event.shiftKey) {
      openDialog(DialogID.DuplicateTemporarySettings);
    } else {
      duplicateItem();
    }
  }

  const confirm = useConfirm();

  async function deleteItem() {
    const confirmed = await confirm.open(t("items.delete_item_confirm"));

    if (!confirmed.data) {
      return;
    }

    const { error } = await api.items.delete(itemId.value);
    if (error) {
      toast.error(t("items.toast.failed_delete_item"));
      return;
    }
    toast.success(t("items.toast.item_deleted"));
    navigateTo("/home");
  }

  async function saveAsTemplate() {
    if (!item.value) {
      return;
    }

    const NIL_UUID = "00000000-0000-0000-0000-000000000000";

    // Create template from item data
    const templateData = {
      name: `Template: ${item.value.name}`,
      description: "",
      notes: "",
      defaultName: item.value.name,
      defaultDescription: item.value.description || "",
      defaultQuantity: item.value.quantity,
      defaultInsured: item.value.insured,
      defaultManufacturer: item.value.manufacturer || "",
      defaultModelNumber: item.value.modelNumber || "",
      defaultLifetimeWarranty: item.value.lifetimeWarranty,
      defaultWarrantyDetails: item.value.warrantyDetails || "",
      defaultLocationId: item.value.location?.id || item.value.parent?.id || "",
      defaultTagIds: item.value.tags?.map(l => l.id) || [],
      includeWarrantyFields: !!(
        item.value.warrantyDetails ||
        item.value.lifetimeWarranty ||
        item.value.warrantyExpires
      ),
      includePurchaseFields: !!(item.value.purchaseFrom || item.value.purchasePrice || item.value.purchaseDate),
      includeSoldFields: !!(item.value.soldTo || item.value.soldPrice || item.value.soldDate),
      fields: item.value.fields.map(field => ({
        id: NIL_UUID,
        name: field.name,
        type: "text",
        textValue: field.textValue || "",
      })),
    };

    const { data, error } = await api.templates.create(templateData);
    if (error) {
      toast.error(t("components.template.toast.create_failed"));
      return;
    }

    toast.success(t("components.template.toast.saved_as_template", { name: templateData.name }));
    navigateTo(`/template/${data.id}`);
  }

  async function createSubitem() {
    openDialog(DialogID.CreateEntity, {
      params: {
        baseType: "item",
        subItem: true,
      },
    });
  }
</script>

<template>
  <BaseContainer v-if="item && item.id === itemId && !itemLoadFailed" class="flex min-w-0 flex-col gap-glass-section">
    <!-- set page title -->
    <Title>{{ item.name }}</Title>

    <ItemImageDialog />
    <Dialog :dialog-id="DialogID.DuplicateTemporarySettings">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t("items.duplicate.temporary_title") }}</DialogTitle>
        </DialogHeader>
        <ItemDuplicateSettings v-model="temporaryDuplicateSettings" />
        <DialogFooter>
          <Button
            type="button"
            @click="
              closeDialog(DialogID.DuplicateTemporarySettings);
              duplicateItem(temporaryDuplicateSettings);
            "
          >
            {{ $t("global.duplicate") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <section class="flex min-w-0 flex-col gap-3" data-testid="item-identity">
      <NuxtLink
        :to="backToSearch"
        class="glass-focus inline-flex min-h-touch w-fit max-w-full items-center gap-1 rounded-md px-1 text-sm font-semibold text-primary"
        data-testid="item-back-to-search"
      >
        <MdiChevronLeft class="size-5 shrink-0" aria-hidden="true" />
        {{ $t("items.back_to_search") }}
      </NuxtLink>

      <nav
        v-if="locationAncestors.length > 0"
        class="min-w-0"
        :aria-label="$t('items.location')"
        data-testid="item-location"
      >
        <ol class="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li
            v-for="(part, idx) in locationAncestors"
            :key="part.id"
            class="flex min-w-0 max-w-full items-center gap-1"
          >
            <NuxtLink
              :to="`/${part.type}/${part.id}`"
              class="glass-focus inline-flex min-h-touch min-w-0 items-center break-words rounded-md px-1"
            >
              {{ part.name }}
            </NuxtLink>
            <MdiChevronRight v-if="idx < locationAncestors.length - 1" class="size-4 shrink-0" aria-hidden="true" />
          </li>
        </ol>
      </nav>

      <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h1
          class="min-w-0 flex-1 break-words text-3xl font-semibold tracking-tight text-foreground"
          data-testid="item-name"
        >
          {{ item.name }}
        </h1>
        <Button as-child variant="action" size="touch" class="shrink-0">
          <NuxtLink :to="`/item/${itemId}/edit`" data-testid="item-edit">
            {{ $t("items.edit_item") }}
          </NuxtLink>
        </Button>
      </div>

      <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-1 flex-wrap gap-2" data-testid="item-tags">
          <span v-for="tag in itemTags" :key="tag.id" class="inline-flex max-w-full items-center">
            <TagChip :tag="tag" :ancestors="tag.ancestors" />
            <span v-if="tag.ancestors" class="sr-only">{{ $t("items.inherited_tag") }}</span>
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="glass"
              size="touch"
              :aria-label="$t('global.more_actions')"
              data-testid="item-more"
            >
              <MdiDotsHorizontal aria-hidden="true" />
              {{ $t("items.more") }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuItem class="min-h-touch" @click="handleDuplicateClick">
              <MdiPlusBoxMultipleOutline class="mr-2 size-4" />
              {{ $t("global.duplicate") }}
            </DropdownMenuItem>
            <DropdownMenuItem class="min-h-touch" @click="saveAsTemplate">
              <MdiContentSaveEdit class="mr-2 size-4" />
              {{ $t("components.template.save_as_template") }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="min-h-touch text-destructive focus:text-destructive" @click="deleteItem">
              <MdiDelete class="mr-2 size-4" />
              {{ $t("global.delete") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="glass-panel min-w-0 p-5" data-testid="item-summary">
        <p class="glass-kicker">{{ $t("items.asset_id") }}</p>
        <p
          class="mt-1 break-words text-sm"
          :class="recordedAssetId ? 'font-medium text-foreground' : 'text-muted-foreground'"
          data-testid="item-asset-id"
        >
          {{ recordedAssetId || $t("items.not_recorded") }}
        </p>
        <div
          v-if="item.description"
          class="prose mt-3 max-w-full break-words text-foreground"
          data-testid="item-description"
        >
          <Markdown class="text-base" :source="item.description" />
        </div>
        <div class="mt-4 flex min-w-0 flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
          <div class="flex min-w-0 flex-wrap gap-6">
            <div class="min-w-0">
              <p class="text-2xl font-semibold text-foreground" data-testid="item-quantity">{{ item.quantity }}</p>
              <p class="text-sm text-muted-foreground">{{ $t("items.quantity") }}</p>
            </div>
            <div class="min-w-0">
              <p
                class="break-words text-lg font-semibold"
                :class="item.insured ? 'text-primary' : 'text-foreground'"
                data-testid="item-coverage"
              >
                {{ item.insured ? $t("items.search_card_insured") : $t("items.search_card_not_insured") }}
              </p>
              <p class="text-sm text-muted-foreground">{{ $t("items.coverage") }}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="glass"
            size="touch"
            class="shrink-0"
            data-testid="item-create-subitem"
            @click="createSubitem"
          >
            <MdiPlus aria-hidden="true" />
            {{ $t("global.create_subitem") }}
          </Button>
        </div>
      </div>

      <nav class="glass-tabs max-w-full" :aria-label="$t('items.sections')" data-testid="item-sections">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.id"
          :to="tab.to"
          class="glass-focus inline-flex min-h-touch items-center justify-center rounded-pill px-5 text-sm font-medium"
          :class="tab.to === currentPath ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'"
          :aria-current="tab.to === currentPath ? 'page' : undefined"
        >
          {{ $t(tab.name) }}
        </NuxtLink>
      </nav>

      <div class="max-w-full overflow-x-auto" data-testid="item-labels">
        <LabelMaker v-if="typeof item.assetId === 'string' && item.assetId != ''" :id="item.assetId" type="asset" />
        <LabelMaker v-else :id="item.id" type="item" />
      </div>
    </section>

    <section class="min-w-0">
      <div class="space-y-6">
        <!-- this renders the other pages content -->
        <NuxtPage :item="item" :page-key="itemId" />

        <!-- anything in this is not rendered if on another page -->
        <BaseCard v-if="!hasNested" collapsable variant="readable" data-testid="item-details">
          <template #title> {{ $t("items.details") }} </template>
          <template #title-actions>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-4">
              <Label class="flex min-h-touch cursor-pointer items-center gap-2" data-testid="item-show-empty">
                <Switch v-model="preferences.showEmpty" />
                {{ $t("items.show_empty") }}
              </Label>
              <div class="space-x-1">
                <CopyText :text="currentUrl" :icon-size="16" size="touch-icon" />
              </div>
            </div>
          </template>
          <DetailsSection variant="compact" :details="itemDetails">
            <template #quantity="{ detail }">
              <div class="flex min-w-0 flex-wrap items-center gap-2 min-[280px]:justify-end">
                <span>{{ detail.text }}</span>
                <span class="inline-flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="touch-icon"
                    variant="outline"
                    class="glass-focus rounded-full"
                    :aria-label="$t('items.quantity_decrease')"
                    data-testid="item-quantity-decrease"
                    @click="adjustQuantity(-1)"
                  >
                    <MdiMinus />
                  </Button>
                  <Button
                    type="button"
                    size="touch-icon"
                    variant="outline"
                    class="glass-focus rounded-full"
                    :aria-label="$t('items.quantity_increase')"
                    data-testid="item-quantity-increase"
                    @click="adjustQuantity(1)"
                  >
                    <MdiPlus />
                  </Button>
                </span>
              </div>
            </template>
          </DetailsSection>
        </BaseCard>

        <!-- anything in this is not rendered if on another page -->
        <template v-if="!hasNested">
          <BaseCard v-if="showPurchase" collapsable variant="readable" data-testid="item-purchase">
            <template #title> {{ $t("items.purchase_details") }} </template>
            <DetailsSection variant="compact" :details="purchaseDetails" />
          </BaseCard>

          <BaseCard v-if="photos.length > 0" variant="readable" data-testid="item-photos">
            <template #title> {{ $t("items.photos") }} </template>
            <div
              class="scroll-bg container mx-auto flex max-h-[500px] max-w-full flex-wrap gap-2 overflow-y-auto border-t p-4"
            >
              <button
                v-for="img in photos"
                :key="img.attachmentId"
                type="button"
                class="glass-focus inline-flex min-h-touch min-w-touch items-center justify-center"
                :aria-label="$t('items.photo')"
                data-testid="item-photo"
                :data-attachment-id="img.attachmentId"
                @click="openImageDialog(img, item.id)"
              >
                <img
                  class="max-h-[200px] max-w-full rounded"
                  :src="img.thumbnailSrc || img.originalSrc"
                  :alt="$t('items.photo')"
                  data-testid="item-photo-image"
                  loading="lazy"
                />
              </button>
            </div>
          </BaseCard>

          <BaseCard v-if="showAttachments" collapsable variant="readable" data-testid="item-attachments">
            <template #title> {{ $t("items.attachments") }} </template>
            <DetailsSection v-if="attachmentDetails.length > 0" :details="attachmentDetails">
              <template #manuals>
                <ItemAttachmentsList
                  v-if="attachments.manuals.length > 0"
                  :attachments="attachments.manuals"
                  :item-id="item.id"
                />
              </template>
              <template #attachments>
                <ItemAttachmentsList
                  v-if="attachments.attachments.length > 0"
                  :attachments="attachments.attachments"
                  :item-id="item.id"
                />
              </template>
              <template #warranty>
                <ItemAttachmentsList
                  v-if="attachments.warranty.length > 0"
                  :attachments="attachments.warranty"
                  :item-id="item.id"
                />
              </template>
              <template #receipts>
                <ItemAttachmentsList
                  v-if="attachments.receipts.length > 0"
                  :attachments="attachments.receipts"
                  :item-id="item.id"
                />
              </template>
            </DetailsSection>
            <div v-else>
              <p class="px-6 pb-4 text-foreground/70">{{ $t("items.no_attachments") }}</p>
            </div>
          </BaseCard>

          <BaseCard v-if="showWarranty" collapsable variant="readable" data-testid="item-warranty">
            <template #title> {{ $t("items.warranty_details") }} </template>
            <DetailsSection variant="compact" :details="warrantyDetails" />
          </BaseCard>

          <BaseCard v-if="showSold" collapsable variant="readable" data-testid="item-sold">
            <template #title> {{ $t("items.sold_details") }} </template>
            <DetailsSection variant="compact" :details="soldDetails" />
          </BaseCard>
        </template>
      </div>
    </section>

    <section v-if="items && items.length > 0" class="min-w-0" data-testid="item-children">
      <ItemViewSelectable :items="items" @refresh="refreshItemList" />
    </section>

    <footer
      class="flex min-w-0 flex-wrap justify-between gap-2 text-xs text-muted-foreground"
      data-testid="item-timestamps"
    >
      <div>
        {{ $t("items.created_at") }}
        <DateTime :date="item.createdAt" />
      </div>
      <div>
        {{ $t("items.updated_at") }}
        <DateTime :date="item.updatedAt" />
      </div>
    </footer>
  </BaseContainer>
  <BaseContainer
    v-else
    class="flex min-w-0 flex-col gap-3 py-6"
    :data-testid="itemLoadFailed ? 'item-load-error' : 'item-loading'"
    :aria-busy="itemPending && !itemLoadFailed ? true : undefined"
  >
    <p role="status" class="text-sm font-medium text-foreground">
      {{ itemLoadFailed ? $t("items.load_error") : $t("items.loading") }}
    </p>
  </BaseContainer>
</template>

<style lang="css" scoped>
  /* Style dialog background */
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  [data-testid="item-tags"] :deep(a) {
    min-height: 2.75rem;
    max-width: 100%;
    height: auto;
    align-items: center;
    white-space: normal;
    overflow-wrap: anywhere;
    padding-block: 0.5rem;
    padding-inline: 0.875rem;
  }

  [data-testid="item-tags"] :deep(a:focus-visible) {
    outline: 2px solid hsl(var(--glass-edge));
    outline-offset: 2px;
  }
</style>
