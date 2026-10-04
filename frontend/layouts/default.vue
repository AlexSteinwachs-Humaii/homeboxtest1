<template>
  <div id="app">
    <!--
    Confirmation Modal is a singleton used by all components so we render
    it here to ensure it's always available. Possibly could move this further
    up the tree
    -->
    <ModalConfirm />
    <OutdatedModal v-if="status" :status="status" />
    <EntityCreateModal />
    <WipeInventoryDialog />
    <TagCreateModal />
    <ItemBarcodeModal />
    <AppQuickMenuModal :actions="quickMenuActions" />
    <AppScannerModal />
    <CollectionCreateModal />
    <CollectionJoinModal />
    <CollectionInviteCreateModal />
    <SidebarProvider :default-open="sidebarState">
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader class="gap-3">
          <NuxtLink
            to="/home"
            class="glass-brand glass-focus flex min-h-11 items-center gap-2 rounded-md px-1 group-data-[collapsible=icon]:justify-center"
            :aria-label="$t('menu.home')"
          >
            <AppLogo class="size-9 shrink-0" />
            <AppHeaderText class="h-6 min-w-0 group-data-[collapsible=icon]:hidden" />
          </NuxtLink>

          <CollectionSelector />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton
                class="glass-action glass-focus flex min-h-11 justify-center bg-primary text-primary-foreground drop-shadow-md hover:bg-primary/90 active:bg-primary/90 active:text-primary-foreground group-data-[collapsible=icon]:justify-start"
                :tooltip="$t('global.create')"
                hotkey="Shortcut: Ctrl+`"
              >
                <MdiPlus />
                <span>
                  {{ $t("global.create") }}
                </span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="z-40 min-w-[var(--reka-dropdown-menu-trigger-width)]">
              <DropdownMenuItem
                v-for="btn in dropdown"
                :key="btn.id"
                class="glass-focus group min-h-11 cursor-pointer text-lg"
                @click="
                  () => {
                    if (btn.dialogId === DialogID.CreateEntity) {
                      if (btn.id == 0)
                        // create item
                        openDialog(btn.dialogId, { params: { baseType: 'item' } });
                      else if (btn.id == 1)
                        // create location
                        openDialog(btn.dialogId, { params: { baseType: 'location' } });
                    } else {
                      openDialog(btn.dialogId as NoParamDialogIDs);
                    }
                  }
                "
              >
                {{ btn.name.value }}
                <Shortcut
                  v-if="btn.shortcut"
                  class="invisible ml-auto group-hover:visible"
                  :keys="btn.shortcut.replace('Shift', '⇧').split('+')"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup v-for="group in navGroups" :key="group.id">
            <SidebarGroupLabel class="glass-eyebrow h-auto min-h-0 px-2 group-data-[collapsible=icon]:hidden">
              {{ group.label.value }}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem v-for="n in group.items" :key="n.id">
                <SidebarMenuLink
                  :href="n.to"
                  :is-active="n.active.value"
                  :class="{
                    'bg-accent text-accent-foreground': n.active.value,
                    'text-nowrap': typeof locale === 'string' && locale.startsWith('zh-'),
                  }"
                  :tooltip="n.name.value"
                >
                  <component :is="n.icon" />
                  <span class="min-w-0 flex-1 truncate">{{ n.name.value }}</span>
                  <MdiChevronRight
                    v-if="n.id === 'collection'"
                    class="ml-auto size-4 shrink-0 opacity-70 group-data-[collapsible=icon]:hidden"
                  />
                </SidebarMenuLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuLink
                :href="profileDestination"
                :is-active="profileActive(route.path)"
                class="!h-auto min-h-11 py-1.5"
                :class="{
                  'bg-accent text-accent-foreground': profileActive(route.path),
                }"
                :tooltip="username"
              >
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                  aria-hidden="true"
                >
                  {{ profileInitial }}
                </span>
                <span class="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                  <span class="truncate text-sm font-semibold leading-tight">{{ username }}</span>
                  <span class="truncate text-xs font-normal text-muted-foreground">
                    {{ $t("menu.profile_and_preferences") }}
                  </span>
                </span>
              </SidebarMenuLink>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenuButton
            class="glass-focus flex min-h-11 justify-start group-data-[collapsible=icon]:justify-start group-data-[collapsible=icon]:bg-destructive group-data-[collapsible=icon]:text-destructive-foreground group-data-[collapsible=icon]:shadow-sm group-data-[collapsible=icon]:hover:bg-destructive/90"
            :tooltip="$t('global.sign_out')"
            data-testid="logout-button"
            @click="logout"
          >
            <MdiLogout />
            <span>
              {{ $t("global.sign_out") }}
            </span>
          </SidebarMenuButton>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
      <SidebarInset class="glass-canvas min-h-dvh max-w-full bg-background-accent">
        <div class="relative flex min-h-dvh flex-col">
          <!--
            Height is --header-height / --header-height-mobile. Item and location
            edit sticky actions offset by those variables. z-20 stays under dialogs
            (z-50) and the mobile sidebar sheet so open overlays are not covered.
            The legacy decorative header is not stacked here: it hid search on large
            screens and overlapped this row. Search and Scan stay in this row either way.
          -->
          <div
            class="glass-header sticky top-0 z-20 flex h-[var(--header-height-mobile)] items-center gap-2 px-3 sm:h-[var(--header-height)]"
          >
            <SidebarTrigger class="shrink-0" variant="default" />
            <NuxtLink to="/home" class="glass-brand shrink-0 md:hidden" :aria-label="$t('menu.home')">
              <AppLogo class="size-8" />
            </NuxtLink>
            <form class="flex min-w-0 flex-1 items-center gap-2" role="search" @submit.prevent="triggerSearch">
              <Input
                v-model:model-value="search"
                class="glass-field-touch h-11 min-h-11 min-w-0 flex-1 rounded-full"
                :placeholder="$t('global.search')"
                :aria-label="$t('global.search')"
                type="search"
                data-testid="shell-search"
              />
              <Button
                type="submit"
                size="touch-icon"
                variant="action"
                class="shrink-0"
                :aria-label="$t('global.search')"
              >
                <MdiMagnify />
              </Button>
              <Button
                type="button"
                size="touch"
                variant="glass"
                class="shrink-0 rounded-full"
                :aria-label="$t('menu.scanner')"
                data-testid="shell-scan"
                @click="openScanner"
              >
                <MdiQrcodeScan />
                <span class="hidden sm:inline">{{ $t("menu.scanner") }}</span>
              </Button>
            </form>
          </div>

          <slot />
          <div class="grow" />

          <footer v-if="status" class="bottom-0 w-full pb-4 text-center">
            <p class="text-center text-sm">
              <span
                v-html="
                  DOMPurify.sanitize(
                    $t('global.footer.version_link', {
                      version: status.build.version.replace(/^v/, ''),
                      build: status.build.commit,
                    })
                  )
                "
              />
              ~
              <span v-html="DOMPurify.sanitize($t('global.footer.api_link'))" />
            </p>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  </div>
</template>

<script lang="ts" setup>
  import { useI18n } from "vue-i18n";
  import DOMPurify from "dompurify";
  import { useTagStore } from "~/stores/tags";
  import { useLocationStore } from "~~/stores/locations";
  import { useEntityTypeStore } from "~~/stores/entityTypes";

  import MdiHome from "~icons/mdi/home";
  import MdiFileTree from "~icons/mdi/file-tree";
  import MdiTagMultiple from "~icons/mdi/tag-multiple";
  import MdiMagnify from "~icons/mdi/magnify";
  import MdiQrcodeScan from "~icons/mdi/qrcode-scan";
  import MdiCubeOutline from "~icons/mdi/cube-outline";
  import MdiWrench from "~icons/mdi/wrench";
  import MdiPlus from "~icons/mdi/plus";
  import MdiLogout from "~icons/mdi/logout";
  import MdiFileDocumentMultiple from "~icons/mdi/file-document-multiple";
  import MdiChevronRight from "~icons/mdi/chevron-right";

  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuLink,
    SidebarProvider,
    SidebarRail,
    SidebarSeparator,
    SidebarTrigger,
  } from "@/components/ui/sidebar";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import { Shortcut } from "~/components/ui/shortcut";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { Input } from "~/components/ui/input";
  import { Button } from "~/components/ui/button";
  import { toast } from "@/components/ui/sonner";
  import { DialogID, type NoParamDialogIDs } from "~/components/ui/dialog-provider/utils";
  import ModalConfirm from "~/components/ModalConfirm.vue";
  import OutdatedModal from "~/components/App/OutdatedModal.vue";
  import EntityCreateModal from "~/components/Entity/CreateModal.vue";
  import WipeInventoryDialog from "~/components/WipeInventoryDialog.vue";
  import TagCreateModal from "~/components/Tag/CreateModal.vue";
  import ItemBarcodeModal from "~/components/Item/BarcodeModal.vue";
  import AppQuickMenuModal from "~/components/App/QuickMenuModal.vue";
  import AppScannerModal from "~/components/App/ScannerModal.vue";
  import AppLogo from "~/components/App/Logo.vue";
  import AppHeaderText from "~/components/App/HeaderText.vue";
  import {
    activeShellNav,
    inventorySearchHref,
    profileActive,
    profileDestination,
    shellNav,
    type ShellNavId,
  } from "~/lib/shell-nav";
  import CollectionSelector from "~/components/Collection/Selector.vue";
  import CollectionCreateModal from "~/components/Collection/CreateModal.vue";
  import CollectionJoinModal from "~/components/Collection/JoinModal.vue";
  import CollectionInviteCreateModal from "~/components/Collection/InviteCreateModal.vue";

  const { t, locale } = useI18n();
  const username = computed(() => authCtx.user?.name || "User");
  const profileInitial = computed(() => (username.value.trim().charAt(0) || "?").toUpperCase());

  const { openDialog } = useDialog();

  // get sidebar state from cookies
  const sidebarState = useCookie("sidebar:state", {
    readonly: true,
    decode: value => value !== "false",
  });

  const pubApi = usePublicApi();
  const { data: status } = useAsyncData(async () => {
    const { data } = await pubApi.status();

    return data;
  });

  const search = ref("");

  const triggerSearch = () => {
    const href = inventorySearchHref(search.value);
    search.value = "";
    navigateTo(href);
    if (document.activeElement && "blur" in document.activeElement) {
      (document.activeElement as HTMLElement).blur();
    }
  };

  const openScanner = () => {
    // request permission
    if (navigator.mediaDevices) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then(() => {
          openDialog(DialogID.Scanner);
        })
        .catch(err => {
          console.error(err);
          toast.error(t("scanner.permission_denied"));
        });
    } else {
      toast.error(t("scanner.unsupported"));
    }
  };

  // Preload currency format
  useFormatCurrency();

  type DropdownItem = {
    id: number;
    name: ComputedRef<string>;
    shortcut: string;
    dialogId: DialogID;
  };

  const dropdown: DropdownItem[] = [
    {
      id: 0,
      name: computed(() => t("menu.create_item")),
      shortcut: "Shift+1",
      dialogId: DialogID.CreateEntity,
    },
    {
      id: 1,
      name: computed(() => t("menu.create_location")),
      shortcut: "Shift+2",
      dialogId: DialogID.CreateEntity,
    },
    {
      id: 2,
      name: computed(() => t("menu.create_tag")),
      shortcut: "Shift+3",
      dialogId: DialogID.CreateTag,
    },
  ];

  const route = useRoute();
  const router = useRouter();

  const navIcons: Record<ShellNavId, Component> = {
    home: MdiHome,
    search: MdiMagnify,
    locations: MdiFileTree,
    tags: MdiTagMultiple,
    templates: MdiFileDocumentMultiple,
    maintenance: MdiWrench,
    collection: MdiCubeOutline,
  };

  const nav = shellNav.map(item => ({
    ...item,
    icon: navIcons[item.id],
    active: computed(() => activeShellNav(route.path) === item.id),
    name: computed(() => (item.id === "tags" ? t("global.tags") : t(`menu.${item.id}`))),
  }));

  const navGroups = [
    {
      id: "inventory",
      label: computed(() => t("menu.inventory_group")),
      items: nav.filter(item => item.group === "inventory"),
    },
    {
      id: "manage",
      label: computed(() => t("menu.manage_group")),
      items: nav.filter(item => item.group === "manage"),
    },
  ];

  const quickMenuActions = reactive([
    ...dropdown.map(v => ({
      text: computed(() => v.name.value),
      dialogId: v.dialogId,
      shortcut: v.shortcut.split("+")[1] as string,
      id: v.id,
      type: "create" as const,
    })),
    ...nav.map(v => ({
      text: computed(() => v.name.value),
      href: v.to,
      type: "navigate" as const,
    })),
    {
      text: computed(() => t("menu.profile")),
      href: profileDestination,
      type: "navigate" as const,
    },
  ]);

  const tagStore = useTagStore();
  tagStore.ensureAllTagsFetched();

  const locationStore = useLocationStore();
  locationStore.ensureLocationsFetched();

  const entityTypeStore = useEntityTypeStore();
  entityTypeStore.ensureFetched();

  onMounted(() => {
    locationStore.refreshParents();
    locationStore.refreshTree();

    // Auto-open JoinModal when invitation token is in URL
    const token = route.query.token;
    if (typeof token === "string" && token.length > 0) {
      // Remove token from browser URL
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState(history.state, "", url.toString());

      // Sync router's state to clear route.query.token
      const { token: _, ...cleanQuery } = route.query;
      router.replace({ query: cleanQuery });

      openDialog(DialogID.JoinCollection, {
        params: { inviteCode: token },
      });
    }
  });

  onServerEvent(ServerEvent.TagMutation, () => {
    tagStore.refresh();
  });

  onServerEvent(ServerEvent.EntityMutation, () => {
    locationStore.refreshChildren();
    locationStore.refreshParents();
    locationStore.refreshTree();
  });

  const authCtx = useAuthContext();
  const api = useUserApi();

  async function logout() {
    await authCtx.logout(api);
    navigateTo("/");
  }
</script>
