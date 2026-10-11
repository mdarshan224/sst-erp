import { z } from "zod";
import { batch, now, one, stmt, uuid } from "./db";
import { Actor, ApiError, permit } from "./security";
import {
  cloudflareConfigured,
  cloudflareHostname,
  cnameTarget,
  findHostname,
  hostnameRecords,
} from "./cloudflare-hostnames";
import { platformAudit } from "./tenancy";
export const portalOrigin = (request: Request) => "https://erp.sohansoft.in";
export async function domainInfo(id: string, request: Request) {
  const i = await one("SELECT id,slug FROM institutions WHERE id=?", [id]);
  if (!i) throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  const domain = await one(
    "SELECT * FROM institution_domains WHERE institution_id=?",
    [id],
  );
  const target = cnameTarget;
  return {
    defaultPortal: portalOrigin(request) + "/campus/" + i.slug,
    domain,
    status: domain?.status || "Not Configured",
    verificationStatus: domain?.verification_status || "Not Configured",
    sslStatus: domain?.ssl_status || "Not Configured",
    dns: domain
      ? [
          { type: "CNAME", name: domain.hostname, value: target },
          ...JSON.parse(
            domain.hosting_id?.startsWith("cf:")
              ? domain.hosting_records || "[]"
              : "[]",
          ).filter((r: { type: string }) => r.type !== "CNAME"),
        ]
      : [],
    provisioningAvailable: await cloudflareConfigured(),
    customPortal:
      domain?.status === "Active" ? "https://" + domain.hostname : null,
    provisioningNote:
      "Point your CNAME to erp.sohansoft.in. Add only the ownership and SSL TXT records returned by Cloudflare below. TXT values are verification tokens, not the portal domain. Cloudflare for SaaS and an active fallback origin must be configured before HTTPS activation.",
  };
}
export async function configureDomain(
  actor: Actor,
  id: string,
  input: unknown,
) {
  permit(actor, "system");
  const d = z
    .object({
      hostname: z
        .string()
        .trim()
        .toLowerCase()
        .max(253)
        .regex(
          /^(?!.*\.\.)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
        ),
    })
    .parse(input);
  if (d.hostname.split(".").some((label) => label.length > 63))
    throw new ApiError(
      422,
      "INVALID_DOMAIN",
      "Each DNS label must be at most 63 characters.",
    );
  await domainInfo(id, actor.request);
  if (
    d.hostname === new URL(portalOrigin(actor.request)).hostname ||
    /\.(local|test|example|localhost)$/.test(d.hostname) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(d.hostname)
  )
    throw new ApiError(
      422,
      "INVALID_DOMAIN",
      "Enter a public institution hostname, such as fees.yourschool.in.",
    );
  const old = await one(
    "SELECT * FROM institution_domains WHERE institution_id=?",
    [id],
  );
  if (old?.hostname === d.hostname) return domainInfo(id, actor.request);
  if (
    await one(
      "SELECT institution_id FROM institution_domains WHERE hostname=? AND institution_id<>?",
      [d.hostname, id],
    )
  )
    throw new ApiError(
      409,
      "DOMAIN_IN_USE",
      "This hostname is already assigned to another institution.",
    );
  if (old?.hosting_id && !old.hosting_id.startsWith("cf:"))
    throw new ApiError(
      409,
      "LEGACY_DOMAIN_ATTACHED",
      "Disconnect the existing legacy hosting binding before changing this hostname.",
    );
  if (old?.hosting_id?.startsWith("cf:"))
    await cloudflareHostname(
      "DELETE",
      "/" + encodeURIComponent(old.hosting_id.slice(3)),
    );
  const token = "sohan-verification=" + uuid() + uuid().replaceAll("-", "");
  await batch([
    stmt(
      `INSERT INTO institution_domains(id,institution_id,hostname,verification_token,status,verification_status,ssl_status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,'Pending Verification','Pending Verification','Pending Provisioning',?,?,?,?) ON CONFLICT(institution_id) DO UPDATE SET hostname=excluded.hostname,verification_token=excluded.verification_token,status='Pending Verification',verification_status='Pending Verification',ssl_status='Pending Provisioning',last_checked_at=NULL,dns_message=NULL,hosting_id=NULL,hosting_status=NULL,hosting_records='[]',hosting_checked_at=NULL,hosting_error=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
      [
        old?.id || uuid(),
        id,
        d.hostname,
        token,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    platformAudit(
      actor,
      "Configured custom domain",
      "institution_domains",
      id,
      old,
      { hostname: d.hostname },
      id,
    ),
  ]);
  return domainInfo(id, actor.request);
}
export async function verifyDomain(actor: Actor, id: string) {
  permit(actor, "system");
  const info = await domainInfo(id, actor.request),
    d = info.domain;
  if (!d)
    throw new ApiError(422, "DOMAIN_REQUIRED", "Configure a domain first.");
  let remote = d.hosting_id?.startsWith("cf:")
    ? await cloudflareHostname(
        "GET",
        "/" + encodeURIComponent(d.hosting_id.slice(3)),
      )
    : await findHostname(d.hostname);
  if (!remote)
    remote = await cloudflareHostname("POST", "", {
      hostname: d.hostname,
      ssl: { method: "txt", type: "dv" },
    });
  // Cloudflare can issue SSL TXT tokens asynchronously after creation.
  if (!hostnameRecords(remote).length && remote.status !== "active")
    remote = await cloudflareHostname(
      "GET",
      "/" + encodeURIComponent(remote.id),
    );
  let routed = false;
  if (remote.status === "active" && remote.ssl?.status === "active") {
    let response: Response;
    try {
      response = await fetch(
        "https://cloudflare-dns.com/dns-query?" +
          new URLSearchParams({ name: d.hostname, type: "CNAME" }),
        {
          headers: { accept: "application/dns-json" },
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        },
      );
    } catch {
      throw new ApiError(
        503,
        "DNS_UNAVAILABLE",
        "DNS routing verification is unavailable. Retry the status check later.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        503,
        "DNS_UNAVAILABLE",
        "DNS routing verification is unavailable.",
      );
    const dns: any = await response.json();
    routed = (dns.Answer || []).some(
      (r: any) =>
        r.type === 5 &&
        r.name.replace(/\.$/, "").toLowerCase() === d.hostname &&
        r.data.replace(/\.$/, "").toLowerCase() === cnameTarget,
    );
  }
  const active =
    remote.status === "active" && remote.ssl?.status === "active" && routed;
  const status = active ? "Active" : "Pending Verification";
  const message = active
    ? "Cloudflare hostname and SSL are active."
    : "Add the Cloudflare verification records, point the CNAME to erp.sohansoft.in, then check again.";
  await batch([
    stmt(
      "UPDATE institution_domains SET hosting_id=?,hosting_status=?,hosting_records=?,hosting_checked_at=?,hosting_error=NULL,status=?,verification_status=?,ssl_status=?,last_checked_at=?,dns_message=?,updated_at=?,updated_by=? WHERE institution_id=? AND hostname=?",
      [
        "cf:" + remote.id,
        remote.status,
        JSON.stringify(hostnameRecords(remote)),
        now(),
        status,
        active ? "Verified" : "Pending Verification",
        remote.ssl?.status === "active" ? "Active" : "Pending Provisioning",
        now(),
        message,
        now(),
        actor.userId,
        id,
        d.hostname,
      ],
    ),
    platformAudit(
      actor,
      "Checked Cloudflare custom hostname",
      "institution_domains",
      id,
      { status: d.status },
      { status, message },
      id,
    ),
  ]);
  return domainInfo(id, actor.request);
}
