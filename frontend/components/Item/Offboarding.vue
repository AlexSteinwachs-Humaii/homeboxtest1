<script setup lang="ts">
  import { computed, ref, watch } from "vue";
  import { DialogID, useDialog } from "@/components/ui/dialog-provider/utils";
  import { Button } from "@/components/ui/button";
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import BaseCard from "@/components/Base/Card.vue";
  import DateTime from "@/components/global/DateTime.vue";
  import AttachmentsList from "./AttachmentsList.vue";
  import DestructionAttestationForm from "./DestructionAttestationForm.vue";
  import type { EntityOut, TypesDisposal } from "~/lib/api/types/data-contracts";
  import { useOffboarding } from "~/lib/items/offboarding";

  const props = defineProps<{ item: EntityOut }>();
  const emit = defineEmits<{ updated: [item: EntityOut] }>();
  const api = useUserApi();
  const { open, pending, error, route, cancel, submit, upload } = useOffboarding(
    api.items,
    () => props.item,
    item => emit("updated", item)
  );
  const { openDialog, closeDialog, activeDialog } = useDialog();
  watch(open, value => {
    if (value) openDialog(DialogID.ItemOffboarding);
    else closeDialog(DialogID.ItemOffboarding);
  });
  watch(activeDialog, value => {
    if (value !== DialogID.ItemOffboarding && open.value) {
      if (pending.value) openDialog(DialogID.ItemOffboarding);
      else cancel();
    }
  });
  const uploadKind = ref<"photo" | "certificate">("photo");
  const routes = ["sale", "donation", "recycling", "destruction"];
  const history = computed(() => props.item.disposalHistory ?? []);
  const userNames = ref<Record<string, string>>({});
  watch(
    history,
    async records => {
      if (!records.length) return;
      try {
        const { data, error: membersError } = await api.group.getMembers();
        if (!membersError && data) {
          userNames.value = Object.fromEntries(data.map(user => [user.id, user.name]));
        }
      } catch {
        // Historical attribution remains readable by its retained ID if membership lookup fails.
      }
    },
    { immediate: true }
  );
  function evidence(record: TypesDisposal) {
    const ids = record.destruction?.evidence.map(ref => ref.attachmentId) ?? [];
    return props.item.attachments.filter(attachment => ids.includes(attachment.id));
  }
  async function selectFile(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) await upload(file, uploadKind.value);
    target.value = "";
  }
</script>

<template>
  <BaseCard>
    <template #title>{{ $t("asset_offboarding.lifecycle") }}</template>
    <div class="space-y-4" data-testid="offboarding">
      <p>
        {{ $t(item.disposed ? "asset_offboarding.disposed" : "asset_offboarding.active") }}
      </p>
      <Button v-if="!item.disposed" @click="open = true">{{ $t("asset_offboarding.record") }}</Button>
      <section v-if="history.length" class="space-y-4" :aria-label="$t('asset_offboarding.history')">
        <h3 class="font-semibold">{{ $t("asset_offboarding.history") }}</h3>
        <article v-for="(record, index) in history" :key="index" class="space-y-3 rounded-md border p-4">
          <h4 class="font-semibold">
            {{ $t(`asset_offboarding.${record.route}`) }}
          </h4>
          <dl class="space-y-2">
            <div>
              <dt>{{ $t("asset_offboarding.declaring_user") }}</dt>
              <dd class="break-all">
                <span v-if="userNames[record.submittedBy]">{{ userNames[record.submittedBy] }} — </span>
                <span>{{ record.submittedBy }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ $t("asset_offboarding.submitted_at") }}</dt>
              <dd>
                <DateTime :date="record.submittedAt" format="long" datetime-type="datetime" />
              </dd>
            </div>
            <template v-if="record.destruction">
              <div>
                <dt>{{ $t("asset_offboarding.accepted_declaration") }}</dt>
                <dd>{{ record.destruction.declaration }}</dd>
              </div>
              <div>
                <dt>{{ $t("asset_offboarding.date") }}</dt>
                <dd>
                  <DateTime :date="record.destruction.date" format="long" />
                </dd>
              </div>
              <div>
                <dt>{{ $t("asset_offboarding.method") }}</dt>
                <dd class="whitespace-pre-wrap break-words">
                  {{ record.destruction.method }}
                </dd>
              </div>
            </template>
          </dl>
          <template v-if="record.destruction">
            <p class="text-sm text-muted-foreground">
              {{ $t("asset_offboarding.notice") }}
            </p>
            <h5>{{ $t("asset_offboarding.evidence") }}</h5>
            <AttachmentsList :attachments="evidence(record)" :item-id="item.id" />
            <p v-if="evidence(record).length !== record.destruction.evidence.length" role="alert">
              {{ $t("asset_offboarding.evidence_unavailable") }}
            </p>
          </template>
        </article>
      </section>
    </div>
    <Dialog :dialog-id="DialogID.ItemOffboarding">
      <DialogContent
        class="max-h-[90vh] overflow-y-auto"
        @escape-key-down="pending && $event.preventDefault()"
        @interact-outside="pending && $event.preventDefault()"
      >
        <DialogHeader
          ><DialogTitle>{{ $t("asset_offboarding.record") }}</DialogTitle></DialogHeader
        >
        <p>{{ $t("asset_offboarding.confirm_hint") }}</p>
        <label class="flex flex-col gap-2">
          {{ $t("asset_offboarding.route") }}
          <select v-model="route" :disabled="pending" class="rounded-md border bg-background p-2">
            <option v-for="option in routes" :key="option" :value="option">
              {{ $t(`asset_offboarding.${option}`) }}
            </option>
          </select>
        </label>
        <template v-if="route === 'destruction'">
          <fieldset :disabled="pending" class="space-y-2">
            <legend>{{ $t("asset_offboarding.upload") }}</legend>
            <label class="flex flex-col gap-2">
              {{ $t("asset_offboarding.evidence_type") }}
              <select v-model="uploadKind" class="rounded-md border bg-background p-2">
                <option value="photo">
                  {{ $t("asset_offboarding.photo") }}
                </option>
                <option value="certificate">
                  {{ $t("asset_offboarding.certificate") }}
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-2">
              {{ $t("asset_offboarding.upload") }}
              <input
                type="file"
                :accept="uploadKind === 'photo' ? 'image/*' : 'image/*,application/pdf'"
                @change="selectFile"
              />
            </label>
            <p class="text-sm text-muted-foreground">
              {{ $t("asset_offboarding.upload_retained") }}
            </p>
          </fieldset>
          <DestructionAttestationForm
            v-if="open"
            :attachments="item.attachments"
            :pending="pending"
            :error="error ? $t(error) : ''"
            @submit="submit({ route: 'destruction', destruction: $event })"
          />
        </template>
        <template v-else>
          <p v-if="error" role="alert" class="text-destructive">
            {{ $t(error) }}
          </p>
          <Button :disabled="pending" @click="submit({ route })">{{ $t("asset_offboarding.confirm") }}</Button>
        </template>
        <Button variant="outline" :disabled="pending" @click="cancel">{{ $t("global.cancel") }}</Button>
      </DialogContent>
    </Dialog>
  </BaseCard>
</template>
