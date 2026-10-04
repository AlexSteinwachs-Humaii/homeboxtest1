import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function hslToRgb(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function lin(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lum(rgb: number[]) {
  const r = lin(rgb[0] ?? 0);
  const g = lin(rgb[1] ?? 0);
  const b = lin(rgb[2] ?? 0);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]) {
  const l1 = lum(a);
  const l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function composite(fg: number[], bg: number[], alpha: number) {
  return fg.map((channel, index) => channel * alpha + (bg[index] ?? 0) * (1 - alpha));
}

function required(tokens: Record<string, string>, key: string) {
  const value = tokens[key];
  if (!value) {
    throw new Error(`missing token ${key}`);
  }
  return value;
}

function homeboxTokens(css: string) {
  const block = css.match(/:root,\.homebox \{([\s\S]*?)\n\}/);
  const body = block?.[1];
  if (!body) {
    throw new Error("homebox token block missing");
  }
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

function hsl(value: string) {
  const match = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) {
    throw new Error(`not an hsl triple: ${value}`);
  }
  return hslToRgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

describe("glass v5 materials", () => {
  const css = read("assets/css/main.css");
  const tokens = homeboxTokens(css);
  const ink = hsl(required(tokens, "foreground"));
  const muted = hsl(required(tokens, "muted-foreground"));
  const primary = hsl(required(tokens, "primary"));
  const primaryText = hsl(required(tokens, "primary-foreground"));
  const edge = hsl(required(tokens, "glass-edge"));
  const white = hsl(required(tokens, "background"));
  const card = hsl(required(tokens, "card"));
  const nav = hsl(required(tokens, "glass-nav"));
  const fallback = hsl(required(tokens, "glass-fallback"));
  const accent = hsl(required(tokens, "accent"));
  const accentText = hsl(required(tokens, "accent-foreground"));
  const sage = hsl(required(tokens, "glass-sage"));
  const blue = hsl(required(tokens, "glass-blue"));
  const lilac = hsl(required(tokens, "glass-lilac"));
  const navAlpha = Number(required(tokens, "glass-nav-alpha"));

  it("keeps alternate themes and the saved homebox preference", () => {
    expect(css).toContain(".theme-aqua");
    expect(css).toContain(".theme-winter");
    expect(css).toContain(".theme-dracula");
    expect(read("composables/use-preferences.ts")).toContain('theme: "homebox"');
    expect(read("composables/use-theme.ts")).toContain('"theme-winter"');
    expect(read("lib/data/themes.ts")).toContain('"homebox"');
    expect(read("components/ui/button/index.ts")).toContain("touch-icon");
    expect(read("components/ui/button/index.ts")).toContain("action:");
    expect(read("components/ui/button/index.ts")).toContain('icon: "size-9"');
  });

  it("supplies sage/blue/lilac materials, opaque surfaces, touch size and fallbacks", () => {
    expect(required(tokens, "glass-touch")).toBe("2.75rem");
    expect(required(tokens, "radius")).toBe("1.25rem");
    expect(required(tokens, "glass-sage")).toBeTruthy();
    expect(required(tokens, "glass-blue")).toBeTruthy();
    expect(required(tokens, "glass-lilac")).toBeTruthy();
    expect(css).toContain("backdrop-filter: blur(16px)");
    expect(css).toContain('html[data-theme="homebox"][data-glass-effects="off"]');
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))");
    expect(css).toContain("prefers-reduced-transparency");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".glass-panel");
    expect(css).toContain(".glass-field");
    expect(css).toContain(".glass-tabs");
    expect(css).toContain(".glass-nav");
    expect(read("components/ui/card/Card.vue")).toContain("glass-panel");
    expect(read("components/ui/input/Input.vue")).toContain("glass-field");
    expect(read("components/ui/select/SelectTrigger.vue")).toContain("glass-field");
    expect(read("layouts/default.vue")).toContain("aria-label=\"$t('menu.scan')\"");
    expect(read("layouts/default.vue")).toContain("aria-label=\"$t('global.search')\"");
  });

  it("meets contrast on effects and solid fallback surfaces", () => {
    const stops = [sage, blue, lilac, fallback, white, card];
    for (const surface of stops) {
      expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(edge, surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(primary, surface)).toBeGreaterThanOrEqual(3);
    }

    expect(contrast(primaryText, primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accentText, accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(edge, accent)).toBeGreaterThanOrEqual(3);

    for (const stop of [sage, blue, lilac]) {
      const composited = composite(nav, stop, navAlpha);
      expect(contrast(ink, composited)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, composited)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(edge, composited)).toBeGreaterThanOrEqual(3);
      const search = composite(nav, composited, 0.72);
      expect(contrast(ink, search)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(edge, search)).toBeGreaterThanOrEqual(3);
    }

    expect(contrast(primaryText, primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hsl("0 0% 100%"), primary)).toBeGreaterThanOrEqual(3);
  });
});
