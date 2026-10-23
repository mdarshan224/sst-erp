/** Configured public origin for this deployment; request origin is the local/default fallback. */
export function portalBase(
  requestUrl: string,
  configured?: string,
  publicOverride?: string,
) {
  const request = new URL(requestUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    request.hostname,
  );
  const u = new URL(
    publicOverride ||
      (loopback ? request.origin : configured || request.origin),
  );
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("Invalid public portal URL configuration");
  return u.toString().replace(/\/$/, "");
}
