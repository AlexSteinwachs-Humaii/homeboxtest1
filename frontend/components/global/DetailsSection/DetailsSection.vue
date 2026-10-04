<template>
  <div :class="compact ? 'border-t border-border px-4 sm:px-6' : 'border-t px-4 py-5 sm:p-0'">
    <dl :class="compact ? 'divide-y divide-border' : 'sm:divide-y'">
      <div
        v-for="detail in details"
        :key="detail.name"
        class="group min-w-0"
        :class="
          compact
            ? 'flex flex-col gap-1 py-3 min-[280px]:flex-row min-[280px]:items-start min-[280px]:justify-between min-[280px]:gap-4'
            : 'py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6'
        "
      >
        <dt
          class="min-w-0 text-sm [overflow-wrap:anywhere]"
          :class="compact ? 'text-muted-foreground min-[280px]:max-w-[40%] min-[280px]:shrink-0' : 'font-medium'"
        >
          {{ $t(detail.name) }}
        </dt>
        <dd
          class="min-w-0 max-w-full text-sm [overflow-wrap:anywhere]"
          :class="compact ? 'font-semibold min-[280px]:flex-1 min-[280px]:text-end' : 'text-start sm:col-span-2'"
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
                      :class="[
                        badgeVariants(),
                        compact ? 'min-h-touch max-w-full whitespace-normal break-all text-sm' : 'gap-1',
                      ]"
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
                <div class="markdown-container w-full max-w-full overflow-hidden break-words text-start">
                  <Markdown :source="detail.text" />
                </div>
              </ClientOnly>
            </template>
            <template v-else>
              <span
                class="flex w-full min-w-0 items-center gap-2"
                :class="compact ? 'flex-wrap min-[280px]:justify-end' : 'break-words'"
              >
                <a
                  v-if="maybeUrl(detail.text.toString()).isUrl"
                  :href="maybeUrl(detail.text.toString()).url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="min-w-0 overflow-hidden break-all text-primary underline hover:text-primary/80"
                  :class="compact ? 'min-h-touch' : ''"
                  >{{ detail.text }}</a
                >
                <span v-else class="min-w-0 overflow-hidden break-all">{{ detail.text }}</span>
                <span
                  v-if="detail.copyable"
                  class="shrink-0"
                  :class="compact ? '' : 'my-0 ml-4 opacity-0 transition-opacity duration-75 group-hover:opacity-100'"
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
  import { computed } from "vue";

  const props = defineProps({
    details: {
      type: Object as () => (Detail | AnyDetail)[],
      required: true,
    },
    /** Opt-in wrapping rows. Default keeps the existing three-column density. */
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
