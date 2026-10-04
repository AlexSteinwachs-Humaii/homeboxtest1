import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COLLECTION_SETTINGS_EXAMPLE_AMOUNT,
  canSubmitSettings,
  currencyPreviewIsCurrent,
  draftAfterLoad,
  draftAfterSuccessfulSave,
  formatSettingsCurrencyExample,
  settingsFailureMessage,
} from "./collection-settings";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/collection/index/settings.vue"), "utf8");
const en = readFileSync(resolve(here, "../locales/en.json"), "utf8");

describe("collection settings draft", () => {
  it("keeps a failed or unsaved edit when the same collection reloads", () => {
    const kept = draftAfterLoad(
      { name: "Workshop", currency: "EUR", loadedId: "g1", dirty: true },
      { id: "g1", name: "My Home", currency: "USD" }
    );
    expect(kept).toEqual({ name: "Workshop", currency: "EUR", loadedId: "g1", dirty: true });

    const switched = draftAfterLoad(
      { name: "Workshop", currency: "EUR", loadedId: "g1", dirty: true },
      { id: "g2", name: "Shed", currency: "GBP" }
    );
    expect(switched).toEqual({ name: "Shed", currency: "GBP", loadedId: "g2", dirty: false });

    const clean = draftAfterLoad(
      { name: "My Home", currency: "USD", loadedId: "g1", dirty: false },
      { id: "g1", name: "My Home", currency: "USD" }
    );
    expect(clean.dirty).toBe(false);
    expect(clean.name).toBe("My Home");
  });

  it("refreshes identity from the save unless the person kept editing", () => {
    const applied = draftAfterSuccessfulSave(
      { name: "Workshop", currency: "EUR" },
      { name: "Workshop", currency: "EUR" },
      { id: "g1", name: "Workshop", currency: "EUR" }
    );
    expect(applied).toEqual({ name: "Workshop", currency: "EUR", loadedId: "g1", dirty: false });

    const kept = draftAfterSuccessfulSave(
      { name: "Workshop north", currency: "GBP" },
      { name: "Workshop", currency: "EUR" },
      { id: "g1", name: "Workshop", currency: "EUR" }
    );
    expect(kept.name).toBe("Workshop north");
    expect(kept.currency).toBe("GBP");
    expect(kept.dirty).toBe(true);
    expect(kept.loadedId).toBe("g1");
  });

  it("refuses a second submit while saving and without a collection", () => {
    expect(canSubmitSettings({ hasCollection: true, saving: false })).toBe(true);
    expect(canSubmitSettings({ hasCollection: true, saving: true })).toBe(false);
    expect(canSubmitSettings({ hasCollection: false, saving: false })).toBe(false);
  });
});

describe("collection settings currency example", () => {
  it("formats the selected currency and ignores a stale response", async () => {
    const calls: string[] = [];
    let current = true;
    const stale = await formatSettingsCurrencyExample(
      "EUR",
      "de-DE",
      async (amount, code, locale) => {
        calls.push(`${amount}:${code}:${locale}`);
        current = false;
        return "1.000,00 €";
      },
      () => current
    );
    expect(stale).toEqual({ status: "stale" });
    expect(calls).toEqual([`${COLLECTION_SETTINGS_EXAMPLE_AMOUNT}:EUR:de-DE`]);

    const ready = await formatSettingsCurrencyExample(
      "GBP",
      "en-GB",
      async () => "£1,000.00",
      () => true
    );
    expect(ready).toEqual({ status: "ready", value: "£1,000.00" });
    if (ready.status === "ready") {
      expect(ready.value).not.toContain("$");
    }

    const empty = await formatSettingsCurrencyExample(
      "  ",
      "en-US",
      async () => "$1,000.00",
      () => true
    );
    expect(empty).toEqual({ status: "empty" });

    const fallback = await formatSettingsCurrencyExample(
      "XYZ",
      "en-US",
      async () => {
        throw new Error("unsupported");
      },
      () => true
    );
    expect(fallback).toEqual({ status: "ready", value: "XYZ 1000" });
    expect(currencyPreviewIsCurrent(2, 3)).toBe(false);
    expect(currencyPreviewIsCurrent(3, 3)).toBe(true);
  });

  it("keeps server validation visible without replacing the toast fallback", () => {
    expect(settingsFailureMessage("Failed to update group", null)).toBe("Failed to update group");
    expect(
      settingsFailureMessage("Failed to update group", {
        error: "currency is not supported",
        fields: { currency: "currency 'XXX' is not supported" },
      })
    ).toBe("Failed to update group currency is not supported currency: currency 'XXX' is not supported");
  });
});

describe("collection settings page", () => {
  it("binds labelled opaque fields, a live example, and the primary save action", () => {
    expect(page).toContain("glass-panel");
    expect(page).toContain("glass-field-touch");
    expect(page).toContain('data-testid="collection-settings"');
    expect(page).toContain('id="collection-settings-name"');
    expect(page).toContain(':for="currencyFieldId"');
    expect(page).toContain(':id="currencyFieldId"');
    expect(page).toContain("data-collection-currency");
    expect(page).toContain('variant="action"');
    expect(page).toContain('size="touch"');
    expect(page).toContain('type="submit"');
    expect(page).toContain("collection.update_collection");
    expect(page).toContain("api.group.currencies");
    expect(page).toContain("api.group.get");
    expect(page).toContain("api.group.update");
    expect(page).toContain("setCurrency");
    expect(page).toContain("reloadCollections");
    expect(page).toContain("formatSettingsCurrencyExample");
    expect(page).toContain("draftAfterLoad");
    expect(page).toContain("draftAfterSuccessfulSave");
    expect(page).toContain("canSubmitSettings");
    expect(page).toContain('role="alert"');
    expect(page).toContain('role="status"');
    expect(page).toContain("min-height: var(--glass-touch)");
    expect(page).not.toContain("$1,000.00");
    expect(page).not.toContain('currencyCode = ref("USD")');
    expect(en).toContain("Update Collection");
    expect(en).toContain("Collection settings");
  });
});
