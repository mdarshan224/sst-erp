import { z } from "zod";
import { env } from "cloudflare:workers";
import { all, batch, one, now, stmt, uuid } from "./db";
import { ApiError, constantEqual, hmac } from "./security";
import { cloudflareConfig } from "./cloudflare-hostnames";
// Hostnames are taken exclusively from the server URL. Forwarded/client headers
// cannot select a tenant. Hosting and ownership verification must both succeed.
export async function domainTenant(request: Request) {
  let host = new URL(request.url).hostname.toLowerCase();
  const forwarded = request.headers.get("x-sohan-proxy-host");
  if (forwarded) {
    const timestamp = request.headers.get("x-sohan-proxy-time") || "",
      c = await cloudflareConfig();
    const u = new URL(request.url);
    if (
      host !== "erp.sohansoft.in" ||
      !c.proxySecret ||
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 180000 ||
      !constantEqual(
        await hmac(
          c.proxySecret,
          [forwarded, timestamp, request.method, u.pathname + u.search].join(
            "\n",
          ),
        ),
        request.headers.get("x-sohan-proxy-signature") || "",
      )
    )
      throw new ApiError(
        403,
        "INVALID_DOMAIN_PROXY",
        "Domain proxy authentication failed.",
      );
    if (!/^[a-z0-9.-]+$/.test(forwarded))
      throw new ApiError(400, "INVALID_DOMAIN", "Invalid forwarded domain.");
    host = forwarded;
  }
  if (host === "erp.sohansoft.in") return null;
  return one<{ id: string; slug: string; name: string }>(
    "SELECT i.id,i.slug,i.name FROM institution_domains d JOIN institutions i ON i.id=d.institution_id WHERE d.hostname=? AND d.status='Active' AND d.verification_status='Verified' AND d.ssl_status='Active' AND d.hosting_status='active' AND i.status='Active'",
    [host],
  );
}
export async function bindHost(request: Request, path: string[]) {
  const tenant = await domainTenant(request);
  if (!tenant) {
    if (request.headers.has("x-sohan-proxy-host"))
      throw new ApiError(
        404,
        "DOMAIN_NOT_ACTIVE",
        "This institution domain is not active.",
      );
    return { request, tenant: null };
  }
  if (request.headers.has("x-sohan-proxy-host")) {
    const u = new URL(request.url);
    u.hostname = request.headers.get("x-sohan-proxy-host")!;
    request = new Request(u.toString(), request);
  }
  if (path[0] === "platform" || path[0] === "organizations")
    throw new ApiError(
      403,
      "PLATFORM_ORIGIN_REQUIRED",
      "Use erp.sohansoft.in for platform administration.",
    );
  const supplied = request.headers.get("x-institution-id");
  if (supplied && supplied !== tenant.id)
    throw new ApiError(
      403,
      "TENANT_MISMATCH",
      "This domain belongs to another institution.",
    );
  if (path[0] === "campus" && path[1] !== tenant.slug && path[1] !== tenant.id)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "Institution portal not found on this domain.",
    );
  const headers = new Headers(request.headers);
  for (const key of [
    "x-sohan-proxy-host",
    "x-sohan-proxy-time",
    "x-sohan-proxy-signature",
  ])
    headers.delete(key);
  headers.set("x-institution-id", tenant.id);
  headers.set("x-sohan-domain-tenant", tenant.id);
  return {
    tenant,
    request: new Request(request.url, {
      method: request.method,
      headers,
      ...(!["GET", "HEAD"].includes(request.method)
        ? { body: await request.arrayBuffer() }
        : {}),
    }),
  };
}
export async function domainBindings(request: Request) {
  if (
    !env.JOB_SECRET ||
    !constantEqual(
      request.headers.get("authorization") || "",
      "Bearer " + env.JOB_SECRET,
    )
  )
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "A hosting maintenance credential is required.",
    );
  if (request.method === "GET") {
    const p = new URL(request.url).searchParams,
      page = Math.max(1, parseInt(p.get("page") || "1") || 1);
    return {
      rows: await all(
        "SELECT institution_id,hostname,status,verification_status,ssl_status,hosting_id,hosting_status,hosting_records FROM institution_domains ORDER BY institution_id LIMIT 100 OFFSET ?",
        [(page - 1) * 100],
      ),
      page,
    };
  }
  if (request.method !== "POST")
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET or POST.");
  const d = z
    .object({
      institutionId: z.string(),
      hostname: z.string(),
      hostingId: z.string().min(1).max(200),
      status: z.enum(["pending", "active", "failed"]),
      sslStatus: z.string().max(100).nullable(),
      error: z.string().max(500).nullable(),
      records: z
        .array(
          z.object({
            type: z.enum(["TXT", "CNAME", "A"]),
            name: z.string().max(300),
            value: z.string().max(2000),
          }),
        )
        .max(20),
    })
    .parse(await request.json());
  const current = await one(
    "SELECT * FROM institution_domains WHERE institution_id=? AND hostname=?",
    [d.institutionId, d.hostname],
  );
  if (!current)
    throw new ApiError(
      409,
      "DOMAIN_CHANGED",
      "The configured hostname changed; refresh the hosting request.",
    );
  if (current.hosting_id?.startsWith("cf:"))
    throw new ApiError(
      409,
      "CLOUDFLARE_MANAGED",
      "Use the Cloudflare hostname status check for this domain.",
    );
  const active =
      d.status === "active" &&
      d.sslStatus === "active" &&
      current.verification_status === "Verified",
    status = active
      ? "Active"
      : current.verification_status === "Verified"
        ? "Verified"
        : "Pending Verification",
    stamp = now();
  await batch([
    stmt(
      "UPDATE institution_domains SET hosting_id=?,hosting_status=?,hosting_records=?,hosting_checked_at=?,hosting_error=?,ssl_status=?,status=?,updated_at=? WHERE institution_id=? AND hostname=?",
      [
        d.hostingId,
        d.status,
        JSON.stringify(d.records),
        stamp,
        d.error,
        d.sslStatus === "active" ? "Active" : "Pending Provisioning",
        status,
        stamp,
        d.institutionId,
        d.hostname,
      ],
    ),
    stmt(
      "INSERT INTO platform_audit_logs(id,institution_id,user_id,user_name,action,entity,entity_id,old_value,new_value,created_at) VALUES(?,?,'hosting-service','Hosting service','Synchronized hosting domain','institution_domains',?,?,?,?)",
      [
        uuid(),
        d.institutionId,
        current.id,
        JSON.stringify({ status: current.status }),
        JSON.stringify({
          hostname: d.hostname,
          status,
          hosting: d.status,
          ssl: d.sslStatus,
        }),
        stamp,
      ],
    ),
  ]);
  return { hostname: d.hostname, status, sslStatus: d.sslStatus };
}
