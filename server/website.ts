import { websiteSchema, websiteDefaults, enquirySchema } from "../lib/website";
import { all, one, batch, stmt, now } from "./db";
import { Actor, ApiError, sha256, csrf, rateLimit } from "./security";
import { platformAudit } from "./tenancy";
import { readBody, ok } from "./routes/shared";
export async function websiteConfig() {
  const row = await one(
    "SELECT value FROM platform WHERE key='website:config'",
  );
  return row ? websiteSchema.parse(JSON.parse(row.value)) : websiteDefaults;
}
export async function websiteAdmin(
  actor: Actor,
  path: string[],
  method: string,
  body: unknown,
  p: URLSearchParams,
) {
  if (path.length !== 2 || !["website", "enquiries"].includes(path[1]))
    throw new ApiError(404, "NOT_FOUND", "Website route not found.");
  if (path[1] === "website" && method === "GET")
    return { config: await websiteConfig() };
  if (path[1] === "website" && method === "PATCH") {
    const config = websiteSchema.parse(body),
      old = await websiteConfig();
    await batch([
      stmt(
        "INSERT INTO platform(key,value) VALUES ('website:config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(config)],
      ),
      platformAudit(
        actor,
        "Updated public website",
        "platform",
        "website:config",
        old,
        config,
      ),
    ]);
    return { saved: true };
  }
  if (path[1] === "enquiries" && method === "GET") {
    const page = Math.max(1, Math.min(100000, Number(p.get("page")) || 1));
    const rows = await all(
      "SELECT key,value FROM platform WHERE key LIKE 'website:enquiry:%' ORDER BY key DESC LIMIT 25 OFFSET ?",
      [(Math.floor(page) - 1) * 25],
    );
    return {
      rows: rows.map((r) => ({ ...JSON.parse(r.value), key: r.key })),
      page,
      total: (await one(
        "SELECT COUNT(*) n FROM platform WHERE key LIKE 'website:enquiry:%'",
      ))!.n,
    };
  }
  if (path[1] === "enquiries" && method === "PATCH") {
    const b = body as Record<string, unknown>;
    if (
      typeof b.key !== "string" ||
      !/^website:enquiry:\d{4}-[^:]+T.+:[0-9a-f-]{36}$/.test(b.key) ||
      !["New", "In progress", "Closed"].includes(String(b.status))
    )
      throw new ApiError(
        422,
        "INVALID_INPUT",
        "Choose a valid enquiry and status.",
      );
    const old = await one("SELECT value FROM platform WHERE key=?", [b.key]);
    if (!old) throw new ApiError(404, "NOT_FOUND", "Enquiry not found.");
    const data = {
      ...JSON.parse(old.value),
      status: b.status,
      updatedAt: now(),
    };
    await batch([
      stmt("UPDATE platform SET value=? WHERE key=?", [
        JSON.stringify(data),
        b.key,
      ]),
      platformAudit(
        actor,
        "Updated enquiry status",
        "platform",
        b.key,
        { status: JSON.parse(old.value).status },
        { status: b.status },
      ),
    ]);
    return { saved: true };
  }
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not supported.");
}
export async function websitePublic(
  request: Request,
  path: string[],
  method: string,
  requestId: string,
) {
  if (path.join("/") !== "website/enquiries" || method !== "POST") return null;
  csrf(request);
  await rateLimit(
    request,
    "website:" + (request.headers.get("cf-connecting-ip") || "unknown"),
    5,
  );
  const d = enquirySchema.parse(await readBody(request));
  const hash = await sha256(JSON.stringify({ ...d, id: undefined }));
  const key = "website:enquiry-id:" + d.id;
  const previous = await one("SELECT value FROM platform WHERE key=?", [key]);
  if (previous) {
    if (previous.value !== hash)
      throw new ApiError(
        409,
        "REQUEST_CONFLICT",
        "This request reference was already used. Reload the form.",
      );
    return ok({ received: true, reference: d.id }, requestId);
  }
  const timestamp = now();
  try {
    await batch([
      stmt("INSERT INTO platform(key,value) VALUES (?,?)", [key, hash]),
      stmt("INSERT INTO platform(key,value) VALUES (?,?)", [
        "website:enquiry:" + timestamp + ":" + d.id,
        JSON.stringify({ ...d, status: "New", createdAt: timestamp }),
      ]),
    ]);
  } catch (error) {
    const saved = await one("SELECT value FROM platform WHERE key=?", [key]);
    if (saved?.value !== hash) throw error;
  }
  return ok({ received: true, reference: d.id }, requestId);
}
