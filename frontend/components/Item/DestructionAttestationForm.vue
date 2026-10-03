<script setup lang="ts">
  import { computed, ref } from "vue";
  import { Input } from "@/components/ui/input";
  import { Button } from "@/components/ui/button";
  import type { DestructionInput, ItemAttachment } from "~/lib/api/types/data-contracts";
  import { destructionDeclaration, destructionEvidenceKind, validateDestruction } from "~/lib/items/destruction";

  // The workflow supplies this asset's refreshed attachments after uploading.
  // This form only emits validated input; it does not claim server completion.
  const props = defineProps<{ attachments: ItemAttachment[]; pending?: boolean; error?: string }>();
  const emit = defineEmits<{ submit: [input: DestructionInput] }>();
  const declared = ref(false);
  const date = ref("");
  const method = ref("");
  const selected = ref<string[]>([]);
  const attempted = ref(false);
  const eligible = computed(() => props.attachments.filter(attachment => destructionEvidenceKind(attachment)));
  const input = computed<DestructionInput>(() => ({
    declared: declared.value,
    date: date.value,
    method: method.value,
    evidence: selected.value.map(attachmentId => ({
      attachmentId,
      kind: destructionEvidenceKind(props.attachments.find(attachment => attachment.id === attachmentId)) ?? "",
    })),
  }));
  const errors = computed(() => validateDestruction(input.value, props.attachments));
  function submit() {
    attempted.value = true;
    if (!props.pending && errors.value.length === 0) emit("submit", input.value);
  }
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <p class="text-sm text-muted-foreground">
      {{ $t("asset_offboarding.notice") }}
    </p>
    <label class="flex items-start gap-2">
      <input v-model="declared" type="checkbox" :disabled="pending" />
      <span>{{ destructionDeclaration }}</span>
    </label>
    <label class="flex flex-col gap-2">
      {{ $t("asset_offboarding.date") }}
      <Input v-model="date" type="date" :disabled="pending" />
    </label>
    <label class="flex flex-col gap-2">
      {{ $t("asset_offboarding.method") }}
      <Input v-model="method" :disabled="pending" />
    </label>
    <fieldset :disabled="pending" class="flex flex-col gap-2">
      <legend>{{ $t("asset_offboarding.evidence") }}</legend>
      <p class="text-sm text-muted-foreground">
        {{ $t("asset_offboarding.evidence_hint") }}
      </p>
      <label v-for="attachment in eligible" :key="attachment.id" class="flex items-center gap-2">
        <input v-model="selected" type="checkbox" :value="attachment.id" />
        {{ attachment.title }} ({{ $t(`asset_offboarding.${destructionEvidenceKind(attachment)}`) }})
      </label>
      <p v-if="eligible.length === 0">{{ $t("asset_offboarding.upload_first") }}</p>
    </fieldset>
    <ul v-if="attempted && errors.length" role="alert" class="text-destructive">
      <li v-for="message in errors" :key="message">{{ $t(message) }}</li>
    </ul>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <Button type="submit" :disabled="pending">{{ $t("asset_offboarding.submit") }}</Button>
  </form>
</template>
