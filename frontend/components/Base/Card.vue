<template>
  <Card
    class="overflow-hidden"
    :class="variant === 'readable' ? 'readable-panel border border-border bg-card shadow-sm' : 'shadow-xl'"
  >
    <CardHeader v-if="$slots.title" class="px-4 py-5 sm:px-6">
      <button
        v-if="collapsable"
        :id="toggleId"
        type="button"
        class="glass-focus flex min-h-touch w-full items-center justify-between gap-3 rounded-md text-left"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click="toggle"
      >
        <h3 class="min-w-0 text-lg font-semibold leading-6">
          <slot name="title" />
        </h3>
        <MdiChevronDown
          class="size-6 shrink-0 transition-transform"
          :class="{ 'rotate-180': expanded }"
          aria-hidden="true"
        />
      </button>
      <h3 v-else class="flex items-center text-lg font-medium leading-6">
        <slot name="title" />
      </h3>
      <div>
        <p v-if="$slots.subtitle" class="mt-1 max-w-2xl text-sm text-foreground/70">
          <slot name="subtitle" />
        </p>
        <template v-if="$slots['title-actions']">
          <slot name="title-actions" />
        </template>
      </div>
    </CardHeader>
    <CardContent
      :id="panelId"
      :hidden="collapsable && !expanded ? true : undefined"
      :inert="collapsable && !expanded ? true : undefined"
      :aria-labelledby="collapsable ? toggleId : undefined"
      class="p-0"
    >
      <slot />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
  import MdiChevronDown from "~icons/mdi/chevron-down";
  import { Card, CardContent, CardHeader } from "@/components/ui/card";

  withDefaults(
    defineProps<{
      collapsable?: boolean;
      /** Opaque readable surface. Default callers keep the existing card treatment. */
      variant?: "default" | "readable";
    }>(),
    {
      variant: "default",
    }
  );

  const panelId = useId();
  const toggleId = `${panelId}-toggle`;
  const expanded = ref(true);

  function toggle() {
    expanded.value = !expanded.value;
  }
</script>

<style scoped>
  /*
   * Data panels stay opaque even if a shell material later adds blur.
   * The class is on the child Card root, so :deep is required.
   */
  :deep(.readable-panel) {
    background-color: hsl(var(--card));
    color: hsl(var(--card-foreground));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
</style>
