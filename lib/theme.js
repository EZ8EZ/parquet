/**
 * THEME PREFERENCE - a display escape hatch, not a second identity.
 *
 * Dark is what this app IS (DECISIONS D15) and stays the default for anyone who never
 * touches this. Light exists for the one real reason a light/dark toggle exists in any
 * app: some rooms, some eyes, some hours of the day want a light page instead. It is the
 * same layout and the same accent, just recoloured - never a second design (D64).
 *
 * The tokens themselves live in app/globals.css under `:root[data-theme=...]`. This
 * module only owns the NAME of the choice and how it is read and written, so the
 * inline boot script, the toggle, and any future preference all agree on one vocabulary.
 *
 * Client-only on purpose. Custom ranks needed a cookie because a SERVER component had
 * to read them (lib/rankings/customOrderServer.ts); nothing on the server renders
 * differently per theme - the colour swap happens entirely in CSS - so localStorage is
 * the right store and a cookie would be sent on every request for nothing.
 */
export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";
/** The localStorage key. Also hard-coded in the boot script - see `themeBootScript`. */
export const THEME_STORAGE_KEY = "parquet:theme";
/** The attribute the CSS keys off, set on `<html>`. */
export const THEME_ATTRIBUTE = "data-theme";
/**
 * The browser-chrome colour for each theme - the `<meta name="theme-color">` that
 * tints the address bar on mobile. This is the one themed surface CSS cannot reach,
 * so it is written imperatively from the same two places the `data-theme` attribute
 * is (the boot script and the toggle). Each value is that theme's `--color-bg`, so
 * the chrome reads as part of the page rather than a border around it - a paper app
 * under a near-black address bar looks broken on exactly the phones this app is
 * built for.
 */
export const THEME_CHROME = {
  dark: "#0b0c0e",
  light: "#f6f4f0",
};
export const THEME_META = [
  {
    id: "dark",
    label: "Dark",
    description: "The default. Near-black, editorial, one gold accent.",
  },
  {
    id: "light",
    label: "Paper",
    description:
      "Warm light ground. Same layout, same accent, darkened to hold text.",
  },
];
/**
 * Anything at all to a valid theme. Storage is untrusted input for the same reason a
 * URL is: it outlives the code that wrote it, and a value this app no longer ships
 * must degrade to the default rather than leave `<html>` in a state no CSS matches.
 * This is also the graceful-degradation path for anyone with the retired "contrast"
 * theme still in localStorage from before D64 (see DECISIONS.md): it is simply a
 * value THEMES no longer contains, so it falls through to DEFAULT_THEME below.
 */
export function parseTheme(raw) {
  return THEMES.includes(raw) ? raw : DEFAULT_THEME;
}
/**
 * The script that runs before first paint, inlined in <head>.
 *
 * WHY it has to be inline and blocking: React cannot do this. A theme read in an effect
 * lands after the browser has already painted the default, which is the flash of the
 * wrong theme every themed app gets wrong once. This runs synchronously before the body
 * exists, so the very first paint is already correct.
 *
 * Deliberately tiny and total: no storage access outside a try (Safari private mode
 * throws on localStorage), and any unreadable value falls through to the attribute
 * already on the element, which is the default.
 */
export function themeBootScript() {
  return [
    "(function(){try{",
    `var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
    `if(${JSON.stringify(THEMES)}.indexOf(t)>-1){`,
    `document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t);`,
    // The address-bar tint has to move with the theme or a paper page loads under
    // dark chrome. No-ops harmlessly if the meta tag has not been emitted yet; the
    // toggle re-syncs it on any interactive change.
    `var c=${JSON.stringify(THEME_CHROME)}[t];`,
    "var m=document.querySelector('meta[name=\"theme-color\"]');",
    "if(c&&m){m.setAttribute('content',c);}",
    "}",
    "}catch(e){}})();",
  ].join("");
}
