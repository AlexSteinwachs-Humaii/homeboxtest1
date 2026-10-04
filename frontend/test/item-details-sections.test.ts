import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/item/[id]/index.vue"), "utf8");
const card = readFileSync(resolve(here, "../components/Base/Card.vue"), "utf8");
const details = readFileSync(resolve(here, "../components/global/DetailsSection/DetailsSection.vue"), "utf8");
const types = readFileSync(resolve(here, "../components/global/DetailsSection/types.ts"), "utf8");

describe("item details and purchase sections", () => {
  it("renders opaque readable panels with real fields and existing workflows", () => {
    expect(page).toContain('data-testid="item-details"');
    expect(page).toContain('data-testid="item-purchase"');
    expect(page).toContain('variant="readable"');
    expect(page).toContain('variant="compact"');
    expect(page).toContain('data-testid="item-show-empty"');
    expect(page).toContain("preferences.showEmpty");
    expect(page).toContain("filterZeroValues");
    expect(page).toContain('type: "currency"');
    expect(page).toContain("date: true");
    expect(page).toContain("items.warranty_details");
    expect(page).toContain("items.sold_details");
    expect(page).toContain("item.value.fields.map");
    expect(page.indexOf('data-testid="item-details"')).toBeLessThan(page.indexOf('data-testid="item-purchase"'));

    const purchase = page.slice(page.indexOf("const purchaseDetails"), page.indexOf("const showSold"));
    expect(purchase).toContain('name: "items.purchased_from"');
    expect(purchase).toContain('name: "items.purchase_price"');
    expect(purchase).toContain('name: "items.purchase_date"');
    expect(purchase).toContain('type: "currency"');
    expect(purchase).toContain("date: true");
    expect(purchase).not.toMatch(/\$129|Jun 12, 2026|Local hardware store/);
  });

  it("keeps collapse controls named, expanded, and removes collapsed content from focus", () => {
    expect(card).toContain("? 'button'");
    expect(card).toContain("aria-expanded");
    expect(card).toContain("aria-controls");
    expect(card).toContain(":hidden=");
    expect(card).toContain(":inert=");
    expect(card).toContain("min-h-11");
    expect(card).toContain('variant?: "default" | "readable"');
    expect(card).toContain('variant: "default"');
  });

  it("compacts passive rows without hiding copy controls or shrinking them", () => {
    expect(details).toContain('"default" | "compact"');
    expect(details).toContain("opacity-0");
    expect(details).toContain("compact ? '' : 'ml-2 opacity-0");
    expect(details).toContain("compact ? 'touch-icon' : 'icon'");
    expect(details).toContain("[overflow-wrap:anywhere]");
    expect(details).toContain("detail.type == 'date'");
    expect(details).toContain("detail.type == 'currency'");
    expect(types).toContain("return !!detail.text");
    expect(types).toContain('detail.text !== ""');
  });
});
