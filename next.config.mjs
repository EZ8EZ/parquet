const nextConfig = {
  /**
   * /web is gone and its readers are not. The trade web shipped with a URL that four
   * other surfaces were linking (`/web?trade=<id>`), plus whatever anyone bookmarked
   * or pasted into league chat, so it redirects rather than 404s.
   *
   * 308 (`permanent: true`) rather than 307: the move is permanent, the method must
   * be preserved, and a permanent redirect is the only one a crawler will actually
   * take as an instruction to update the link. It lands on the deal INDEX rather than
   * trying to reconstruct `?trade=` into `/deals/<id>` - a redirect that reads query
   * strings is a route in disguise, and every in-app caller was updated at the source
   * (lib/tradegraph/url.ts) in the same change, so the only traffic left here is the
   * bookmark case, which wants the index anyway.
   */
  async redirects() {
    return [{ source: "/web", destination: "/deals", permanent: true }];
  },
  /**
   * Baseline response security headers - none of this app's own attack surface
   * depends on them (there's no user-submitted content rendered as HTML, no
   * third-party embed), but a private league site with real names/records is
   * still worth the standard hardening a professional deploy carries by
   * default, and it costs nothing to correctness. Deliberately NOT shipping a
   * Content-Security-Policy here: getting one right without breaking Next's
   * own inline hydration data and Vercel's preview-comments toolbar needs a
   * dedicated, carefully-tested pass, not a header bolted on alongside
   * everything else in this round.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
