import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import { attachmentPath, displayAssetId, itemHref, primaryAttachmentId, type RecentPhoto } from "~~/pages/home/recent";

/** Fields a Search result card may render. Null means the record did not supply it. */
export type SearchCardFields = {
  id: string;
  href: string;
  name: string;
  assetId: string | null;
  quantity: number | null;
  insured: boolean;
  location: string | null;
  purchasePrice: number | null;
  photo: RecentPhoto;
};

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function presentSearchCard(item: EntitySummary): SearchCardFields | null {
  const id = blank(item.id);
  if (!id) {
    return null;
  }

  const attachmentId = primaryAttachmentId(item);
  const quantity =
    typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 0 ? item.quantity : null;
  const purchasePrice =
    typeof item.purchasePrice === "number" && Number.isFinite(item.purchasePrice) ? item.purchasePrice : null;

  return {
    id,
    href: itemHref(id),
    name: blank(item.name) ?? "",
    assetId: displayAssetId(item.assetId),
    quantity,
    insured: item.insured === true,
    location: blank(item.parent?.name),
    purchasePrice,
    photo: attachmentId ? { kind: "upload", path: attachmentPath(id, attachmentId) } : { kind: "none" },
  };
}
