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
  import MdiChevronLeft from "~icons/mdi/chevron-left";
  import MdiDotsHorizontal from "~icons/mdi/dots-horizontal";
  import { inventoryResultsBackHref } from "~/lib/shell-nav";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
  } from "@/components/ui/breadcrumb";
  import { Button } from "@/components/ui/button";
  import { useDialog } from "@/components/ui/dialog-provider";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
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
  const router = useRouter();
  const api = useUserApi();

  const backToSearch = computed(() => {
    // Re-read history when moving between details, edit and maintenance.
    void route.fullPath;
    return inventoryResultsBackHref(router.options.history.state?.back);
  });

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

  const { data: item, refresh } = useAsyncData(itemId.value, async () => {
    const { data, error } = await api.items.get(itemId.value);
    if (error) {
      toast.error(t("items.toast.failed_load_item"));
      navigateTo("/home");
      return;
    }
    return data;
  });
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
          if (cur.thumbnail) {
            photo.thumbnailSrc = api.authURL(`/entities/${item.value!.id}/attachments/${cur.thumbnail.id}`);
          } else {
            photo.thumbnailSrc = photo.originalSrc; // fallback to itself if no thumbnail
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

  const activeSection = computed(() => tabs.value.find(tab => tab.to === currentPath.value)?.id ?? "details");

  const EMPTY_ASSET_ID = "000-000";

  const assetIdDisplay = computed(() => {
    const id = item.value?.assetId?.trim() ?? "";
    if (!id || id === EMPTY_ASSET_ID) {
      return "";
    }
    return id;
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

  const locationPath = computed(() => {
    const path = fullpath.value ?? [];
    if (!item.value) {
      return [];
    }
    return path.filter(part => part.id !== item.value!.id);
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
  <div
    v-if="item"
    class="glass-page mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-glass-section"
    data-testid="item-page"
  >
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

    <section class="glass-section min-w-0" data-testid="item-identity">
      <NuxtLink
        :to="backToSearch"
        class="glass-touch glass-focus inline-flex w-fit max-w-full items-center gap-1 rounded-full px-2 text-sm font-semibold text-primary"
        data-testid="item-back-to-search"
      >
        <MdiChevronLeft class="size-5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 break-words">{{ $t("items.back_to_search") }}</span>
      </NuxtLink>

      <nav v-if="locationPath.length > 0" :aria-label="$t('items.location_hierarchy')" data-testid="item-location">
        <Breadcrumb>
          <BreadcrumbList class="gap-1">
            <BreadcrumbItem v-for="(part, idx) in locationPath" :key="part.id" class="min-w-0">
              <BreadcrumbLink as-child>
                <NuxtLink
                  :to="`/${part.type}/${part.id}`"
                  class="glass-focus inline-flex min-h-11 min-w-11 max-w-full items-center rounded-full px-2 text-sm text-muted-foreground [overflow-wrap:anywhere]"
                >
                  {{ part.name }}
                </NuxtLink>
              </BreadcrumbLink>
              <BreadcrumbSeparator v-if="idx < locationPath.length - 1" />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </nav>

      <div class="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-64">
          <h1 class="glass-title break-words [overflow-wrap:anywhere]" data-testid="item-name">
            {{ item.name }}
          </h1>
          <div
            v-if="itemTags.length > 0"
            class="mt-3 flex min-w-0 flex-wrap gap-2"
            data-item-tags
            data-testid="item-tags"
          >
            <TagChip v-for="tag in itemTags" :key="tag.id" :tag="tag" size="md" :ancestors="tag.ancestors" />
          </div>
        </div>
        <div class="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0">
          <Button as-child variant="action" size="touch" class="shrink-0">
            <NuxtLink :to="`/item/${itemId}/edit`" data-testid="item-edit">
              {{ $t("items.edit_item") }}
            </NuxtLink>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="glass"
                size="touch"
                class="shrink-0"
                :aria-label="$t('global.more_actions')"
                data-testid="item-more"
              >
                <MdiDotsHorizontal aria-hidden="true" />
                {{ $t("global.more") }}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-auto min-w-56 max-w-[min(24rem,calc(100vw-2rem))]">
              <DropdownMenuItem class="glass-focus min-h-11" @click="handleDuplicateClick">
                <MdiPlusBoxMultipleOutline class="mr-2 size-4" />
                {{ $t("global.duplicate") }}
              </DropdownMenuItem>
              <DropdownMenuItem class="glass-focus min-h-11" @click="saveAsTemplate">
                <MdiContentSaveEdit class="mr-2 size-4" />
                {{ $t("components.template.save_as_template") }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="glass-focus min-h-11 text-destructive focus:text-destructive"
                @click="deleteItem"
              >
                <MdiDelete class="mr-2 size-4" />
                {{ $t("global.delete") }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div class="max-w-full overflow-x-auto p-2" data-testid="item-label-maker">
                <LabelMaker
                  v-if="typeof item.assetId === 'string' && item.assetId != ''"
                  :id="item.assetId"
                  type="asset"
                />
                <LabelMaker v-else :id="item.id" type="item" />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div class="glass-panel min-w-0 px-4 py-5 shadow-sm md:px-6" data-testid="item-summary">
        <p class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span class="glass-eyebrow shrink-0">{{ $t("items.asset_id") }}</span>
          <span
            class="min-w-0 text-base font-semibold tracking-normal [overflow-wrap:anywhere]"
            data-testid="item-asset-id"
          >
            {{ assetIdDisplay || $t("items.not_recorded") }}
          </span>
        </p>
        <div v-if="item.description" class="prose mt-3 max-w-full break-words" data-testid="item-description">
          <Markdown class="text-base" :source="item.description" />
        </div>
        <div class="mt-4 flex min-w-0 flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
          <dl class="flex min-w-0 flex-wrap gap-x-8 gap-y-3">
            <div class="min-w-0">
              <dd class="text-3xl font-bold leading-none [overflow-wrap:anywhere]" data-testid="item-quantity">
                {{ item.quantity }}
              </dd>
              <dt class="mt-1 text-sm text-muted-foreground">{{ $t("global.quantity") }}</dt>
            </div>
            <div class="min-w-0">
              <dd
                class="text-2xl font-bold leading-tight [overflow-wrap:anywhere]"
                :class="item.insured ? 'text-primary' : 'text-foreground'"
                data-testid="item-insured"
              >
                {{ item.insured ? $t("items.search_card_insured") : $t("items.search_card_not_insured") }}
              </dd>
              <dt class="mt-1 text-sm text-muted-foreground">{{ $t("items.coverage") }}</dt>
            </div>
          </dl>
          <Button
            type="button"
            variant="glass"
            size="touch"
            class="shrink-0"
            data-testid="item-create-subitem"
            @click="createSubitem"
          >
            <MdiPlus />
            {{ $t("global.create_subitem") }}
          </Button>
        </div>
      </div>

      <nav class="glass-tabs" :aria-label="$t('items.sections')" data-testid="item-sections">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.id"
          :to="tab.to"
          class="glass-focus inline-flex max-w-full items-center justify-center text-center"
          :class="{ active: tab.id === activeSection }"
          :aria-current="tab.id === activeSection ? 'page' : undefined"
          :data-state="tab.id === activeSection ? 'active' : 'inactive'"
        >
          {{ $t(tab.name) }}
        </NuxtLink>
      </nav>
    </section>

    <section>
      <div class="space-y-6">
        <!-- this renders the other pages content -->
        <NuxtPage :item="item" :page-key="itemId" />

        <!-- anything in this is not rendered if on another page -->
        <BaseCard v-if="!hasNested" collapsable>
          <template #title> {{ $t("items.details") }} </template>
          <template #title-actions>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-4">
              <Label class="flex cursor-pointer items-center gap-2">
                <Switch v-model="preferences.showEmpty" />
                {{ $t("items.show_empty") }}
              </Label>
              <div class="space-x-1">
                <CopyText :text="currentUrl" :icon-size="16" />
              </div>
            </div>
          </template>
          <DetailsSection :details="itemDetails">
            <template #quantity="{ detail }">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="min-w-0 [overflow-wrap:anywhere]">{{ detail.text }}</span>
                <span class="inline-flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="touch-icon"
                    variant="outline"
                    class="rounded-full"
                    :aria-label="$t('items.decrease_quantity')"
                    data-testid="item-quantity-decrease"
                    @click="adjustQuantity(-1)"
                  >
                    <MdiMinus />
                  </Button>
                  <Button
                    type="button"
                    size="touch-icon"
                    variant="outline"
                    class="rounded-full"
                    :aria-label="$t('items.increase_quantity')"
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
          <BaseCard v-if="photos && photos.length > 0">
            <template #title> {{ $t("items.photos") }} </template>
            <div class="scroll-bg container mx-auto flex max-h-[500px] flex-wrap gap-2 overflow-y-scroll border-t p-4">
              <button v-for="(img, i) in photos" :key="i" @click="openImageDialog(img, item.id)">
                <img class="max-h-[200px] rounded" :src="img.thumbnailSrc" :alt="$t('items.photo')" loading="lazy" />
              </button>
            </div>
          </BaseCard>

          <BaseCard v-if="showAttachments" collapsable>
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

          <BaseCard v-if="showPurchase" collapsable>
            <template #title> {{ $t("items.purchase_details") }} </template>
            <DetailsSection :details="purchaseDetails" />
          </BaseCard>

          <BaseCard v-if="showWarranty" collapsable>
            <template #title> {{ $t("items.warranty_details") }} </template>
            <DetailsSection :details="warrantyDetails" />
          </BaseCard>

          <BaseCard v-if="showSold" collapsable>
            <template #title> {{ $t("items.sold_details") }} </template>
            <DetailsSection :details="soldDetails" />
          </BaseCard>
        </template>
      </div>
    </section>

    <section v-if="items && items.length > 0">
      <ItemViewSelectable :items="items" @refresh="refreshItemList" />
    </section>

    <footer
      class="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground"
      data-testid="item-timestamps"
    >
      <div class="min-w-0 break-words">
        {{ $t("items.created_at") }}
        <DateTime :date="item.createdAt" />
      </div>
      <div class="min-w-0 break-words">
        {{ $t("items.updated_at") }}
        <DateTime :date="item.updatedAt" />
      </div>
    </footer>
  </div>
</template>

<style lang="css" scoped>
  /* Style dialog background */
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  /* Tag chips stay links; this route only gives them a touch target and a visible focus ring. */
  [data-item-tags] :deep(a) {
    align-items: center;
    max-width: 100%;
    min-height: var(--glass-touch);
    min-width: var(--glass-touch);
    overflow-wrap: anywhere;
    padding-inline: 0.875rem;
  }

  [data-item-tags] :deep(a:focus-visible) {
    outline: 2px solid hsl(var(--glass-focus));
    outline-offset: 3px;
    box-shadow: 0 0 0 3px hsl(var(--background));
  }
</style>
