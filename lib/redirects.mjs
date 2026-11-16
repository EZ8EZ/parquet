/**
 * Old paths that now redirect, and where to. next.config.mjs reads this directly and
 * lib/nav.js re-exports it for the registry tests.
 *
 * Its own `.mjs` file because Node loads next.config.mjs natively, outside the bundler:
 * importing lib/nav.js from there made Node parse a typeless `.js` file as CommonJS,
 * fail, reparse it as ESM and print MODULE_TYPELESS_PACKAGE_JSON on every build.
 * `"type": "module"` in package.json would also silence it but changes how every
 * script and tool loads every `.js` file in the repo; an `.mjs` leaf is the smallest
 * change that is explicitly ESM.
 */
export const REDIRECTS = [
  { source: "/more", destination: "/settings" },
  { source: "/lab", destination: "/roster" },
];
