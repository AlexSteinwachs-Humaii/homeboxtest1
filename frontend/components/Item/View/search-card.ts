import type { EntitySummary } from "~~/lib/api/types/data-contracts";
import { presentAssetId, presentLocation, recentPhotoPath } from "~~/pages/home/recent";

/** Fields the Search result card may show. Values come from the record, not sample copy. */
export type SearchCardFields = {
  id: string;
  href: string;
  name: string;
  nameMissing: boolean;
  assetId: string | null;
  quantity: number;
  insured: boolean;
  location: string | null;
  /** Authenticated attachment path. Null means Home's neutral no-photo fallback. */
  photoPath: string | null;
  purchasePrice: number;
};

export type SearchCardSource = Pick<EntitySummary, "id"> &
  Partial<
    Pick<
      EntitySummary,
      "name" | "assetId" | "quantity" | "insured" | "purchasePrice" | "thumbnailId" | "imageId" | "parent"
    >
  > & {
    /** Nearest location, when the list payload includes it beside parent. */
    location?: { name?: string | null } | null;
  };

export function presentSearchCard(item: SearchCardSource): SearchCardFields {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0;
  const purchasePrice =
    typeof item.purchasePrice === "number" && Number.isFinite(item.purchasePrice) ? item.purchasePrice : 0;
  const location = presentLocation(item.location) ?? presentLocation(item.parent);

  return {
    id: item.id,
    href: `/item/${item.id}`,
    name,
    nameMissing: name.length === 0,
    assetId: presentAssetId(item.assetId),
    quantity,
    insured: item.insured === true,
    location,
    photoPath: recentPhotoPath(item),
    purchasePrice,
  };
}
