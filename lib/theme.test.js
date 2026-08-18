import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_CHROME,
  THEME_META,
  THEME_STORAGE_KEY,
  parseTheme,
  themeBootScript,
} from "./theme.js";
describe("parseTheme", () => {
  it("accepts every theme this app ships", () => {
    for (const t of THEMES) expect(parseTheme(t)).toBe(t);
  });
  it("falls back to the committed dark identity for anything else", () => {
    // Storage outlives the code that wrote it: a theme this app no longer ships, or a
    // hand-edited value, must not leave <html> in a state no CSS matches.
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("")).toBe("dark");
    expect(parseTheme("sepia")).toBe("dark");
    expect(parseTheme("Dark")).toBe("dark");
    expect(DEFAULT_THEME).toBe("dark");
  });
  it("degrades a stale 'contrast' value from before D64 to the default", () => {
    // Anyone with parquet:theme="contrast" already written by a pre-D64 build is a
    // real case, not a hypothetical: THEMES no longer contains it, so it takes the
    // exact same unknown-value path as any other retired or hand-edited string.
    expect(parseTheme("contrast")).toBe("dark");
    expect(THEMES).not.toContain("contrast");
  });
});
describe("THEME_META", () => {
  it("describes every theme exactly once, dark first", () => {
    expect(THEME_META.map((t) => t.id)).toEqual([...THEMES]);
    expect(THEME_META[0].id).toBe(DEFAULT_THEME);
    for (const t of THEME_META) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});
describe("themeBootScript", () => {
  const src = themeBootScript();
  it("names the same storage key and themes the rest of the app uses", () => {
    // The script is a string, so a renamed key or a new theme cannot be caught by the
    // type checker. This is the only thing standing between them and a silent drift.
    expect(src).toContain(JSON.stringify(THEME_STORAGE_KEY));
    for (const t of THEMES) expect(src).toContain(t);
  });
  it("cannot throw where localStorage is unavailable", () => {
    expect(src).toContain("try{");
    expect(src).toContain("catch");
  });
  it("actually applies a stored theme, and ignores a bogus one", () => {
    // Run the real script against a stub document/localStorage rather than trusting it
    // by eye - it is the one piece of this feature that runs before React exists.
    const run = (stored, withMeta = true) => {
      const attrs = { "data-theme": "dark" };
      const meta = {
        content: "#0b0c0e",
        setAttribute(k, v) {
          if (k === "content") this.content = v;
        },
      };
      const document = {
        documentElement: {
          setAttribute: (k, v) => {
            attrs[k] = v;
          },
        },
        querySelector: () => (withMeta ? meta : null),
      };
      const localStorage = { getItem: () => stored };
      new Function("document", "localStorage", src)(document, localStorage);
      return { theme: attrs["data-theme"], chrome: meta.content };
    };
    expect(run("light").theme).toBe("light");
    // Left exactly as the server rendered it.
    expect(run("sepia").theme).toBe("dark");
    expect(run("contrast").theme).toBe("dark");
    expect(run(null).theme).toBe("dark");
  });
  it("moves the address-bar tint with the theme, and copes with the meta missing", () => {
    const run = (stored, withMeta = true) => {
      const attrs = { "data-theme": "dark" };
      const meta = {
        content: THEME_CHROME.dark,
        setAttribute(k, v) {
          if (k === "content") this.content = v;
        },
      };
      const document = {
        documentElement: {
          setAttribute: (k, v) => {
            attrs[k] = v;
          },
        },
        querySelector: () => (withMeta ? meta : null),
      };
      const localStorage = { getItem: () => stored };
      new Function("document", "localStorage", src)(document, localStorage);
      return { theme: attrs["data-theme"], chrome: meta.content };
    };
    expect(run("light").chrome).toBe(THEME_CHROME.light);
    // A bogus theme - including the retired "contrast" - changes neither the
    // attribute nor the chrome.
    expect(run("sepia").chrome).toBe(THEME_CHROME.dark);
    expect(run("contrast").chrome).toBe(THEME_CHROME.dark);
    // The meta not being emitted yet must not break applying the theme itself.
    expect(run("light", false).theme).toBe("light");
  });
  it("survives localStorage throwing, leaving the default in place", () => {
    const attrs = { "data-theme": "dark" };
    const document = {
      documentElement: {
        setAttribute: (k, v) => {
          attrs[k] = v;
        },
      },
    };
    const localStorage = {
      getItem: () => {
        throw new Error("private mode");
      },
    };
    expect(() =>
      new Function("document", "localStorage", src)(document, localStorage),
    ).not.toThrow();
    expect(attrs["data-theme"]).toBe("dark");
  });
});
