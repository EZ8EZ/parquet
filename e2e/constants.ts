/**
 * The one place the E2E dev server's origin is written down - imported by both
 * playwright.config.ts (webServer.url / use.baseURL) and e2e/helpers.ts (cookie
 * priming needs an explicit URL; `context.addCookies` doesn't read Playwright's
 * `baseURL` the way `page.goto` does). Keeping this in one module means the two
 * can't drift into pointing at different ports.
 *
 * 3199 is deliberately not 3000: Playwright's webServer starts its own server,
 * and a developer very likely already has `next dev` running on 3000 for manual
 * work - this suite must never fight that server for its port.
 */
export const E2E_PORT = 3199;
// "localhost", not "127.0.0.1": Next 16's dev server only allows dev-resource
// requests (HMR, and critically the client JS chunks themselves) from origins in
// `allowedDevOrigins`, which defaults to covering "localhost" but NOT the
// numeric loopback address. Hitting the suite against 127.0.0.1 doesn't fail
// loudly - the page still renders (SSR HTML doesn't care), it just silently
// never hydrates, so every button on every page becomes permanently inert with
// no console error to catch it. `localhost` is what a real developer's browser
// already uses for `next dev`, so this is the more realistic choice anyway, not
// only the one that happens to work.
export const BASE_URL = `http://localhost:${E2E_PORT}`;
