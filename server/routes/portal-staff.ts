import { env } from "cloudflare:workers";
import { z } from "zod";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "../db";
import { ApiError, audit, permit, rateLimit } from "../security";
import { managePortalAccount, portalStaffScope } from "../portal-credentials";
import { ok, RouteContext } from "./shared";
export async function portalStaffRoute(ctx: RouteContext) {
  const { actor, path, method, body, requestId } = ctx;
  if (path[0] !== "portal-staff") return null;
  const id = path[1] || "";
  await portalStaffScope(actor, id);
  if (method === "GET" && path.length === 2) {
    const guardians = await all(
      "SELECT par.id,par.guardian_name FROM parents par JOIN student_parents sp ON sp.parent_id=par.id AND sp.institution_id=par.institution_id WHERE sp.institution_id=? AND sp.student_id=?",
      [actor.institutionId, id],
    );
    const accounts = await all(
      "SELECT id,kind,username,student_id,parent_id,must_change,active,credential_expires FROM portal_accounts WHERE institution_id=? AND (student_id=? OR parent_id IN (SELECT parent_id FROM student_parents WHERE institution_id=? AND student_id=?))",
      [actor.institutionId, id, actor.institutionId, id],
    );
    const requests = await all(
      "SELECT id,kind,academic_year_id,notes,status,resolution,created_at FROM portal_service_requests WHERE institution_id=? AND student_id=? ORDER BY created_at DESC LIMIT 50",
      [actor.institutionId, id],
    );
    const announcements = await all(
      "SELECT id,title,status FROM portal_announcements WHERE institution_id=? AND (student_id=? OR student_id IS NULL) ORDER BY created_at DESC LIMIT 50",
      [actor.institutionId, id],
    );
    const documents = await all(
      "SELECT id,title,status FROM portal_documents WHERE institution_id=? AND student_id=? ORDER BY created_at DESC LIMIT 50",
      [actor.institutionId, id],
    );
    const allocations = await all(
      "SELECT a.id,a.kind,a.academic_year_id,a.start_date,COALESCE(t.name,r.name,a.id) label FROM facility_allocations a LEFT JOIN transport_stops t ON t.id=a.stop_id AND t.institution_id=a.institution_id LEFT JOIN hostel_rooms r ON r.id=a.room_id AND r.institution_id=a.institution_id WHERE a.institution_id=? AND a.student_id=? AND a.status='Active'",
      [actor.institutionId, id],
    );
    return ok(
      { accounts, guardians, requests, announcements, documents, allocations },
      requestId,
    );
  }
  if (method === "POST" && path[2] === "account") {
    await rateLimit(actor.request, "portal-staff-account:" + actor.userId, 15);
    return ok(await managePortalAccount(actor, id, body), requestId);
  }
  if (method === "POST" && path[2] === "announcement") {
    const d = z
      .object({
        title: z.string().trim().min(2).max(160),
        body: z.string().trim().min(2).max(5000),
        institutionWide: z.boolean().default(false),
      })
      .parse(body);
    if (d.institutionWide) {
      permit(actor, "academics.manage");
      if (actor.role === "TEACHER")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Teachers may publish to assigned students only.",
        );
    }
    const key = uuid();
    await batch([
      insert("portal_announcements", {
        id: key,
        institution_id: actor.institutionId,
        student_id: d.institutionWide ? null : id,
        title: d.title,
        body: d.body,
        ...stamps(actor.userId),
      }),
      audit(
        actor,
        "Published portal announcement",
        "portal_announcements",
        key,
        null,
        { studentId: id, institutionWide: d.institutionWide },
      ),
    ]);
    return ok({ id: key }, requestId);
  }
  if (method === "POST" && path[2] === "document") {
    const d = z
      .object({
        title: z.string().trim().min(2).max(160),
        mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
        content: z.string().max(1400000),
      })
      .parse(body);
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(d.content), (c) => c.charCodeAt(0));
    } catch {
      throw new ApiError(422, "INVALID_DOCUMENT", "Invalid file encoding.");
    }
    if (
      bytes.length > 1000000 ||
      bytes.length < 8 ||
      (d.mime === "application/pdf" &&
        new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") ||
      (d.mime === "image/png" &&
        ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => v === bytes[i])) ||
      (d.mime === "image/jpeg" &&
        !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))
    )
      throw new ApiError(
        422,
        "INVALID_DOCUMENT",
        "Upload a matching PDF, PNG or JPEG file under 1 MB.",
      );
    if (!env.BUCKET)
      throw new ApiError(
        503,
        "UPLOAD_UNAVAILABLE",
        "Document storage is unavailable.",
      );
    const key = uuid(),
      objectKey = `${actor.institutionId}/portal-documents/${id}/${key}`;
    await env.BUCKET.put(objectKey, bytes, {
      httpMetadata: { contentType: d.mime },
    });
    try {
      await batch([
        insert("portal_documents", {
          id: key,
          institution_id: actor.institutionId,
          student_id: id,
          title: d.title,
          mime: d.mime,
          size: bytes.length,
          object_key: objectKey,
          ...stamps(actor.userId),
        }),
        audit(
          actor,
          "Published student document",
          "portal_documents",
          key,
          null,
          { studentId: id, title: d.title },
        ),
      ]);
    } catch (error) {
      await env.BUCKET.delete(objectKey);
      throw error;
    }
    return ok({ id: key }, requestId);
  }
  if (method === "POST" && path[2] === "archive") {
    const d = z
        .object({ kind: z.enum(["document", "announcement"]), id: z.string() })
        .parse(body),
      table =
        d.kind === "document" ? "portal_documents" : "portal_announcements";
    const row = await one(
      `SELECT id,student_id FROM ${table} WHERE institution_id=? AND (student_id=? OR student_id IS NULL) AND id=?`,
      [actor.institutionId, id, d.id],
    );
    if (!row) throw new ApiError(404, "NOT_FOUND", "Content not found.");
    if (!row.student_id) {
      permit(actor, "academics.manage");
      if (actor.role === "TEACHER")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only administrators can archive school-wide content.",
        );
    }
    await batch([
      stmt(
        `UPDATE ${table} SET status='Archived',updated_at=?,updated_by=? WHERE institution_id=? AND id=?`,
        [now(), actor.userId, actor.institutionId, d.id],
      ),
      audit(actor, "Archived portal content", table, d.id, null, {
        studentId: id,
      }),
    ]);
    return ok({ saved: true }, requestId);
  }
  if (method === "POST" && path[2] === "service") {
    permit(actor, "facilities.manage");
    const d = z
      .object({
        id: z.string(),
        status: z.enum(["Fulfilled", "Declined"]),
        resolution: z.string().trim().min(3).max(1000),
        allocationId: z.string().optional(),
      })
      .parse(body);
    const r = await one(
      "SELECT * FROM portal_service_requests WHERE institution_id=? AND student_id=? AND id=?",
      [actor.institutionId, id, d.id],
    );
    if (!r) throw new ApiError(404, "NOT_FOUND", "Request not found.");
    if (r.status !== "Pending")
      throw new ApiError(
        409,
        "REQUEST_RESOLVED",
        "This request is already resolved.",
      );
    if (
      d.status === "Fulfilled" &&
      !(await one(
        "SELECT id FROM facility_allocations WHERE institution_id=? AND student_id=? AND academic_year_id=? AND kind=? AND id=? AND status='Active'",
        [
          actor.institutionId,
          id,
          r.academic_year_id,
          r.kind,
          d.allocationId || "",
        ],
      ))
    )
      throw new ApiError(
        422,
        "ALLOCATION_REQUIRED",
        "Allocate the requested service in Transport/Hostel first, then enter its allocation ID.",
      );
    const updated = await batch([
      stmt(
        "UPDATE portal_service_requests SET status=?,resolution=?,allocation_id=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status='Pending'",
        [
          d.status,
          d.resolution,
          d.allocationId || null,
          now(),
          actor.userId,
          actor.institutionId,
          d.id,
        ],
      ),
      audit(
        actor,
        "Resolved facility request",
        "portal_service_requests",
        d.id,
        null,
        { status: d.status, allocationId: d.allocationId || null },
      ),
    ]);
    if (!updated[0].meta.changes)
      throw new ApiError(409, "REQUEST_RESOLVED", "Request changed. Refresh.");
    return ok({ saved: true }, requestId);
  }
  throw new ApiError(
    404,
    "NOT_FOUND",
    "Portal administration route not found.",
  );
}
