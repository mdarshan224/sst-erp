import { holidaysOn } from "./holidays";
import { z } from "zod";
import { all, batch, now, one, stamps, stmt, uuid } from "./db";
import { Actor, ApiError, audit, own, permit } from "./security";
import { teachingSection } from "./timetable";
import { dateField } from "./catalog";
const status = z.enum(["Present", "Absent", "Late", "Excused"]);
async function attendanceScope(
  actor: Actor,
  yearId: string,
  sectionId: string,
  date: string,
) {
  const y = await own(actor, "academic_years", yearId);
  await teachingSection(actor, sectionId, yearId);
  dateField.parse(date);
  if (date < y.start_date || date > y.end_date)
    throw new ApiError(
      422,
      "ATTENDANCE_DATE",
      "Select a date within this academic year.",
    );
  return y;
}
export async function attendanceGrid(
  actor: Actor,
  year: string,
  section: string,
  date: string,
  page: number,
) {
  permit(actor, "attendance.view");
  await attendanceScope(actor, year, section, date);
  const holidays = await holidaysOn(actor.institutionId, date);
  return {
    holidays,
    required: holidays.length === 0,
    rows: await all(
      "SELECT e.id enrollment_id,s.id student_id,s.name,s.admission_number,e.roll_number,a.morning,a.afternoon,a.half_day,a.reason,COALESCE(a.version,0) version FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id LEFT JOIN attendance_days a ON a.enrollment_id=e.id AND a.institution_id=e.institution_id AND a.local_date=? WHERE e.institution_id=? AND e.academic_year_id=? AND e.section_id=? AND s.status='Active' ORDER BY s.name LIMIT 50 OFFSET ?",
      [date, actor.institutionId, year, section, (page - 1) * 50],
    ),
    total: (await one(
      "SELECT COUNT(*) n FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND e.section_id=? AND s.status='Active'",
      [actor.institutionId, year, section],
    ))!.n,
    page,
  };
}
export async function saveAttendance(actor: Actor, input: unknown) {
  permit(actor, "attendance.mark");
  const d = z
    .object({
      yearId: z.string(),
      sectionId: z.string(),
      date: dateField,
      rows: z
        .array(
          z.object({
            enrollmentId: z.string(),
            morning: status,
            halfDay: z.boolean().default(false),
            reason: z.string().trim().max(300).default(""),
            version: z.number().int().min(0),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  const year = await attendanceScope(actor, d.yearId, d.sectionId, d.date);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(
      409,
      "YEAR_CLOSED",
      "Attendance cannot change in a closed academic year.",
    );
  if ((await holidaysOn(actor.institutionId, d.date)).length)
    throw new ApiError(
      409,
      "HOLIDAY_NO_ATTENDANCE",
      "Attendance is not required on this holiday.",
    );
  const seen = new Set<string>(),
    queries = [];
  for (const row of d.rows) {
    if (seen.has(row.enrollmentId))
      throw new ApiError(
        422,
        "DUPLICATE_ATTENDANCE",
        "Duplicate student attendance row.",
      );
    seen.add(row.enrollmentId);
    const e = await own(actor, "enrollments", row.enrollmentId);
    if (e.academic_year_id !== d.yearId || e.section_id !== d.sectionId)
      throw new ApiError(
        422,
        "ATTENDANCE_SCOPE",
        "Only students enrolled in this section can be marked.",
      );
    if (
      row.halfDay &&
      (!["Present", "Late"].includes(row.morning) || row.reason.length < 3)
    )
      throw new ApiError(
        422,
        "HALF_DAY_REASON",
        "Early departure needs morning attendance and a reason.",
      );
    const current = await one(
      "SELECT * FROM attendance_days WHERE institution_id=? AND enrollment_id=? AND local_date=?",
      [actor.institutionId, e.id, d.date],
    );
    if ((current?.version || 0) !== row.version)
      throw new ApiError(
        409,
        "ATTENDANCE_STALE",
        "Attendance changed. Reload before saving.",
      );
    const id = current?.id || uuid(),
      afternoon = row.halfDay ? "Absent" : row.morning,
      stamp = now();
    queries.push(
      stmt(
        "INSERT INTO attendance_days(id,institution_id,academic_year_id,section_id,enrollment_id,student_id,local_date,morning,afternoon,half_day,reason,version,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,enrollment_id,local_date) DO UPDATE SET morning=excluded.morning,afternoon=excluded.afternoon,half_day=excluded.half_day,reason=excluded.reason,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
        [
          id,
          actor.institutionId,
          d.yearId,
          d.sectionId,
          e.id,
          e.student_id,
          d.date,
          row.morning,
          afternoon,
          +row.halfDay,
          row.reason,
          row.version + 1,
          current?.created_at || stamp,
          stamp,
          current?.created_by || actor.userId,
          actor.userId,
        ],
      ),
      audit(
        actor,
        "Recorded linked day attendance",
        "attendance_days",
        id,
        current,
        { ...row, date: d.date, afternoon },
      ),
    );
  }
  await batch(queries);
  return { saved: d.rows.length };
}
