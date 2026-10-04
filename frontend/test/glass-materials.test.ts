import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { themes } from "../lib/data/themes";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../assets/css/main.css"), "utf8");
const buttonSource = readFileSync(resolve(here, "../components/ui/button/index.ts"), "utf8");
const preferencesSource = readFileSync(resolve(here, "../composables/use-preferences.ts"), "utf8");

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - chroma / 2;
  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function composite(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number
): [number, number, number] {
  return [
    Math.round(alpha * fg[0] + (1 - alpha) * bg[0]),
    Math.round(alpha * fg[1] + (1 - alpha) * bg[1]),
    Math.round(alpha * fg[2] + (1 - alpha) * bg[2]),
  ];
}

function rootTokens(): Record<string, string> {
  const block = css.match(/:root,\.homebox \{([\s\S]*?)\n\}/);
  if (!block) {
    throw new Error("missing :root,.homebox token block");
  }
  const tokens: Record<string, string> = {};
  const source = block[1] ?? "";
  for (const match of source.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

function hslToken(tokens: Record<string, string>, name: string): [number, number, number] {
  const raw = tokens[name];
  if (!raw) {
    throw new Error(`missing token --${name}`);
  }
  const parts = raw.split(/\s+/).map(part => Number.parseFloat(part));
  const hue = parts[0];
  const sat = parts[1];
  const light = parts[2];
  if (hue === undefined || sat === undefined || light === undefined || parts.some(part => Number.isNaN(part))) {
    throw new Error(`token --${name} is not H S L: ${raw}`);
  }
  return hslToRgb(hue, sat, light);
}

describe("Glass v5 materials", () => {
  const tokens = rootTokens();
  const ink = hslToken(tokens, "foreground");
  const muted = hslToken(tokens, "muted-foreground");
  const primary = hslToken(tokens, "primary");
  const primaryText = hslToken(tokens, "primary-foreground");
  const edge = hslToken(tokens, "glass-edge");
  const fallback = hslToken(tokens, "glass-nav-fallback");
  const card = hslToken(tokens, "card");
  const accent = hslToken(tokens, "accent");
  const accentText = hslToken(tokens, "accent-foreground");
  const secondary = hslToken(tokens, "secondary");
  const secondaryText = hslToken(tokens, "secondary-foreground");
  const destructive = hslToken(tokens, "destructive");
  const destructiveText = hslToken(tokens, "destructive-foreground");
  const stops = ["glass-sage", "glass-blue", "glass-lilac"].map(name => hslToken(tokens, name));
  const navAlpha = Number.parseFloat(tokens["glass-nav-alpha"] ?? "");
  const glass = hslToken(tokens, "glass-nav");

  it("keeps alternate themes and the saved HomeBox preference", () => {
    expect(preferencesSource).toContain('theme: "homebox"');
    expect(css).toContain(":root,.homebox {");
    for (const theme of themes) {
      if (theme.value === "homebox") {
        continue;
      }
      expect(css).toContain(`.theme-${theme.value} {`);
    }
    expect(css).toContain("--primary: 182 93% 49%;");
    expect(css).toContain("--primary: 326 100% 74%;");
  });

  it("meets text contrast on cards, gradient stops, glass and the solid fallback", () => {
    const surfaces = [card, fallback, ...stops];
    for (const surface of surfaces) {
      expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5);
    }

    expect(navAlpha).toBeGreaterThan(0);
    expect(navAlpha).toBeLessThan(1);
    for (const stop of stops) {
      const composited = composite(glass, stop, navAlpha);
      expect(contrast(ink, composited)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, composited)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(edge, composited)).toBeGreaterThanOrEqual(3);
      expect(contrast(edge, stop)).toBeGreaterThanOrEqual(3);
    }
  });

  it("meets control contrast for primary, destructive, accent and secondary pairs", () => {
    expect(contrast(primaryText, primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(destructiveText, destructive)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accentText, accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(secondaryText, secondary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(edge, card)).toBeGreaterThanOrEqual(3);
    expect(contrast(edge, fallback)).toBeGreaterThanOrEqual(3);
    expect(contrast(primary, card)).toBeGreaterThanOrEqual(3);
  });

  it("supplies opaque panels, touch targets, focus and a blur-independent fallback", () => {
    expect(css).toContain("backdrop-filter: none");
    expect(css).toContain('html[data-glass-effects="off"]');
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("background-attachment: scroll");
    expect(css).toContain('[data-mobile="true"][data-sidebar="sidebar"]');
    expect(css).not.toContain("overflow-x: hidden");
    expect(css).toContain("--glass-touch: 2.75rem");
    expect(css).toContain(".glass-panel");
    expect(css).toContain(".glass-field");
    expect(css).toContain(".glass-tabs");
    expect(buttonSource).toContain("action:");
    expect(buttonSource).toContain('"touch-icon"');
    expect(buttonSource).toContain("min-h-11");
    expect(buttonSource).toContain("size-11");
    expect(buttonSource).not.toContain('default: "h-11');
  });
});
