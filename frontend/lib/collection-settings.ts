/** Amount shown in the currency example. Not a currency, and not a fixed USD string. */
export const COLLECTION_SETTINGS_EXAMPLE_AMOUNT = 1000;

export type SettingsDraft = {
  name: string;
  currency: string;
};

export type LoadedCollectionSettings = {
  id: string;
  name: string;
  currency: string;
};

export type SettingsHydration = SettingsDraft & {
  loadedId: string | null;
  dirty: boolean;
};

export function shouldKeepSettingsDraft(loadedId: string | null, incomingId: string, dirty: boolean): boolean {
  return dirty && loadedId === incomingId;
}

/**
 * A reload of the same collection must not discard an unsaved or failed edit.
 * Switching collections replaces the draft with that collection's values.
 */
export function draftAfterLoad(current: SettingsHydration, incoming: LoadedCollectionSettings): SettingsHydration {
  if (shouldKeepSettingsDraft(current.loadedId, incoming.id, current.dirty)) {
    return {
      name: current.name,
      currency: current.currency,
      loadedId: incoming.id,
      dirty: true,
    };
  }

  return {
    name: incoming.name,
    currency: incoming.currency,
    loadedId: incoming.id,
    dirty: false,
  };
}

/**
 * Apply the persisted group unless the person kept typing while the request was in flight.
 * Hydration always records what the server stored, so a later reload can tell the draft is dirty.
 */
export function draftAfterSuccessfulSave(
  current: SettingsDraft,
  submitted: SettingsDraft,
  saved: LoadedCollectionSettings
): SettingsHydration {
  const keepEdits = current.name !== submitted.name || current.currency !== submitted.currency;
  return {
    name: keepEdits ? current.name : saved.name,
    currency: keepEdits ? current.currency : saved.currency,
    loadedId: saved.id,
    dirty: keepEdits,
  };
}

export function canSubmitSettings(options: { hasCollection: boolean; saving: boolean }): boolean {
  return options.hasCollection && !options.saving;
}

export function beginCurrencyPreview(generation: number): number {
  return generation + 1;
}

export function currencyPreviewIsCurrent(requestGeneration: number, latestGeneration: number): boolean {
  return requestGeneration === latestGeneration;
}

export function currencyPreviewFallback(code: string, amount = COLLECTION_SETTINGS_EXAMPLE_AMOUNT): string {
  return `${code} ${amount}`;
}

export type CurrencyPreviewResult = { status: "empty" } | { status: "stale" } | { status: "ready"; value: string };

/**
 * Format 1000 in the selected currency. A slower response for an earlier choice must not
 * replace the example for the choice now on screen. Empty code clears the example.
 */
export async function formatSettingsCurrencyExample(
  code: string,
  locale: string,
  format: (amount: number, currency: string, locale: string) => Promise<string>,
  isCurrent: () => boolean
): Promise<CurrencyPreviewResult> {
  if (!code.trim()) {
    return { status: "empty" };
  }

  try {
    const value = await format(COLLECTION_SETTINGS_EXAMPLE_AMOUNT, code, locale);
    if (!isCurrent()) {
      return { status: "stale" };
    }
    return { status: "ready", value };
  } catch {
    if (!isCurrent()) {
      return { status: "stale" };
    }
    return { status: "ready", value: currencyPreviewFallback(code) };
  }
}

/** Keep the existing toast text, and append server validation when the API sent it. */
export function settingsFailureMessage(fallback: string, data: unknown): string {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const record = data as { error?: unknown; fields?: unknown };
  const parts: string[] = [];
  if (typeof record.error === "string" && record.error.trim()) {
    parts.push(record.error.trim());
  }
  if (record.fields && typeof record.fields === "object") {
    for (const [field, message] of Object.entries(record.fields as Record<string, unknown>)) {
      if (typeof message === "string" && message.trim()) {
        parts.push(`${field}: ${message.trim()}`);
      }
    }
  }

  if (!parts.length) {
    return fallback;
  }
  return `${fallback} ${parts.join(" ")}`;
}
