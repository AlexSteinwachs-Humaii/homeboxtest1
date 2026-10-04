import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`fresh sign-in defaults to Claude Dark on a ${colorScheme} device`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.route("**/api/v1/**", route =>
      route.fulfill({ json: { health: true, build: { version: "test" }, oidc: { enabled: false }, versions: [] } })
    );
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "claude-dark");
    await expect(page.locator("html")).toHaveClass(/theme-claude-dark/);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location")!)))
      .toMatchObject({
        theme: "claude-dark",
        claudeDarkThemeMigrationV1: true,
      });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "claude-dark");
    expect(await page.locator("html").evaluate(el => getComputedStyle(el).colorScheme)).toBe("dark");
  });
}
