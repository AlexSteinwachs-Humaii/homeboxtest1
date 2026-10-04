<template>
  <Card class="min-w-0 max-w-full overflow-hidden" :class="readable ? 'bg-card shadow-sm' : 'shadow-xl'">
    <CardHeader v-if="$slots.title" :class="readable ? 'gap-3 px-5 py-4' : 'px-4 py-5 sm:px-6'">
      <component
        :is="collapsable ? 'button' : 'div'"
        :id="collapsable ? toggleId : undefined"
        :type="collapsable ? 'button' : undefined"
        :aria-expanded="collapsable ? !collapsed : undefined"
        :aria-controls="collapsable ? panelId : undefined"
        class="min-w-0 text-start"
        :class="
          collapsable
            ? ['glass-focus flex min-h-11 w-full items-center gap-3 rounded-md', readable ? 'justify-between' : '']
            : undefined
        "
        v-on="collapsable ? { click: toggle } : {}"
      >
        <h3
          :id="headingId"
          class="min-w-0 text-lg font-medium leading-6 [overflow-wrap:anywhere]"
          :class="readable ? 'text-xl font-bold tracking-tight' : 'flex items-center'"
        >
          <slot name="title" />
          <span
            v-if="collapsable && !readable"
            class="ml-2 inline-flex shrink-0 transition-transform"
            :class="{ 'rotate-180': collapsed }"
            aria-hidden="true"
          >
            <MdiChevronDown class="size-6" />
          </span>
        </h3>
        <span
          v-if="collapsable && readable"
          class="inline-flex size-11 shrink-0 items-center justify-center transition-transform"
          :class="{ 'rotate-180': collapsed }"
          aria-hidden="true"
        >
          <MdiChevronDown class="size-6" />
        </span>
      </component>
      <div v-if="$slots.subtitle || $slots['title-actions']">
        <p v-if="$slots.subtitle" class="mt-1 max-w-2xl text-sm text-foreground/70">
          <slot name="subtitle" />
        </p>
        <template v-if="$slots['title-actions']">
          <slot name="title-actions" />
        </template>
      </div>
    </CardHeader>
    <CardContent
      :id="collapsable ? panelId : undefined"
      :hidden="contentCollapsed ? true : undefined"
      :inert="contentCollapsed ? true : undefined"
      :aria-labelledby="collapsable ? headingId : undefined"
      class="min-w-0 p-0"
    >
      <slot />
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
  import MdiChevronDown from "~icons/mdi/chevron-down";
  import { Card, CardContent, CardHeader } from "@/components/ui/card";

  const props = withDefaults(
    defineProps<{
      collapsable?: boolean;
      /** Opaque readable section. Other callers keep the default card. */
      variant?: "default" | "readable";
    }>(),
    {
      collapsable: false,
      variant: "default",
    }
  );

  const collapsed = ref(false);
  const headingId = useId();
  const panelId = useId();
  const toggleId = computed(() => `${headingId}-toggle`);
  const readable = computed(() => props.variant === "readable");
  const contentCollapsed = computed(() => props.collapsable && collapsed.value);

  function toggle() {
    collapsed.value = !collapsed.value;
  }
</script>
