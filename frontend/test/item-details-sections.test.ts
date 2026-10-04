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

describe("item details and purchase sections", () => {
  const page = read("pages/item/[id]/index.vue");
  const card = read("components/Base/Card.vue");
  const section = read("components/global/DetailsSection/DetailsSection.vue");
  const copy = read("components/global/CopyText.vue");
  const types = read("components/global/DetailsSection/types.ts");

  it("renders opaque readable Details then Purchase without dropping other sections", () => {
    const template = page.slice(page.indexOf("<template>"));
    let at = indexAfter(template, 'data-testid="item-details"');
    expect(template.slice(Math.max(0, at - 120), at)).toContain('variant="readable"');
    at = indexAfter(template, 'data-testid="item-purchase"', at);
    expect(template.slice(Math.max(0, at - 160), at)).toContain('variant="readable"');
    at = indexAfter(template, 'data-testid="item-attachments"', at);
    at = indexAfter(template, 'data-testid="item-warranty"', at);
    indexAfter(template, 'data-testid="item-sold"', at);

    expect(page).toContain('variant="compact" :details="itemDetails"');
    expect(page).toContain('variant="compact" :details="purchaseDetails"');
    expect(page).toContain('variant="compact" :details="warrantyDetails"');
    expect(page).toContain('variant="compact" :details="soldDetails"');
    expect(page).toContain(':details="attachmentDetails"');
    expect(page).not.toContain('variant="compact" :details="attachmentDetails"');
    expect(page).toContain("photos.length");
    expect(page).toContain("item.value.fields.map");
    expect(page).not.toContain("$129");
    expect(page).not.toContain("Jun 12, 2026");
  });

  it("keeps collection currency, date-only purchase dates, and empty-field filtering", () => {
    expect(page).toContain('type: "currency"');
    expect(page).toContain("items.purchase_price");
    expect(page).toContain("items.purchase_date");
    expect(page).toContain("date: true");
    expect(page).toContain('v-model="preferences.showEmpty"');
    expect(page).toContain("filterZeroValues");
    expect(types).toContain('detail.text !== ""');
    expect(types).toContain("validDate(detail.text)");
    expect(read("components/global/Currency.vue")).toContain("useFormatCurrency");
    expect(read("components/global/DateTime.vue")).toContain('datetimeType: "date"');
    expect(read("composables/use-formatters.ts")).toContain("group.currency");
    expect(read("composables/use-formatters.ts")).toContain("isDateOnlyString");
  });

  it("exposes collapse state and keeps collapsed content out of tab order", () => {
    expect(card).toContain('type="button"');
    expect(card).toContain("aria-expanded");
    expect(card).toContain("aria-controls");
    expect(card).toContain(":hidden=");
    expect(card).toContain(":inert=");
    expect(card).toContain("min-h-touch");
    expect(card).not.toContain("max-h-0");
    expect(card).toContain('variant?: "default" | "readable"');
    expect(card).toContain("backdrop-filter: none");
  });

  it("uses compact wrapping rows without shrinking copy or quantity controls", () => {
    expect(section).toContain('variant: {\n      type: String as () => "default" | "compact"');
    expect(section).toContain("min-[280px]:flex-row");
    expect(section).toContain("min-[280px]:text-end");
    expect(section).toContain("[overflow-wrap:anywhere]");
    expect(section).toContain("compact ? 'touch-icon' : 'icon'");
    expect(section).toContain(
      "compact ? '' : 'my-0 ml-4 opacity-0 transition-opacity duration-75 group-hover:opacity-100'"
    );
    expect(copy).toContain('default: "icon"');
    expect(copy).toContain("touch-icon");
    expect(page).toContain('size="touch-icon"');
    expect(page).toContain("items.quantity_increase");
    expect(page).toContain("items.quantity_decrease");
  });
});
