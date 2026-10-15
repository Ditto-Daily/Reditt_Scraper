// Cloudflare Worker: relays PullPush submission searches for the Vercel app.
// Env vars on the Worker: RELAY_KEY (secret, must match PULLPUSH_PROXY_KEY on Vercel).
const UPSTREAM = "https://api.pullpush.io/reddit/search/submission/";

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    if (!env.RELAY_KEY || request.headers.get("x-relay-key") !== env.RELAY_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }
    const incoming = new URL(request.url);
    const upstream = new URL(UPSTREAM);
    upstream.search = incoming.search;
    const response = await fetch(upstream, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; DITTO-Reddit-Intelligence/1.0)" },
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  },
};
