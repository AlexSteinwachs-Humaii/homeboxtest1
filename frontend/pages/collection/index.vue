<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import BaseContainer from "@/components/Base/Container.vue";
  import { Button } from "@/components/ui/button";
  import { toast } from "@/components/ui/sonner";

  import MdiAccountMultiple from "~icons/mdi/account-multiple";
  import MdiEmailPlus from "~icons/mdi/email-plus";
  import MdiBell from "~icons/mdi/bell";
  import MdiCog from "~icons/mdi/cog";
  import MdiShape from "~icons/mdi/shape";
  import MdiWrench from "~icons/mdi/wrench";
  import type { Component } from "vue";
  import type { UserSummary } from "~/lib/api/types/data-contracts";
  import {
    COLLECTION_ADMIN_TABS,
    collectionDestructiveAction,
    isCollectionAdminTabActive,
    isCollectionSettingsPath,
    type CollectionAdminTabId,
  } from "~/lib/collection-admin";

  definePageMeta({
    middleware: ["auth", "collection-root"],
  });

  const { t } = useI18n();

  useHead({ title: `HomeBox | ${t("menu.collection")}` });

  const route = useRoute();

  const api = useUserApi();
  const auth = useAuthContext();
  const confirm = useConfirm();

  const tabIcons: Record<CollectionAdminTabId, Component> = {
    members: MdiAccountMultiple,
    invites: MdiEmailPlus,
    notifiers: MdiBell,
    settings: MdiCog,
    "entity-types": MdiShape,
    tools: MdiWrench,
  };

  const tabs = computed(() =>
    COLLECTION_ADMIN_TABS.map(tab => ({
      ...tab,
      icon: tabIcons[tab.id],
    }))
  );

  const onSettings = computed(() => isCollectionSettingsPath(route.path));

  const { selectedCollection, load: reloadCollections } = useCollections();

  const members = ref<Array<UserSummary>>([]);
  const membersLoading = ref(false);
  const membershipKnown = ref(false);
  const actionLoading = ref(false);

  const currentUserId = computed(() => auth.user?.id ?? "");

  const membersCount = computed(() => members.value.length);

  const isOnlyMember = computed(() => {
    if (membersCount.value !== 1 || !currentUserId.value) return false;
    const member = members.value[0];
    return Boolean(member && member.id && member.id === currentUserId.value);
  });

  const destructiveKind = computed(() =>
    collectionDestructiveAction({
      hasCollection: Boolean(selectedCollection.value),
      membershipKnown: membershipKnown.value,
      isOnlyMember: isOnlyMember.value,
    })
  );

  const isActionDisabled = computed(
    () => !selectedCollection.value || !membershipKnown.value || membersLoading.value || actionLoading.value
  );

  const loadMembers = async () => {
    const collectionId = selectedCollection.value?.id;
    if (!collectionId) {
      members.value = [];
      membershipKnown.value = false;
      membersLoading.value = false;
      return;
    }

    membersLoading.value = true;
    membershipKnown.value = false;
    try {
      const res = await api.group.getMembers();
      if (selectedCollection.value?.id !== collectionId) {
        return;
      }
      if (res.error) {
        const msg = t("errors.api_failure") + String(res.error);
        toast.error(msg);
        members.value = [];
      } else {
        members.value = Array.isArray(res.data) ? (res.data as Array<UserSummary>) : [];
      }
    } catch (e) {
      if (selectedCollection.value?.id !== collectionId) {
        return;
      }
      const msg = (e as Error).message ?? String(e);
      toast.error(msg);
      members.value = [];
    } finally {
      if (selectedCollection.value?.id === collectionId) {
        membersLoading.value = false;
        membershipKnown.value = true;
      }
    }
  };

  watch(
    () => selectedCollection.value?.id,
    () => {
      membershipKnown.value = false;
      void loadMembers();
    },
    { immediate: true }
  );

  // The selector that normally loads collections lives in the sidebar. Below
  // 768px that sidebar is not mounted until the drawer opens, so administration
  // has to load the selected collection itself.
  onMounted(() => {
    void reloadCollections();
  });

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
    if (!selectedCollection.value || destructiveKind.value === "checking") return;

    if (destructiveKind.value === "delete") {
      await handleDeleteCollection();
    } else {
      await handleLeaveCollection();
    }
  };
</script>

<template>
  <BaseContainer class="flex flex-col gap-6">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="glass-kicker" data-testid="collection-kicker">
          {{ t("menu.group_manage") }}
          <span v-if="selectedCollection?.name"> / {{ selectedCollection.name }}</span>
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground" data-testid="collection-heading">
          {{ t("menu.collection") }}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t("collection.subtitle") }}</p>
      </div>
      <!-- Invites teleports Create Invite here. Leave/delete is not in this slot. -->
      <div id="collection-header-actions" class="flex shrink-0 items-center gap-1" />
    </header>

    <nav class="collection-admin-nav glass-tabs" :aria-label="t('collection.admin_nav')" data-testid="collection-admin">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        class="collection-admin-link glass-focus"
        :aria-current="isCollectionAdminTabActive(tab.to, route.path) ? 'page' : undefined"
        :data-testid="`collection-admin-${tab.id}`"
      >
        <component :is="tab.icon" v-if="tab.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(tab.labelKey) }}</span>
      </NuxtLink>
    </nav>

    <section class="min-w-0">
      <NuxtPage />
    </section>

    <section
      v-if="onSettings"
      class="border-t border-border pt-6"
      data-testid="collection-danger-zone"
      :data-action="destructiveKind"
      aria-labelledby="collection-danger-heading"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h2 id="collection-danger-heading" class="text-base font-semibold text-foreground">
            {{
              destructiveKind === "delete"
                ? t("collection.danger_delete_title")
                : destructiveKind === "leave"
                  ? t("collection.danger_leave_title")
                  : t("collection.danger_checking_title")
            }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{
              destructiveKind === "delete"
                ? t("collection.danger_delete_hint")
                : destructiveKind === "leave"
                  ? t("collection.danger_leave_hint")
                  : t("collection.danger_checking_hint")
            }}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="touch"
          class="h-auto min-h-touch shrink-0 whitespace-normal text-destructive"
          data-testid="collection-danger-action"
          :disabled="isActionDisabled"
          :aria-busy="actionLoading || membersLoading"
          @click="handleCollectionPrimaryAction"
        >
          {{
            destructiveKind === "delete"
              ? t("collection.delete_collection")
              : destructiveKind === "leave"
                ? t("collection.leave_collection")
                : t("collection.checking_membership")
          }}
        </Button>
      </div>
    </section>
  </BaseContainer>
</template>
