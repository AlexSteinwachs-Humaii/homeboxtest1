/**
 * Collection settings form state for Glass v5.
 * Persistence stays on the existing group get/update and currencies endpoints.
 * These helpers only decide when a server snapshot may replace a draft, when
 * submit is allowed, and which currency preview is still the latest choice.
 */

export const SETTINGS_PREVIEW_AMOUNT = 1000;

export type CollectionSettingsDraft = {
  name: string;
  currency: string;
};

export type SettingsView = "loading" | "empty" | "failed" | "form";

export type CurrencyOption = {
  code: string;
  name: string;
};

export function settingsView(input: {
  hasCollection: boolean;
  loading: boolean;
  loadFailed: boolean;
  hasLoadedValues: boolean;
}): SettingsView {
  if (!input.hasCollection) {
    return input.loading ? "loading" : "empty";
  }
  if (input.hasLoadedValues) {
    return "form";
  }
  if (input.loading) {
    return "loading";
  }
  if (input.loadFailed) {
    return "failed";
  }
  return "loading";
}

/**
 * A response may fill the form only for the collection still on screen, and
 * never over a draft the person has already changed for that collection.
 * Collection switches clear the draft before the request, so the new
 * collection's values still apply.
 */
export function shouldApplyServerValues(input: {
  requestCollectionId: string;
  activeCollectionId: string | null;
  draftCollectionId: string | null;
  dirty: boolean;
}): boolean {
  if (!input.activeCollectionId || input.requestCollectionId !== input.activeCollectionId) {
    return false;
  }
  return !(input.dirty && input.draftCollectionId === input.activeCollectionId);
}

/** Edits made while the request was in flight stay in the form. */
export function shouldKeepDraftAfterSave(sent: CollectionSettingsDraft, current: CollectionSettingsDraft): boolean {
  return sent.name !== current.name || sent.currency !== current.currency;
}

export function canSubmitSettings(input: { hasCollection: boolean; view: SettingsView; saving: boolean }): boolean {
  return input.hasCollection && input.view === "form" && !input.saving;
}

/**
 * Field errors from the API stay visible. A generic transport failure keeps
 * the caller's existing toast text. Empty name/currency are rejected by the
 * server as an unknown error, not by a new client rule.
 */
export function formatSettingsFailure(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const record = data as { error?: unknown; fields?: unknown };
  const parts: string[] = [];

  if (record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)) {
    for (const [field, message] of Object.entries(record.fields as Record<string, unknown>)) {
      if (typeof message === "string" && message.trim()) {
        parts.push(`${field}: ${message.trim()}`);
      }
    }
  }

  if (typeof record.error === "string") {
    const message = record.error.trim();
    if (message && message !== "Unknown Error" && message !== "Validation Error") {
      parts.unshift(message);
    }
  }

  return parts.length > 0 ? parts.join(" ") : fallback;
}

/**
 * Choices come from the currencies endpoint. A saved code missing from that
 * list stays selectable so the field does not silently change currency.
 */
export function currencyOptions(
  currencies: ReadonlyArray<CurrencyOption> | null | undefined,
  selected: string
): CurrencyOption[] {
  const options = (currencies ?? [])
    .filter(currency => Boolean(currency?.code))
    .map(currency => ({
      code: currency.code,
      name: currency.name || currency.code,
    }));

  if (selected && !options.some(currency => currency.code === selected)) {
    return [{ code: selected, name: selected }, ...options];
  }

  return options;
}

export type PreviewState = {
  generation: number;
  example: string;
};

export function beginPreview(generation: number): number {
  return generation + 1;
}

export function isLatestPreview(started: number, generation: number): boolean {
  return started === generation;
}

export function fallbackCurrencyPreview(code: string, amount: number = SETTINGS_PREVIEW_AMOUNT): string {
  const safe = code.trim();
  return safe ? `${safe} ${amount}` : "";
}

/** Advance the preview generation and show a non-USD placeholder for this code. */
export function startCurrencyPreview(state: PreviewState, code: string): PreviewState {
  return {
    generation: beginPreview(state.generation),
    example: code ? fallbackCurrencyPreview(code) : "",
  };
}

/** Ignore a formatter result that belongs to an older currency choice. */
export function commitCurrencyPreview(state: PreviewState, generation: number, example: string): PreviewState {
  if (!isLatestPreview(generation, state.generation)) {
    return state;
  }
  return { generation: state.generation, example };
}
