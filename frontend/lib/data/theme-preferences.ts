import { themes } from "./themes";

export const DEFAULT_THEME = "claude-dark";
// Permanent, theme-specific marker. Do not bump this for ordinary releases.
export const THEME_MIGRATION_KEY = "claudeDarkThemeMigrationV1";

export function migrateThemePreferences<T extends Record<string, unknown>>(preferences: T) {
  const migrated = preferences[THEME_MIGRATION_KEY] !== true;
  const validTheme = themes.some(theme => theme.value === preferences.theme);
  return {
    preferences: {
      ...preferences,
      theme: migrated || !validTheme ? DEFAULT_THEME : preferences.theme,
      [THEME_MIGRATION_KEY]: true,
    },
    changed: migrated || !validTheme,
  };
}
