import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/item/[id]/index.vue"), "utf8");
const dialog = readFileSync(resolve(here, "../components/Item/ImageDialog.vue"), "utf8");
const attachments = readFileSync(resolve(here, "../components/Item/AttachmentsList.vue"), "utf8");

describe("item inspection flow", () => {
  it("keeps real photos conditional and falls back from thumbnail to original", () => {
    expect(page).toContain('v-if="photos.length > 0"');
    expect(page).toContain('data-testid="item-photos"');
    expect(page).toContain("img.thumbnailSrc || img.originalSrc");
    expect(page).toContain("cur.thumbnail?.id");
    expect(page).toContain("photo.thumbnailSrc = photo.originalSrc");
    expect(page).toContain("openImageDialog");
    expect(page).toContain("ItemImageDialog");
    expect(dialog).toContain('type === "preloaded"');
    expect(dialog).toContain("image.originalSrc");
    expect(dialog).toContain("image.thumbnailSrc");
    expect(page).not.toContain("cordless-drill.png");
  });

  it("keeps documents, receipts, warranty files and child items reachable", () => {
    expect(page).toContain("ItemAttachmentsList");
    expect(page).toContain('data-testid="item-attachments"');
    expect(page).toContain("attachments.manuals");
    expect(page).toContain("attachments.warranty");
    expect(page).toContain("attachments.receipts");
    expect(page).toContain('data-testid="item-children"');
    expect(page).toContain("ItemViewSelectable");
    expect(attachments).toContain("attachment.title");
    expect(page).toContain('NuxtPage :item="item"');
    expect(page).toContain('data-testid="item-edit"');
    expect(page).toContain('data-testid="item-back-to-search"');
    expect(page).toContain("createSubitem");
  });

  it("shows loading and failure without fake fields and still returns home", () => {
    const pending = page.slice(page.indexOf('data-testid="item-pending"'), page.indexOf('data-testid="item-page"'));
    expect(pending).toContain('data-testid="item-loading"');
    expect(pending).toContain('data-testid="item-load-error"');
    expect(pending).toContain("items.loading");
    expect(pending).toContain("items.load_error");
    expect(pending).not.toContain("items.asset_id");
    expect(pending).not.toContain("000-042");
    expect(pending).not.toContain("Bosch");
    expect(page).toContain("lazy: true");
    expect(page).toContain('toast.error(t("items.toast.failed_load_item"))');
    expect(page).toContain('navigateTo("/home")');
    expect(page).toContain("itemLoadFailed.value = true");
  });
});
