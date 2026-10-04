import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, migrateThemePreferences, THEME_MIGRATION_KEY } from "./theme-preferences";

const bootstrap = readFileSync(new URL("../../public/set-theme.js", import.meta.url), "utf8");
const key = "homebox/preferences/location";
function load(storage: Map<string, string>) {
  const attributes: Record<string, string> = {};
  runInNewContext(bootstrap, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    document: {
      documentElement: {
        setAttribute: (key: string, value: string) => (attributes[key] = value),
        classList: { add() {} },
      },
    },
    // The default does not consult the device preference.
    matchMedia: () => {
      throw new Error("Device appearance must not be consulted");
    },
    console: { error() {} },
  });
  return attributes["data-theme"];
}

describe("one-time Claude theme preference migration", () => {
  it.each([
    {},
    { theme: "light" },
    { theme: "homebox" },
    { theme: "coffee" },
    { theme: "claude-dark" },
    { theme: "light", [THEME_MIGRATION_KEY]: false },
  ])("migrates a legacy scope and preserves other state: %j", saved => {
    const preferences = {
      ...saved,
      showEmpty: false,
      language: "de",
      duplicateSettings: { copyAttachments: false },
    };
    const before = structuredClone(preferences);
    const migration = migrateThemePreferences(preferences);
    expect(migration.changed).toBe(true);
    expect(migration.preferences).toEqual({
      ...preferences,
      theme: DEFAULT_THEME,
      [THEME_MIGRATION_KEY]: true,
    });
    expect(preferences).toEqual(before);
    const storage = new Map([
      [key, JSON.stringify(preferences)],
      ["inventory", "untouched"],
    ]);
    expect(load(storage)).toBe(DEFAULT_THEME);
    expect(JSON.parse(storage.get(key)!)).toEqual(migration.preferences);
    expect(storage.get("inventory")).toBe("untouched");
    const after = storage.get(key);
    expect(load(storage)).toBe(DEFAULT_THEME);
    expect(storage.get(key)).toBe(after);
  });

  it("records completion for a fresh browser", () => {
    const storage = new Map<string, string>();
    expect(load(storage)).toBe(DEFAULT_THEME);
    expect(JSON.parse(storage.get(key)!)).toEqual({
      theme: DEFAULT_THEME,
      [THEME_MIGRATION_KEY]: true,
    });
  });

  it.each(["claude-dark", "light", "coffee", "homebox"])(
    "retains a completed scope's %s choice across sessions",
    theme => {
      const saved = { theme, [THEME_MIGRATION_KEY]: true, showEmpty: false };
      expect(migrateThemePreferences(saved)).toEqual({
        preferences: saved,
        changed: false,
      });
      const storage = new Map([[key, JSON.stringify(saved)]]);
      expect(load(storage)).toBe(theme);
      expect(load(storage)).toBe(theme);
      expect(JSON.parse(storage.get(key)!)).toEqual(saved);
    }
  );

  it("does not reset a later explicit choice", () => {
    const storage = new Map<string, string>();
    load(storage);
    const saved = JSON.parse(storage.get(key)!);
    saved.theme = "light";
    storage.set(key, JSON.stringify(saved));
    expect(load(storage)).toBe("light");
    expect(migrateThemePreferences(saved).changed).toBe(false);
  });

  it.each([undefined, null, "not-a-theme", ""])(
    "falls back for invalid completed theme %j without resetting the marker",
    theme => {
      expect(migrateThemePreferences({ theme, [THEME_MIGRATION_KEY]: true }).preferences).toEqual({
        theme: DEFAULT_THEME,
        [THEME_MIGRATION_KEY]: true,
      });
    }
  );

  it("applies the default when storage is unavailable or malformed", () => {
    expect(load(new Map([[key, "invalid json"]]))).toBe(DEFAULT_THEME);
    const attributes: Record<string, string> = {};
    runInNewContext(bootstrap, {
      localStorage: {
        getItem() {
          throw new Error("Storage denied");
        },
      },
      document: {
        documentElement: {
          setAttribute: (k: string, v: string) => (attributes[k] = v),
          classList: { add() {} },
        },
      },
      console: { error() {} },
    });
    expect(attributes["data-theme"]).toBe(DEFAULT_THEME);
  });
});
