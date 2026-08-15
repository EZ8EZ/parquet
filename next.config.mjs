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
};
export default nextConfig;
