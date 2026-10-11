// Deploy this small Worker in the sohansoft.in Cloudflare account. It preserves
// customer-host tenancy while fetching the already deployed canonical ERP.
interface ProxyEnv {
  DOMAIN_PROXY_SECRET: string;
}
export default {
  async fetch(request: Request, env: ProxyEnv): Promise<Response> {
    const source = new URL(request.url);
    if (
      source.hostname === "erp.sohansoft.in" ||
      source.hostname === "sohansoft.in" ||
      source.hostname.endsWith(".sohansoft.in")
    )
      return fetch(request);
    if (!env.DOMAIN_PROXY_SECRET || env.DOMAIN_PROXY_SECRET.length < 32)
      return new Response("Domain proxy is not configured", { status: 503 });
    const target = new URL(source);
    target.hostname = "erp.sohansoft.in";
    target.protocol = "https:";
    target.port = "";
    const timestamp = String(Date.now());
    const value = [
      source.hostname,
      timestamp,
      request.method,
      source.pathname + source.search,
    ].join("\n");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.DOMAIN_PROXY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const headers = new Headers(request.headers);
    for (const key of [...headers.keys()])
      if (
        key.toLowerCase().startsWith("oai-") ||
        key.toLowerCase().startsWith("x-sohan-proxy-")
      )
        headers.delete(key);
    headers.delete("host");
    headers.set("x-sohan-proxy-host", source.hostname);
    headers.set("x-sohan-proxy-time", timestamp);
    headers.set("x-sohan-proxy-signature", signature);
    const upstream = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : request.body,
        redirect: "manual",
      }),
    );
    const responseHeaders = new Headers(upstream.headers);
    const location = responseHeaders.get("location");
    if (location) {
      const redirect = new URL(location, target);
      if (
        redirect.hostname === "erp.sohansoft.in" &&
        !redirect.pathname.startsWith("/admin")
      ) {
        redirect.hostname = source.hostname;
        responseHeaders.set("location", redirect.toString());
      }
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
