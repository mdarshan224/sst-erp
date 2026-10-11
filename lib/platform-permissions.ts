export const platformPermissions = [
  "dashboard.view",
  "institutions.view",
  "institutions.create",
  "institutions.edit",
  "institutions.support",
  "institutions.delete",
  "domains.view",
  "domains.manage",
  "reports.view",
  "users.manage",
  "roles.manage",
  "payments.view",
  "payments.configure",
  "subscriptions.view",
  "subscriptions.manage",
  "plans.view",
  "plans.manage",
  "audit.view",
  "settings.view",
  "settings.manage",
  "organizations.manage",
  "holidays.manage",
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];
export function platformRoutePermission(
  path: string[],
  method: string,
): PlatformPermission | null {
  const [kind, id, action] = path;
  if (kind === "cloudflare")
    return method === "GET"
      ? "domains.view"
      : method === "POST"
        ? "domains.manage"
        : null;
  if (kind === "billing-gateways")
    return ["GET", "POST"].includes(method) ? "payments.configure" : null;
  if (kind === "billing-orders")
    return method === "GET" ? "payments.view" : null;
  if (kind === "roles")
    return ["GET", "POST", "PATCH"].includes(method) ? "roles.manage" : null;
  if (kind === "administrators")
    return ["GET", "POST"].includes(method) ? "roles.manage" : null;
  if (kind === "cleanup")
    return method === "GET" && !id ? "institutions.delete" : null;
  if (kind === "institutions") {
    if (action === "deletion")
      return (method === "GET" && !path[3]) ||
        (method === "POST" &&
          ["challenge", "request", "restore", "finalize", "resume"].includes(
            path[3],
          ))
        ? "institutions.delete"
        : null;
    if (method === "GET" && !action) return "institutions.view";
    if (!id && method === "POST") return "institutions.create";
    if (
      (action === "domain" || action === "verify-domain") &&
      method === "POST"
    )
      return "domains.manage";
    if (action === "support" && method === "POST")
      return "institutions.support";
    if (action === "admins" && method === "POST") return "users.manage";
    if (action === "subscription" && method === "PATCH")
      return "subscriptions.manage";
    if (
      (!action && method === "PATCH") ||
      (action === "logo" && method === "POST") ||
      (action === "status" && method === "POST")
    )
      return "institutions.edit";
    return null;
  }
  const reads: Record<string, PlatformPermission> = {
    dashboard: "dashboard.view",
    plans: "plans.view",
    subscriptions: "subscriptions.view",
    usage: "reports.view",
    domains: "domains.view",
    audit: "audit.view",
    payments: "payments.view",
    settings: "settings.view",
    organizations: "organizations.manage",
    holidays: "holidays.manage",
  };
  const writes: Record<string, PlatformPermission> = {
    plans: "plans.manage",
    payments: "payments.configure",
    settings: "settings.manage",
    organizations: "organizations.manage",
    holidays: "holidays.manage",
  };
  if (method === "GET") return reads[kind] || null;
  const allowed: Record<string, string[]> = {
    plans: ["POST", "PATCH"],
    payments: ["POST"],
    settings: ["PATCH"],
    organizations: ["POST", "PATCH"],
    holidays: ["POST"],
  };
  return allowed[kind]?.includes(method) ? writes[kind] || null : null;
}
export function platformPagePermission(
  path: string,
): PlatformPermission | null {
  const parts = path.split("/").filter(Boolean).slice(1);
  if (!parts.length) return "dashboard.view";
  if (parts[0] === "institutions" && parts[1] === "new")
    return "institutions.create";
  return platformRoutePermission(parts, "GET");
}
