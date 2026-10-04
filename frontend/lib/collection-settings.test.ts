import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_PREVIEW_AMOUNT,
  canSubmitSettings,
  commitCurrencyPreview,
  currencyOptions,
  fallbackCurrencyPreview,
  formatSettingsFailure,
  settingsView,
  shouldApplyServerValues,
  shouldKeepDraftAfterSave,
  startCurrencyPreview,
} from "./collection-settings";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("collection settings form state", () => {
  it("keeps a failed load from presenting an empty submittable form", () => {
    expect(
      settingsView({
        hasCollection: true,
        loading: true,
        loadFailed: false,
        hasLoadedValues: false,
      })
    ).toBe("loading");
    expect(
      settingsView({
        hasCollection: true,
        loading: false,
        loadFailed: true,
        hasLoadedValues: false,
      })
    ).toBe("failed");
    expect(
      settingsView({
        hasCollection: false,
        loading: false,
        loadFailed: false,
        hasLoadedValues: false,
      })
    ).toBe("empty");
    expect(
      settingsView({
        hasCollection: true,
        loading: false,
        loadFailed: false,
        hasLoadedValues: true,
      })
    ).toBe("form");
    expect(
      settingsView({
        hasCollection: true,
        loading: true,
        loadFailed: false,
        hasLoadedValues: true,
      })
    ).toBe("form");

    expect(canSubmitSettings({ hasCollection: true, view: "form", saving: false })).toBe(true);
    expect(canSubmitSettings({ hasCollection: true, view: "form", saving: true })).toBe(false);
    expect(canSubmitSettings({ hasCollection: true, view: "failed", saving: false })).toBe(false);
    expect(
      canSubmitSettings({
        hasCollection: true,
        view: "loading",
        saving: false,
      })
    ).toBe(false);
    expect(canSubmitSettings({ hasCollection: false, view: "empty", saving: false })).toBe(false);
  });

  it("hydrates actual values without discarding a dirty draft or a late response", () => {
    expect(
      shouldApplyServerValues({
        requestCollectionId: "a",
        activeCollectionId: "a",
        draftCollectionId: null,
        dirty: false,
      })
    ).toBe(true);
    expect(
      shouldApplyServerValues({
        requestCollectionId: "a",
        activeCollectionId: "b",
        draftCollectionId: "a",
        dirty: true,
      })
    ).toBe(false);
    expect(
      shouldApplyServerValues({
        requestCollectionId: "a",
        activeCollectionId: "a",
        draftCollectionId: "a",
        dirty: true,
      })
    ).toBe(false);
    expect(
      shouldApplyServerValues({
        requestCollectionId: "b",
        activeCollectionId: "b",
        draftCollectionId: "a",
        dirty: true,
      })
    ).toBe(true);

    expect(shouldKeepDraftAfterSave({ name: "Workshop", currency: "EUR" }, { name: "Workshop", currency: "EUR" })).toBe(
      false
    );
    expect(
      shouldKeepDraftAfterSave({ name: "Workshop", currency: "EUR" }, { name: "Workshop bench", currency: "EUR" })
    ).toBe(true);
    expect(shouldKeepDraftAfterSave({ name: "Workshop", currency: "EUR" }, { name: "Workshop", currency: "GBP" })).toBe(
      true
    );
  });

  it("formats endpoint failures and keeps a currency the list does not know", () => {
    expect(formatSettingsFailure(null, "Failed to update group")).toBe("Failed to update group");
    expect(formatSettingsFailure({ error: "Unknown Error" }, "Failed to update group")).toBe("Failed to update group");
    expect(
      formatSettingsFailure({ error: "Validation Error", fields: { currency: "not supported" } }, "fallback")
    ).toBe("currency: not supported");
    expect(formatSettingsFailure({ error: "only the owner" }, "fallback")).toBe("only the owner");

    expect(
      currencyOptions(
        [
          { code: "USD", name: "US Dollar" },
          { code: "EUR", name: "Euro" },
        ],
        "EUR"
      )
    ).toEqual([
      { code: "USD", name: "US Dollar" },
      { code: "EUR", name: "Euro" },
    ]);
    expect(currencyOptions([{ code: "USD", name: "US Dollar" }], "JPY")).toEqual([
      { code: "JPY", name: "JPY" },
      { code: "USD", name: "US Dollar" },
    ]);
    expect(currencyOptions(undefined, "")).toEqual([]);
  });

  it("lets only the latest currency choice win the example", () => {
    const eur = startCurrencyPreview({ generation: 0, example: "" }, "EUR");
    const gbp = startCurrencyPreview(eur, "GBP");

    expect(eur.example).toBe(fallbackCurrencyPreview("EUR"));
    expect(eur.example).not.toContain("$");
    expect(gbp.generation).toBe(eur.generation + 1);

    const stale = commitCurrencyPreview(gbp, eur.generation, "$1,000.00");
    expect(stale).toEqual(gbp);

    const current = commitCurrencyPreview(gbp, gbp.generation, "£1,000.00");
    expect(current.example).toBe("£1,000.00");
    expect(SETTINGS_PREVIEW_AMOUNT).toBe(1000);
  });

  it("renders opaque labelled fields, a live example, and a primary action that cannot double-submit", () => {
    const page = read("pages/collection/index/settings.vue");
    const messages = read("locales/en.json");

    expect(page).toContain('from "~/lib/collection-settings"');
    expect(page).toContain("api.group.currencies");
    expect(page).toContain("api.group.get");
    expect(page).toContain("api.group.update");
    expect(page).toContain("fmtCurrencyAsync(SETTINGS_PREVIEW_AMOUNT");
    expect(page).toContain("setCurrency");
    expect(page).toContain("reloadCollections");
    expect(page).toContain("selectedCollection.value?.id");
    expect(page).not.toContain("$1,000.00");
    expect(page).not.toContain('currencyCode = ref("USD")');
    expect(page).toContain('id="collection-settings-name"');
    expect(page).toContain('id="collection-settings-currency"');
    expect(page).toContain('for="collection-settings-currency"');
    expect(page).toContain('data-testid="collection-settings-save"');
    expect(page).toContain('data-testid="collection-settings-load-error"');
    expect(page).toContain('variant="action"');
    expect(page).toContain('size="touch"');
    expect(page).toContain("glass-panel");
    expect(page).toContain("@submit.prevent");
    expect(page).toContain("canSubmitSettings");
    expect(page).toContain("commitCurrencyPreview");
    expect(page).toContain("shouldKeepDraftAfterSave");
    expect(page).not.toContain('size="sm"');

    expect(messages).toContain('"settings_title"');
    expect(messages).toContain('"update_collection": "Update Collection"');
    expect(messages).toContain('"settings_retry"');
  });
});
