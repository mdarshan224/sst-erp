import { z } from "zod";
import { dateField } from "./catalog";
import { all, batch, insert, one, stamps, stmt, now, today, uuid } from "./db";
import { Actor, ApiError, audit, permit } from "./security";
import { platformAudit } from "./tenancy";
export async function holidaysOn(institutionId: string, date: string) {
  dateField.parse(date);
  return all<{ id: string; name: string; kind: string }>(
    "SELECT id,name,kind FROM holidays WHERE status='Active' AND (institution_id IS NULL OR institution_id=?) AND start_date<=? AND end_date>=? ORDER BY name LIMIT 100",
    [institutionId, date, date],
  );
}
export async function holidayList(
  actor: Actor,
  p: URLSearchParams,
  platform = false,
) {
  permit(actor, platform ? "system" : "academics.view");
  const from = dateField.parse(p.get("from") || today().slice(0, 7) + "-01"),
    to = dateField.parse(
      p.get("to") ||
        new Date(
          Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10),
    );
  if (to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000)
    throw new ApiError(422, "DATE_RANGE", "Select a range of up to one year.");
  const page = Math.max(1, Math.trunc(Number(p.get("page")) || 1));
  const where = platform
    ? "1=1"
    : "(institution_id IS NULL OR institution_id=?)";
  const values = platform ? [] : [actor.institutionId];
  return {
    rows: await all(
      `SELECT h.*,i.name institution_name FROM holidays h LEFT JOIN institutions i ON i.id=h.institution_id WHERE ${where.replaceAll("institution_id", "h.institution_id")} AND h.status='Active' AND h.start_date<=? AND h.end_date>=? ORDER BY h.start_date,h.name LIMIT 100 OFFSET ?`,
      [...values, to, from, (page - 1) * 100],
    ),
    total: (await one(
      `SELECT COUNT(*) n FROM holidays WHERE ${where} AND status='Active' AND start_date<=? AND end_date>=?`,
      [...values, to, from],
    ))!.n,
    page,
  };
}
export async function saveHoliday(
  actor: Actor,
  input: unknown,
  platform = false,
  holidayId?: string,
) {
  permit(actor, platform ? "system" : "academics.manage");
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      kind: z.enum(["National Holiday", "Term Break", "Local Event"]),
      startDate: dateField,
      endDate: dateField,
      institutionId: z.string().nullable().optional(),
    })
    .parse(input);
  if (
    d.endDate < d.startDate ||
    Date.parse(d.endDate) - Date.parse(d.startDate) > 366 * 86400000
  )
    throw new ApiError(
      422,
      "DATE_RANGE",
      "Select a holiday range of up to one year.",
    );
  const tenant = platform ? d.institutionId || null : actor.institutionId;
  if (
    tenant &&
    !(await one("SELECT id FROM institutions WHERE id=?", [tenant]))
  )
    throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  if (!platform && d.institutionId && d.institutionId !== actor.institutionId)
    throw new ApiError(403, "TENANT_ISOLATION", "Choose your own institution.");
  const existing = holidayId
    ? await one(
        "SELECT * FROM holidays WHERE id=?" +
          (platform ? "" : " AND institution_id=?"),
        platform ? [holidayId] : [holidayId, actor.institutionId],
      )
    : null;
  if (holidayId && !existing)
    throw new ApiError(404, "NOT_FOUND", "Holiday not found.");
  if (existing && existing.status !== "Active")
    throw new ApiError(
      409,
      "HOLIDAY_CANCELLED",
      "Cancelled holidays cannot be edited.",
    );
  if (existing && existing.institution_id !== tenant)
    throw new ApiError(
      422,
      "HOLIDAY_SCOPE",
      "Keep the original institution scope when editing.",
    );
  const id = holidayId || uuid(),
    row = {
      id,
      institution_id: tenant,
      name: d.name,
      kind: d.kind,
      start_date: d.startDate,
      end_date: d.endDate,
      ...stamps(actor.userId),
    };
  await batch([
    existing
      ? stmt(
          "UPDATE holidays SET name=?,kind=?,start_date=?,end_date=?,updated_at=?,updated_by=? WHERE id=? AND status='Active'",
          [d.name, d.kind, d.startDate, d.endDate, now(), actor.userId, id],
        )
      : insert("holidays", row),
    platform
      ? platformAudit(
          actor,
          existing ? "Updated holiday" : "Created holiday",
          "holidays",
          id,
          null,
          { ...d, institutionId: tenant },
          tenant,
        )
      : audit(
          actor,
          existing ? "Updated holiday" : "Created holiday",
          "holidays",
          id,
          null,
          row,
        ),
  ]);
  return { id };
}
export async function cancelHoliday(
  actor: Actor,
  id: string,
  platform = false,
) {
  permit(actor, platform ? "system" : "academics.manage");
  const row = await one(
    "SELECT * FROM holidays WHERE id=?" +
      (platform ? "" : " AND institution_id=?"),
    platform ? [id] : [id, actor.institutionId],
  );
  if (!row) throw new ApiError(404, "NOT_FOUND", "Holiday not found.");
  const { stmt, now } = await import("./db");
  await batch([
    stmt(
      "UPDATE holidays SET status='Cancelled',updated_at=?,updated_by=? WHERE id=?",
      [now(), actor.userId, id],
    ),
    platform
      ? platformAudit(
          actor,
          "Cancelled holiday",
          "holidays",
          id,
          row,
          { status: "Cancelled" },
          row.institution_id,
        )
      : audit(actor, "Cancelled holiday", "holidays", id, row, {
          status: "Cancelled",
        }),
  ]);
  return { cancelled: true };
}
