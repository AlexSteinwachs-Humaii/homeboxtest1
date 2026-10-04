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
    <!--
      displayLegacyHeader is still stored from Profile, but it no longer swaps in
      the decorative header or hides search/Scan. Either value keeps this shell.
    -->
    <SidebarProvider class="glass-shell" :default-open="sidebarState">
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader class="shrink-0 gap-3">
          <NuxtLink
            class="glass-brand glass-focus flex min-h-11 items-center gap-2 rounded-full px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            to="/home"
            :aria-label="$t('menu.home')"
          >
            <AppLogo class="size-8 shrink-0" />
            <AppHeaderText class="h-5 w-auto group-data-[collapsible=icon]:hidden" />
          </NuxtLink>

          <CollectionSelector />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton
                class="glass-focus flex min-h-11 justify-center rounded-full bg-primary text-primary-foreground drop-shadow-md hover:bg-primary/90 active:bg-primary/90 active:text-primary-foreground group-data-[collapsible=icon]:justify-start"
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
                class="glass-focus min-h-11 cursor-pointer text-lg"
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
            <SidebarGroupLabel class="glass-kicker h-auto">{{ group.label }}</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in group.items" :key="item.id">
                <SidebarMenuLink
                  :href="item.to"
                  :is-active="item.active"
                  :tooltip="item.name"
                  :class="{
                    'text-nowrap': typeof locale === 'string' && locale.startsWith('zh-'),
                  }"
                >
                  <component :is="item.icon" />
                  <span>{{ item.name }}</span>
                  <MdiChevronRight
                    v-if="item.id === 'collection'"
                    class="ml-auto size-4 opacity-70 group-data-[collapsible=icon]:hidden"
                    aria-hidden="true"
                  />
                </SidebarMenuLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter class="shrink-0">
          <SidebarSeparator />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuLink
                class="!h-auto min-h-11 py-1.5 group-data-[collapsible=icon]:!size-11"
                href="/profile"
                :is-active="profileActive"
                :tooltip="profileLabel"
              >
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  aria-hidden="true"
                >
                  {{ profileInitial }}
                </span>
                <span class="flex min-w-0 flex-col leading-tight">
                  <span class="truncate text-sm font-semibold">{{ username }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{ profileLabel }}</span>
                </span>
              </SidebarMenuLink>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                class="glass-focus flex min-h-11 justify-start"
                :tooltip="$t('global.sign_out')"
                data-testid="logout-button"
                @click="logout"
              >
                <MdiLogout />
                <span>
                  {{ $t("global.sign_out") }}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
      <SidebarInset
        :class="
          theme === 'homebox'
            ? 'min-h-dvh min-w-0 max-w-full bg-transparent'
            : 'min-h-dvh min-w-0 max-w-full bg-background-accent'
        "
      >
        <div class="relative flex h-full min-w-0 flex-col justify-center">
          <!-- Height is --header-height (4rem). Edit sticky bars offset by the same variables. -->
          <header
            class="glass-nav sticky top-0 z-20 flex h-16 min-h-16 items-center gap-2 px-3"
            data-testid="shell-header"
          >
            <SidebarTrigger variant="default" />
            <NuxtLink
              class="glass-brand glass-focus flex size-11 min-h-11 min-w-11 items-center justify-center max-[359px]:hidden md:hidden"
              to="/home"
              :aria-label="$t('menu.home')"
            >
              <AppLogo class="size-8" />
            </NuxtLink>
            <form
              class="flex min-w-0 flex-1 items-center gap-2"
              role="search"
              data-testid="shell-search"
              @submit.prevent="submitInventorySearch"
            >
              <Input
                v-model:model-value="search"
                class="glass-search h-11 min-h-11 min-w-0 flex-1 rounded-full"
                :placeholder="$t('global.search')"
                :aria-label="$t('global.search')"
                type="search"
                name="q"
              />
              <Button type="submit" variant="glass" size="touch-icon" :aria-label="$t('menu.search')">
                <MdiMagnify />
              </Button>
            </form>
            <Button
              type="button"
              variant="glass"
              size="touch"
              class="shrink-0 max-sm:w-11 max-sm:px-0"
              data-testid="shell-scan"
              :aria-label="$t('menu.scan')"
              @click="openScanner"
            >
              <MdiQrcodeScan />
              <span class="max-sm:sr-only">{{ $t("menu.scan") }}</span>
            </Button>
          </header>

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
  import MdiCog from "~icons/mdi/cog";
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
  import CollectionSelector from "~/components/Collection/Selector.vue";
  import CollectionCreateModal from "~/components/Collection/CreateModal.vue";
  import CollectionJoinModal from "~/components/Collection/JoinModal.vue";
  import CollectionInviteCreateModal from "~/components/Collection/InviteCreateModal.vue";
  import { SHELL_NAV, inventorySearchHref, isProfileActive, isShellNavActive, type ShellNavId } from "~/lib/shell-nav";

  const { t, locale } = useI18n();
  const authCtx = useAuthContext();
  const route = useRoute();
  const router = useRouter();
  const username = computed(() => authCtx.user?.name || "User");
  const profileInitial = computed(() => (username.value.trim()[0] || "?").toUpperCase());
  const profileLabel = computed(() => t("menu.profile_preferences"));
  const profileActive = computed(() => isProfileActive(route.path));

  const { openDialog } = useDialog();

  const { theme } = useTheme();

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

  const submitInventorySearch = () => {
    navigateTo(inventorySearchHref(search.value));
    search.value = "";
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

  const icons: Record<ShellNavId, Component> = {
    home: MdiHome,
    search: MdiMagnify,
    locations: MdiFileTree,
    tags: MdiTagMultiple,
    templates: MdiFileDocumentMultiple,
    maintenance: MdiWrench,
    collection: MdiCog,
  };

  function navLabel(id: ShellNavId) {
    if (id === "tags") {
      return t("global.tags");
    }
    return t(`menu.${id}`);
  }

  const navItems = computed(() =>
    SHELL_NAV.map(item => ({
      ...item,
      icon: icons[item.id],
      name: navLabel(item.id),
      active: isShellNavActive(item.id, route.path),
    }))
  );

  const navGroups = computed(() => [
    {
      id: "inventory",
      label: t("menu.group_inventory"),
      items: navItems.value.filter(item => item.group === "inventory"),
    },
    {
      id: "manage",
      label: t("menu.group_manage"),
      items: navItems.value.filter(item => item.group === "manage"),
    },
  ]);

  const quickMenuActions = reactive([
    ...dropdown.map(v => ({
      text: computed(() => v.name.value),
      dialogId: v.dialogId,
      shortcut: v.shortcut.split("+")[1] as string,
      id: v.id,
      type: "create" as const,
    })),
    ...SHELL_NAV.map(item => ({
      text: computed(() => navLabel(item.id)),
      href: item.to,
      type: "navigate" as const,
    })),
    {
      text: computed(() => t("menu.profile")),
      href: "/profile",
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

  const api = useUserApi();

  async function logout() {
    await authCtx.logout(api);
    navigateTo("/");
  }
</script>
