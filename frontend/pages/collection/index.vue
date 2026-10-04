<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { Button } from "@/components/ui/button";
  import { toast } from "@/components/ui/sonner";
  import MdiLoading from "~icons/mdi/loading";
  import MdiLogout from "~icons/mdi/logout";
  import MdiDelete from "~icons/mdi/delete";
  import type { UserSummary } from "~/lib/api/types/data-contracts";
  import { activeCollectionAdminTab, collectionAdminTabs, collectionDestructiveAction } from "~/lib/collection-admin";

  definePageMeta({
    middleware: [
      "auth",
      to => {
        if (to.path === "/collection" || to.path === "/collection/") {
          return "/collection/settings";
        }
      },
    ],
  });

  const { t } = useI18n();

  useHead({ title: `HomeBox | ${t("menu.collection")}` });

  const route = useRoute();
  const api = useUserApi();
  const auth = useAuthContext();
  const confirm = useConfirm();

  const tabs = collectionAdminTabs;
  const activeTab = computed(() => activeCollectionAdminTab(route.path));
  const isSettings = computed(() => activeTab.value === "settings");

  const { selectedCollection, load: reloadCollections } = useCollections();

  const members = ref<Array<UserSummary>>([]);
  const membersLoading = ref(false);
  const actionLoading = ref(false);

  const currentUserId = computed(() => auth.user?.id ?? "");

  const membersCount = computed(() => members.value.length);

  const isOnlyMember = computed(() => {
    if (membersCount.value !== 1 || !currentUserId.value) return false;
    const member = members.value[0];
    return Boolean(member && member.id && member.id === currentUserId.value);
  });
  const isActionDisabled = computed(() => !selectedCollection.value || membersLoading.value || actionLoading.value);
  const destructiveAction = computed(() =>
    collectionDestructiveAction({
      hasCollection: Boolean(selectedCollection.value),
      membersLoading: membersLoading.value,
      isOnlyMember: isOnlyMember.value,
    })
  );

  const eyebrow = computed(() => {
    const name = selectedCollection.value?.name?.trim();
    if (!name) return t("menu.manage_group");
    return t("collection.page_eyebrow", { name });
  });

  const loadMembers = async () => {
    if (!selectedCollection.value) {
      members.value = [];
      return;
    }

    membersLoading.value = true;
    try {
      const res = await api.group.getMembers();
      if (res.error) {
        const msg = t("errors.api_failure") + String(res.error);
        toast.error(msg);
        members.value = [];
      } else {
        members.value = Array.isArray(res.data) ? (res.data as Array<UserSummary>) : [];
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      toast.error(msg);
      members.value = [];
    } finally {
      membersLoading.value = false;
    }
  };

  watch(
    () => selectedCollection.value?.id,
    () => {
      void loadMembers();
    },
    { immediate: true }
  );

  const handleLeaveCollection = async () => {
    if (!selectedCollection.value) return;

    const result = await confirm.open(t("collection.leave_confirm"));
    if (result.isCanceled) {
      return;
    }

    actionLoading.value = true;

    try {
      let userId = currentUserId.value;
      if (!userId) {
        const { data } = await api.user.self();
        userId = data?.item.id ?? "";
      }

      if (!userId) {
        const msg = t("errors.api_failure") + "Missing user id";
        toast.error(msg);
        return;
      }

      const res = await api.group.removeMember(userId);
      if (res.error) {
        const msg = t("errors.api_failure") + String(res.error);
        toast.error(msg);
        return;
      }

      toast.success(t("collection.left_collection"));
      await reloadCollections();
      window.location.reload();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      toast.error(msg);
    } finally {
      actionLoading.value = false;
    }
  };

  const handleDeleteCollection = async () => {
    if (!selectedCollection.value) return;

    const result = await confirm.open(t("collection.delete_confirm"));
    if (result.isCanceled) {
      return;
    }

    actionLoading.value = true;

    try {
      const res = await api.group.delete(selectedCollection.value.id);
      if (res.error) {
        const msg = t("errors.api_failure") + String(res.error);
        toast.error(msg);
        return;
      }

      toast.success(t("collection.deleted_collection"));
      await reloadCollections();
      window.location.reload();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      toast.error(msg);
    } finally {
      actionLoading.value = false;
    }
  };

  const handleCollectionPrimaryAction = async () => {
    if (!selectedCollection.value || membersLoading.value || actionLoading.value) return;

    if (isOnlyMember.value) {
      await handleDeleteCollection();
    } else {
      await handleLeaveCollection();
    }
  };
</script>

<template>
  <div
    class="glass-page mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-glass-section"
    data-testid="collection-admin"
  >
    <Title>{{ t("menu.collection") }}</Title>

    <header class="min-w-0">
      <p class="glass-eyebrow">{{ eyebrow }}</p>
      <h1 class="glass-title mt-1 break-words">{{ t("menu.collection") }}</h1>
      <p class="glass-body mt-1 text-muted-foreground">{{ t("collection.page_subtitle") }}</p>
    </header>

    <nav
      class="glass-tabs"
      data-collection-nav
      :aria-label="t('collection.sections')"
      data-testid="collection-admin-nav"
    >
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        class="glass-focus"
        data-collection-nav-item
        :class="{ active: activeTab === tab.id }"
        :data-state="activeTab === tab.id ? 'active' : 'inactive'"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :data-testid="`collection-admin-${tab.id}`"
      >
        {{ t(tab.label) }}
      </NuxtLink>
    </nav>

    <!-- Child pages (invites) still teleport their own actions here. Leave/delete is not one of them. -->
    <div id="collection-header-actions" class="flex min-w-0 flex-wrap items-center justify-end gap-2 empty:hidden" />

    <div class="min-w-0">
      <NuxtPage />
    </div>

    <section
      v-if="isSettings"
      data-collection-danger
      data-testid="collection-danger-zone"
      :aria-labelledby="'collection-danger-heading'"
      :aria-busy="membersLoading || actionLoading"
    >
      <div data-collection-danger-copy class="min-w-0">
        <h2 id="collection-danger-heading" class="text-base font-semibold">
          <template v-if="destructiveAction === 'delete'">{{ t("collection.delete_heading") }}</template>
          <template v-else-if="destructiveAction === 'leave'">{{ t("collection.leave_heading") }}</template>
          <template v-else>{{ t("collection.membership_checking") }}</template>
        </h2>
        <p id="collection-danger-hint" class="glass-body mt-1 text-sm text-muted-foreground">
          <template v-if="destructiveAction === 'delete'">{{ t("collection.delete_hint") }}</template>
          <template v-else-if="destructiveAction === 'leave'">{{ t("collection.leave_hint") }}</template>
          <template v-else>{{ t("global.loading") }}</template>
        </p>
      </div>

      <Button
        type="button"
        :variant="destructiveAction === 'delete' ? 'destructive' : 'outline'"
        size="touch"
        class="max-w-full"
        data-collection-danger-action
        :class="
          destructiveAction === 'leave'
            ? 'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
            : ''
        "
        data-testid="collection-danger-action"
        :aria-describedby="'collection-danger-hint'"
        :aria-busy="actionLoading"
        :disabled="isActionDisabled"
        @click="handleCollectionPrimaryAction"
      >
        <MdiLoading v-if="actionLoading || destructiveAction === 'pending'" class="animate-spin" aria-hidden="true" />
        <MdiDelete v-else-if="destructiveAction === 'delete'" aria-hidden="true" />
        <MdiLogout v-else aria-hidden="true" />
        <span v-if="destructiveAction === 'delete'">{{ t("collection.delete_collection") }}</span>
        <span v-else-if="destructiveAction === 'leave'">{{ t("collection.leave_collection") }}</span>
        <span v-else>{{ t("collection.membership_checking") }}</span>
      </Button>
    </section>
  </div>
</template>

<style>
  /*
   * Breakpoints match COLLECTION_ADMIN_TWO_COLUMN_MAX (520) and
   * COLLECTION_ADMIN_ONE_COLUMN_MAX (340) in lib/collection-admin.ts.
   * Selectors outrank the theme .glass-tabs flex rule so the grid wins.
   */
  :is(html:not([data-theme]), html[data-theme="homebox"]) [data-collection-nav].glass-tabs,
  [data-collection-nav].glass-tabs {
    display: grid;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  :is(html:not([data-theme]), html[data-theme="homebox"]) [data-collection-nav].glass-tabs > [data-collection-nav-item],
  [data-collection-nav].glass-tabs > [data-collection-nav-item] {
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: var(--glass-touch);
    align-items: center;
    justify-content: center;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
    line-height: 1.25;
    text-decoration: none;
  }

  @media (max-width: 520px) {
    :is(html:not([data-theme]), html[data-theme="homebox"]) [data-collection-nav].glass-tabs,
    [data-collection-nav].glass-tabs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 340px) {
    :is(html:not([data-theme]), html[data-theme="homebox"]) [data-collection-nav].glass-tabs,
    [data-collection-nav].glass-tabs {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  [data-collection-danger] {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid hsl(var(--border));
    padding-top: 1.25rem;
  }

  [data-collection-danger-copy] {
    flex: 1 1 16rem;
  }

  [data-collection-danger-action] {
    flex: 0 1 auto;
    margin-left: auto;
    min-height: var(--glass-touch);
    white-space: normal;
  }
</style>
