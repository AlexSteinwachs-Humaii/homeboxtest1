import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("item inspection flow", () => {
  const page = read("pages/item/[id]/index.vue");
  const template = page.slice(page.indexOf("<template>"));
  const messages = read("locales/en.json");

  it("keeps photos conditional and falls back from a missing thumbnail to the original", () => {
    expect(page).toContain("cur.thumbnail?.id");
    expect(page).toContain("img.thumbnailSrc || img.originalSrc");
    expect(template).toContain('v-if="photos.length > 0"');
    expect(template).toContain('data-testid="item-photos"');
    expect(template).toContain('data-testid="item-photo"');
    expect(template).toContain("ItemImageDialog");
    expect(template).not.toContain("MdiPackageVariant");
    expect(page).toContain("openImageDialog");
  });

  it("leaves document and child workflows reachable", () => {
    expect(template).toContain("ItemAttachmentsList");
    expect(template).toContain('data-testid="item-attachments"');
    expect(template).toContain('data-testid="item-children"');
    expect(page).toContain("ItemViewSelectable");
    expect(read("components/Item/AttachmentsList.vue")).toContain('data-testid="item-attachment"');
    expect(page).toContain("createSubitem");
  });

  it("shows loading and failure feedback without inventing fields, and still recovers to home", () => {
    expect(page).toContain("lazy: true");
    expect(page).toContain("itemLoadFailed");
    expect(page).toContain("item.id === itemId");
    expect(template).toContain("'item-loading'");
    expect(template).toContain("'item-load-error'");
    expect(template).toContain('role="status"');
    expect(page).toContain('toast.error(t("items.toast.failed_load_item"))');
    expect(page).toContain('navigateTo("/home")');
    expect(messages).toContain('"loading": "Loading item…"');
    expect(messages).toContain('"load_error": "This item could not be loaded."');
    const errorBlock = template.slice(template.indexOf('data-testid="item-load-error"'));
    expect(errorBlock).not.toContain("item-name");
    expect(errorBlock).not.toContain("item-purchase");
  });

  it("still hands the current item to nested routes and back to search", () => {
    expect(page).toContain("inventoryResultsBackHref");
    expect(page).toContain('data-testid="item-back-to-search"');
    expect(template).toContain('<NuxtPage :item="item" :page-key="itemId" />');
    expect(page).toContain("`/item/${itemId.value}/maintenance`");
    expect(page).toContain("`/item/${itemId}/edit`");
  });
});
