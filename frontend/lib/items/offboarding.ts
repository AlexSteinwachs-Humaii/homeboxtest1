import { ref } from "vue";
import type { ItemsApi } from "../api/classes/items";
import type { EntityOffboarding, EntityOut } from "../api/types/data-contracts";
import { AttachmentTypes } from "../api/types/non-generated";

// Shared workflow state keeps cancellation and all request failures distinct from completion.
export function useOffboarding(
  api: Pick<ItemsApi, "offboard" | "attachments">,
  getItem: () => EntityOut,
  update: (item: EntityOut) => void
) {
  const open = ref(false);
  const pending = ref(false);
  const error = ref("");
  const route = ref<EntityOffboarding["route"]>("sale");

  function cancel() {
    if (pending.value) return;
    open.value = false;
    error.value = "";
  }

  async function submit(input: EntityOffboarding) {
    if (pending.value || getItem().disposed) return;
    pending.value = true;
    error.value = "";
    const item = getItem();
    try {
      const response = await api.offboard(item.id, input);
      if (response.error || !response.data) {
        error.value = "asset_offboarding.submission_error";
        return;
      }
      // Use the server-accepted record, including server identity and timestamp.
      update({
        ...getItem(),
        disposed: true,
        disposalHistory: [response.data],
      });
      open.value = false;
    } catch {
      error.value = "asset_offboarding.submission_error";
    } finally {
      pending.value = false;
    }
  }

  async function upload(file: File, kind: "photo" | "certificate") {
    if (pending.value) return;
    pending.value = true;
    error.value = "";
    try {
      const response = await api.attachments.add(
        getItem().id,
        file,
        file.name,
        kind === "photo" ? AttachmentTypes.Photo : AttachmentTypes.Attachment
      );
      if (response.error || !response.data) {
        error.value = "asset_offboarding.upload_error";
        return;
      }
      update(response.data);
    } catch {
      error.value = "asset_offboarding.upload_error";
    } finally {
      pending.value = false;
    }
  }

  return { open, pending, error, route, cancel, submit, upload };
}
