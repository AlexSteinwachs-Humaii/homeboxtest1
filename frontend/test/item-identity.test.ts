import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function indexAfter(source: string, needle: string, from = 0) {
  const at = source.indexOf(needle, from);
  expect(at, needle).toBeGreaterThanOrEqual(0);
  return at;
}

describe("item identity", () => {
  it("orders Back to Search, hierarchy, name, actions, summary and section selector", () => {
    const page = read("pages/item/[id]/index.vue");
    const template = page.slice(page.indexOf("<template>"));
    let at = 0;
    at = indexAfter(template, 'data-testid="item-back-to-search"', at);
    at = indexAfter(template, 'data-testid="item-location"', at);
    at = indexAfter(template, 'data-testid="item-name"', at);
    at = indexAfter(template, 'data-testid="item-edit"', at);
    at = indexAfter(template, 'data-testid="item-tags"', at);
    at = indexAfter(template, 'data-testid="item-more"', at);
    at = indexAfter(template, 'data-testid="item-summary"', at);
    at = indexAfter(template, 'data-testid="item-create-subitem"', at);
    at = indexAfter(template, 'data-testid="item-sections"', at);
    at = indexAfter(template, 'data-testid="item-labels"', at);
    indexAfter(template, "<NuxtPage", at);

    expect(page).toContain("inventoryResultsBackHref");
    expect(page).toContain(':ancestors="tag.ancestors"');
    expect(page).toContain("items.inherited_tag");
    expect(page).toContain("glass-panel");
    expect(page).toContain("glass-tabs");
    expect(page).toContain('variant="action"');
    expect(page).toContain('variant="glass"');
    expect(page).toContain('size="touch"');
    expect(page).toContain("items.not_recorded");
    expect(page).toContain("items.search_card_insured");
    expect(page).toContain("items.search_card_not_insured");
    expect(page).toContain("`/item/${itemId}/edit`");
    expect(page).toContain("`/item/${itemId.value}/maintenance`");
    expect(page).toContain(':page-key="itemId"');
    expect(page).toContain("handleDuplicateClick");
    expect(page).toContain("saveAsTemplate");
    expect(page).toContain("deleteItem");
    expect(page).toContain("createSubitem");
    expect(page).toContain("adjustQuantity");
    expect(page).toContain("LabelMaker");
    expect(page).toContain("photos.length");
    expect(page).toContain("ItemViewSelectable");
    expect(page).toContain("ItemAttachmentsList");
    expect(page).toContain("items.quantity_decrease");
    expect(page).toContain("items.quantity_increase");
    expect(page).not.toContain("opacity-10");
    expect(page).not.toContain("MdiPackageVariant");
    expect(template).toContain("aria-current");
  });
});
