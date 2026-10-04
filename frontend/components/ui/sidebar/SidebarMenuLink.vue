<script setup lang="ts">
  import { useSidebar } from "./utils";
  import SidebarMenuButton from "./SidebarMenuButton.vue";

  const { setOpenMobile } = useSidebar();

  const props = defineProps<{
    href: string;
    isActive?: boolean;
  }>();
</script>

<template>
  <SidebarMenuButton as-child :is-active="props.isActive">
    <NuxtLink :to="props.href" :aria-current="props.isActive ? 'page' : undefined" @click="setOpenMobile(false)">
      <slot />
    </NuxtLink>
  </SidebarMenuButton>
</template>
