// Runs before the SPA mounts, on both sign-in and authenticated pages.
// Keep the permanent marker/default aligned with lib/data/theme-preferences.ts.
let theme = "claude-dark";
try {
  const key = "homebox/preferences/location";
  const saved = JSON.parse(localStorage.getItem(key));
  const preferences =
    saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  if (preferences.claudeDarkThemeMigrationV1 !== true) {
    preferences.theme = theme;
    preferences.claudeDarkThemeMigrationV1 = true;
    localStorage.setItem(key, JSON.stringify(preferences));
  }
  if (typeof preferences.theme === "string" && preferences.theme) {
    theme = preferences.theme;
  }
} catch (e) {
  // Even when storage is unavailable, the new default must be visible.
  console.error("Failed to persist theme", e);
}
document.documentElement.setAttribute("data-theme", theme);
document.documentElement.classList.add("theme-" + theme);
