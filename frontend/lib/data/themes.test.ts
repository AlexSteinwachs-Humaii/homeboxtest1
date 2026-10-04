import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { darkThemes, themes } from "./themes";

const css = readFileSync(new URL("../../assets/css/main.css", import.meta.url), "utf8");
const block = css.match(/\.theme-claude-dark\s*\{([^}]+)\}/)![1]!;
const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]]));

// WCAG relative luminance, calculated from the actual CSS HSL tokens.
function luminance(hsl: string) {
  const [h, s, l] = hsl.split(" ").map(parseFloat) as [number, number, number];
  const saturation = s / 100;
  const lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("Claude-inspired Dark", () => {
  it("adds an explicitly named option without dropping existing choices", () => {
    expect(themes.find(t => t.value === "claude-dark")?.label).toBe("Claude-inspired Dark");
    expect(themes).toHaveLength(30);
    expect(themes.some(t => t.value === "homebox")).toBe(true);
    expect(themes.some(t => t.value === "coffee")).toBe(true);
    expect(new Set(themes.map(t => t.value)).size).toBe(themes.length);
    expect(darkThemes).toContain("claude-dark");
    expect(block).toContain("color-scheme: dark;");
  });

  it.each([
    ["foreground", "background"],
    ["foreground", "background-accent"],
    ["card-foreground", "card"],
    ["popover-foreground", "popover"],
    ["primary-foreground", "primary"],
    ["secondary-foreground", "secondary"],
    ["accent-foreground", "accent"],
    ["muted-foreground", "muted"],
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["muted-foreground", "popover"],
    ["destructive-foreground", "destructive"],
    ["sidebar-foreground", "sidebar-background"],
    ["sidebar-primary-foreground", "sidebar-primary"],
    ["sidebar-accent-foreground", "sidebar-accent"],
    ["primary", "background"],
    ["primary", "card"],
    ["primary", "popover"],
    ["destructive", "background"],
  ])("keeps ordinary %s text on %s above 4.5:1 (also exceeds large-text 3:1)", (text, surface) => {
    expect(contrast(tokens[text]!, tokens[surface]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["ring", "border", "input", "sidebar-ring", "sidebar-border"])("keeps %s visible on dark surfaces", token => {
    expect(contrast(tokens[token]!, tokens.background!)).toBeGreaterThanOrEqual(3);
  });

  it.each(["success", "info", "warning", "error"])("keeps %s feedback readable", status => {
    const bg = css.match(new RegExp(`--${status}-bg: hsl\\(([^)]+)\\)`))![1]!;
    const text = css.match(new RegExp(`--${status}-text: hsl\\(([^)]+)\\)`))![1]!;
    expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("restores the saved choice before app mount using the existing bootstrap", () => {
    const attributes: Record<string, string> = {};
    const classes: string[] = [];
    const preference = JSON.stringify({
      theme: "claude-dark",
      claudeDarkThemeMigrationV1: true,
      showEmpty: false,
    });
    runInNewContext(readFileSync(new URL("../../public/set-theme.js", import.meta.url), "utf8"), {
      localStorage: {
        getItem: (key: string) => {
          expect(key).toBe("homebox/preferences/location");
          return preference;
        },
      },
      document: {
        documentElement: {
          setAttribute: (key: string, value: string) => {
            attributes[key] = value;
          },
          classList: { add: (value: string) => classes.push(value) },
        },
      },
      console: {
        log() {},
        error: (error: unknown) => {
          throw error;
        },
      },
    });
    expect(attributes["data-theme"]).toBe("claude-dark");
    expect(classes).toContain("theme-claude-dark");
  });
});
