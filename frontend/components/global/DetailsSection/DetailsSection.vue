<template>
  <div :class="compact ? 'min-w-0 px-5 pb-3' : 'border-t px-4 py-5 sm:p-0'">
    <dl :class="compact ? 'divide-y divide-border' : 'sm:divide-y'">
      <div
        v-for="detail in details"
        :key="detail.name"
        class="group min-w-0"
        :class="
          compact
            ? 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] items-start gap-x-4 gap-y-1 py-3 max-[280px]:grid-cols-1'
            : 'py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6'
        "
      >
        <dt
          class="min-w-0 text-sm font-medium [overflow-wrap:anywhere]"
          :class="compact ? 'text-muted-foreground' : undefined"
        >
          {{ $t(detail.name) }}
        </dt>
        <dd
          class="min-w-0 text-sm [overflow-wrap:anywhere]"
          :class="compact ? 'text-end font-semibold max-[280px]:text-start' : 'text-start sm:col-span-2'"
        >
          <slot :name="detail.slot || detail.name" v-bind="{ detail }">
            <DateTime
              v-if="detail.type == 'date'"
              :date="detail.text"
              :datetime-type="detail.date ? 'date' : 'datetime'"
            />
            <Currency v-else-if="detail.type == 'currency'" :amount="detail.text" />
            <template v-else-if="detail.type === 'link'">
              <TooltipProvider :delay-duration="0">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <a
                      :href="detail.href"
                      target="_blank"
                      rel="noopener noreferrer"
                      :class="[badgeVariants(), compact ? 'min-h-11 max-w-full' : '']"
                      class="gap-1"
                    >
                      <MdiOpenInNew />
                      {{ detail.text }}
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>
                    {{ detail.href }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </template>
            <template v-else-if="detail.type === 'markdown'">
              <ClientOnly>
                <!-- eslint-disable-next-line tailwindcss/no-custom-classname -->
                <div class="markdown-container w-full min-w-0 max-w-full break-words">
                  <Markdown :source="detail.text" />
                </div>
              </ClientOnly>
            </template>
            <template v-else>
              <!-- Fixed version with improved overflow handling -->
              <span
                class="flex w-full min-w-0 flex-wrap items-center gap-2"
                :class="compact ? 'justify-end max-[280px]:justify-start' : ''"
              >
                <a
                  v-if="maybeUrl(detail.text.toString()).isUrl"
                  :href="maybeUrl(detail.text.toString()).url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="min-w-0 max-w-full text-primary underline [overflow-wrap:anywhere] hover:text-primary/80"
                  :class="compact ? 'min-h-11' : ''"
                  >{{ detail.text }}</a
                >
                <span v-else class="min-w-0 max-w-full [overflow-wrap:anywhere]">{{ detail.text }}</span>
                <span
                  v-if="detail.copyable"
                  class="my-0 shrink-0"
                  :class="compact ? '' : 'ml-2 opacity-0 transition-opacity duration-75 group-hover:opacity-100'"
                >
                  <CopyText
                    v-if="detail.text.toString()"
                    :text="detail.text.toString()"
                    :icon-size="16"
                    :size="compact ? 'touch-icon' : 'icon'"
                  />
                </span>
              </span>
            </template>
          </slot>
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
  import type { AnyDetail, Detail } from "./types";
  import MdiOpenInNew from "~icons/mdi/open-in-new";
  import { badgeVariants } from "~/components/ui/badge";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import DateTime from "@/components/global/DateTime.vue";
  import Currency from "@/components/global/Currency.vue";
  import Markdown from "@/components/global/Markdown.vue";
  import CopyText from "@/components/global/CopyText.vue";

  const props = defineProps({
    details: {
      type: Object as () => (Detail | AnyDetail)[],
      required: true,
    },
    /** Denser passive rows for item inspection. Other callers keep the default layout. */
    variant: {
      type: String as () => "default" | "compact",
      default: "default",
    },
  });

  const compact = computed(() => props.variant === "compact");
</script>

<style>
  /* Use :deep to target elements inside the markdown container */
  :deep(.markdown-container) {
    /* General container styles */
    width: 100%;
    overflow-wrap: break-word;
    word-wrap: break-word;

    /* Handle tables */
    table {
      table-layout: fixed;
      width: 100%;
    }

    td,
    th {
      word-break: break-word;
      overflow-wrap: break-word;
      max-width: 100%;
    }

    /* Handle code blocks */
    pre,
    code {
      white-space: pre-wrap;
      word-break: break-all;
      overflow-x: auto;
    }

    /* Handle images */
    img {
      max-width: 100%;
      height: auto;
    }

    /* Handle headings */
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* Handle blockquotes */
    blockquote {
      overflow-wrap: break-word;
      word-break: break-word;
    }

    /* Handle inline elements */
    a,
    strong,
    em {
      word-break: break-all;
      overflow-wrap: break-word;
    }
  }
</style>
