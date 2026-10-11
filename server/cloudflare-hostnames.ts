import { env } from "cloudflare:workers";
import { ApiError } from "./security";
export const cnameTarget = "erp.sohansoft.in";
import { openPlatformConfig, sealPlatformConfig } from "./providers";
import { Actor, permitPlatform } from "./security";
import { batch, stmt } from "./db";
import { platformAudit } from "./tenancy";
import { z } from "zod";
export async function cloudflareConfig() {
  return (
    (await openPlatformConfig<{
      zoneId: string;
      apiToken: string;
      proxySecret?: string;
    }>("cloudflare")) || {
      zoneId: env.CLOUDFLARE_ZONE_ID || "",
      apiToken: env.CLOUDFLARE_API_TOKEN || "",
    }
  );
}
export const cloudflareConfigured = async () => {
  const c = await cloudflareConfig();
  return !!c.apiToken && /^[a-f0-9]{32}$/.test(c.zoneId);
};
export async function cloudflareSetup(
  actor: Actor,
  action: string | undefined,
  method: string,
  body: unknown,
) {
  permitPlatform(actor, method === "GET" ? "domains.view" : "domains.manage");
  if (method === "GET") {
    const c = await cloudflareConfig();
    return {
      zoneId: c.zoneId,
      tokenConfigured: !!c.apiToken,
      proxyConfigured: !!c.proxySecret,
      cnameTarget,
      configured: await cloudflareConfigured(),
    };
  }
  if (method !== "POST")
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET or POST.");
  if (action === "check") {
    const fallback = await cloudflareHostname("GET", "/fallback_origin");
    return {
      connected: true,
      fallbackOrigin: fallback.origin || null,
      fallbackStatus: fallback.status || "Not Configured",
      ready: fallback.status === "active",
    };
  }
  const d = z
    .object({
      zoneId: z.string().regex(/^[a-f0-9]{32}$/),
      proxySecret: z.string().min(32).max(200).optional(),
      apiToken: z.string().trim().min(20).max(500).optional(),
    })
    .parse(body);
  const old = await cloudflareConfig();
  const apiToken = d.apiToken || old.apiToken;
  if (!apiToken)
    throw new ApiError(
      422,
      "TOKEN_REQUIRED",
      "Enter a scoped Cloudflare API token.",
    );
  await batch([
    stmt(
      "INSERT INTO platform(key,value) VALUES('secret:cloudflare',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [
        await sealPlatformConfig("cloudflare", {
          zoneId: d.zoneId,
          apiToken,
          proxySecret: d.proxySecret || old.proxySecret,
        }),
      ],
    ),
    platformAudit(
      actor,
      "Updated Cloudflare SaaS configuration",
      "platform",
      "cloudflare",
      null,
      { zoneId: d.zoneId, tokenConfigured: true },
    ),
  ]);
  return { saved: true };
}
export async function cloudflareHostname(
  method: "GET" | "POST" | "DELETE",
  suffix: string,
  body?: unknown,
) {
  const c = await cloudflareConfig();
  if (!(await cloudflareConfigured()))
    throw new ApiError(
      503,
      "CLOUDFLARE_NOT_CONFIGURED",
      "Connect your Cloudflare zone and scoped API token in Platform Settings → Custom domains, then enable Cloudflare for SaaS and configure its fallback origin.",
    );
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${c.zoneId}/custom_hostnames${suffix}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${c.apiToken}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new ApiError(
      503,
      "CLOUDFLARE_UNAVAILABLE",
      "Cloudflare could not be reached. Check domain status before retrying.",
    );
  }
  const result: any = await response.json();
  if (!response.ok || result.success !== true)
    throw new ApiError(
      502,
      "CLOUDFLARE_REJECTED",
      "Cloudflare rejected this request. Check your zone, API permissions and Cloudflare for SaaS configuration.",
    );
  return result.result;
}
export async function findHostname(hostname: string) {
  const list = await cloudflareHostname(
    "GET",
    "?" + new URLSearchParams({ hostname }),
  );
  return list.find((value: any) => value.hostname === hostname) || null;
}
export function hostnameRecords(value: any) {
  const records: { type: string; name: string; value: string }[] = [];
  const owner = value.ownership_verification;
  if (owner?.type === "txt" && owner.name && owner.value)
    records.push({ type: "TXT", name: owner.name, value: owner.value });
  for (const r of value.ssl?.validation_records || [])
    if (r.txt_name && r.txt_value)
      records.push({ type: "TXT", name: r.txt_name, value: r.txt_value });
  return records.filter(
    (r, i) =>
      records.findIndex((x) => x.name === r.name && x.value === r.value) === i,
  );
}
