import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { darkThemes, themes } from "../lib/data/themes";

const css = postcss.parse(readFileSync(new URL("../assets/css/main.css", import.meta.url), "utf8"));

function tokensFor(selector: string) {
  const tokens = new Map<string, string>();
  css.walkRules(selector, rule => {
    rule.walkDecls(declaration => {
      tokens.set(declaration.prop, declaration.value);
    });
  });
  return tokens;
}

describe("xAI theme", () => {
  it("is selectable and classified as a dark theme", () => {
    expect(themes.filter(theme => theme.value === "xai")).toEqual([{ label: "xAI", value: "xai" }]);
    expect(darkThemes).toContain("xai");
  });

  it("defines every theme token without inheriting light defaults", () => {
    const defaults = tokensFor(":root,.homebox");
    const xai = tokensFor(".theme-xai");
    expect(defaults.size).toBeGreaterThan(0);
    for (const token of defaults.keys()) {
      expect(xai.has(token), `Missing ${token}`).toBe(true);
    }
    expect(xai.get("color-scheme")).toBe("dark");
    expect(xai.get("--background")).toBe("0 0% 4%");
    expect(xai.get("--primary")).toBe("0 0% 96%");
    expect(xai.get("--primary-foreground")).toBe("0 0% 4%");
  });

  it("restores the saved theme before app mounting", () => {
    const attributes = new Map<string, string>();
    const classes = new Set<string>();
    runInNewContext(readFileSync(new URL("../public/set-theme.js", import.meta.url), "utf8"), {
      console: { log: () => {}, error: () => {} },
      localStorage: { getItem: () => JSON.stringify({ theme: "xai" }) },
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) => attributes.set(name, value),
          classList: { add: (value: string) => classes.add(value) },
        },
      },
    });
    expect(attributes.get("data-theme")).toBe("xai");
    expect(classes.has("theme-xai")).toBe(true);
  });
});
