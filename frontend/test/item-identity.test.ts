import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/item/[id]/index.vue"), "utf8");

describe("item identity recomposition", () => {
  it("follows the referenced hierarchy and keeps existing workflows", () => {
    expect(page).toContain('data-testid="item-back-to-search"');
    expect(page).toContain("inventoryResultsBackHref");
    expect(page).toContain('data-testid="item-location"');
    expect(page).toContain('data-testid="item-name"');
    expect(page).toContain('data-testid="item-tags"');
    expect(page).toContain('data-testid="item-edit"');
    expect(page).toContain('data-testid="item-more"');
    expect(page).toContain('data-testid="item-summary"');
    expect(page).toContain('data-testid="item-sections"');
    expect(page).toContain('class="glass-tabs"');
    expect(page).toContain('class="glass-panel');
    expect(page).toContain(':ancestors="tag.ancestors"');
    expect(page).toContain("useTagStore().withAncestors");
    expect(page).toContain('<NuxtPage :item="item" :page-key="itemId" />');
    expect(page).toContain("adjustQuantity");
    expect(page).toContain("handleDuplicateClick");
    expect(page).toContain("saveAsTemplate");
    expect(page).toContain("deleteItem");
    expect(page).toContain("createSubitem");
    expect(page).toContain("LabelMaker");
    expect(page).toContain("ItemViewSelectable");
    expect(page).toContain("ItemAttachmentsList");
    expect(page).not.toContain("MdiPackageVariant");
  });
});
