import { holidaysOn } from "./holidays";
import { dateField } from "./catalog";
import { z } from "zod";
import {
  today,
  all,
  batch,
  insert,
  now,
  one,
  Row,
  stamps,
  stmt,
  uuid,
} from "./db";
import { Actor, ApiError, audit, own, permit } from "./security";
import {
  clock,
  generateTimetable,
  minute,
  ScheduledSlot,
  SchedulingError,
  validateSlots,
} from "../lib/timetable";
import { scheduleNotifications } from "./notifications";
export { generateTimetable, validateSlots } from "../lib/timetable";
const scopeYear = async (actor: Actor, id: string) =>
  own(actor, "academic_years", id);
export async function teachingSection(
  actor: Actor,
  id: string,
  yearId: string,
) {
  const section = await own(actor, "sections", id);
  if (section.academic_year_id !== yearId)
    throw new ApiError(
      422,
      "SECTION_YEAR",
      "Choose a section in this academic year.",
    );
  if (
    actor.role === "TEACHER" &&
    actor.sectionId !== id &&
    !(await one(
      "SELECT id FROM teaching_assignments WHERE institution_id=? AND teacher_id=? AND section_id=? AND academic_year_id=?",
      [actor.institutionId, actor.userId, id, yearId],
    ))
  )
    throw new ApiError(404, "NOT_FOUND", "Assigned section not found.");
  return section;
}
async function openYear(actor: Actor, id: string) {
  const year = await scopeYear(actor, id);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(409, "YEAR_CLOSED", "This academic year is closed.");
  return year;
}
function scheduled(fn: () => ScheduledSlot[]) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof SchedulingError)
      throw new ApiError(422, "TIMETABLE_CONFLICT", e.message);
    throw e;
  }
}
export async function teachingSetup(
  actor: Actor,
  year: string,
  permission: "timetable.view" | "attendance.view" = "timetable.view",
) {
  permit(actor, permission);
  await scopeYear(actor, year);
  const assignments = await all(
    "SELECT a.*,s.name subject_name,sec.name section_name,c.name class_name,u.name teacher_name FROM teaching_assignments a JOIN teaching_subjects s ON s.id=a.subject_id AND s.institution_id=a.institution_id JOIN sections sec ON sec.id=a.section_id AND sec.institution_id=a.institution_id JOIN classes c ON c.id=sec.class_id JOIN users u ON u.id=a.teacher_id WHERE a.institution_id=? AND a.academic_year_id=?" +
      (actor.role === "TEACHER"
        ? " AND (a.teacher_id=? OR a.section_id=?)"
        : "") +
      " ORDER BY c.sort_order,sec.name,s.name LIMIT 500",
    [
      actor.institutionId,
      year,
      ...(actor.role === "TEACHER"
        ? [actor.userId, actor.sectionId || ""]
        : []),
    ],
  );
  return {
    assignments,
    subjects: await all(
      "SELECT id,name,code FROM teaching_subjects WHERE institution_id=? ORDER BY name LIMIT 500",
      [actor.institutionId],
    ),
    teachers:
      actor.role === "TEACHER"
        ? []
        : await all(
            "SELECT m.user_id id,COALESCE(NULLIF(m.display_name,''),u.name) name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.active=1 AND m.role='TEACHER' ORDER BY u.name LIMIT 500",
            [actor.institutionId],
          ),
    sections: await all(
      "SELECT sec.id,sec.name,c.name class_name FROM sections sec JOIN classes c ON c.id=sec.class_id WHERE sec.institution_id=? AND sec.academic_year_id=?" +
        (actor.role === "TEACHER"
          ? " AND (sec.id=? OR EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.section_id=sec.id AND a.institution_id=sec.institution_id AND a.teacher_id=?))"
          : ""),
      [
        actor.institutionId,
        year,
        ...(actor.role === "TEACHER"
          ? [actor.sectionId || "", actor.userId]
          : []),
      ],
    ),
  };
}
export async function addTeachingSubject(actor: Actor, input: unknown) {
  permit(actor, "timetable.manage");
  const d = z
      .object({
        name: z.string().trim().min(2).max(100),
        code: z.string().trim().min(1).max(20),
      })
      .parse(input),
    id = uuid();
  await batch([
    insert("teaching_subjects", {
      id,
      institution_id: actor.institutionId,
      name: d.name,
      code: d.code.toUpperCase(),
      ...stamps(actor.userId),
    }),
    audit(actor, "Created teaching subject", "teaching_subjects", id, null, d),
  ]);
  return { id };
}
export async function addTeachingAssignment(actor: Actor, input: unknown) {
  permit(actor, "timetable.manage");
  const d = z
    .object({
      yearId: z.string(),
      sectionId: z.string(),
      subjectId: z.string(),
      teacherId: z.string(),
      periods: z.number().int().min(1).max(20),
      room: z.string().trim().min(1).max(80),
    })
    .parse(input);
  await openYear(actor, d.yearId);
  await teachingSection(actor, d.sectionId, d.yearId);
  await own(actor, "teaching_subjects", d.subjectId);
  if (
    !(await one(
      "SELECT id FROM memberships WHERE institution_id=? AND user_id=? AND role='TEACHER' AND active=1",
      [actor.institutionId, d.teacherId],
    ))
  )
    throw new ApiError(
      422,
      "TEACHER_REQUIRED",
      "Choose an active institution teacher.",
    );
  const id = uuid();
  await batch([
    insert("teaching_assignments", {
      id,
      institution_id: actor.institutionId,
      academic_year_id: d.yearId,
      section_id: d.sectionId,
      subject_id: d.subjectId,
      teacher_id: d.teacherId,
      periods_per_week: d.periods,
      room: d.room.toLowerCase(),
      ...stamps(actor.userId),
    }),
    audit(
      actor,
      "Assigned teacher and subject",
      "teaching_assignments",
      id,
      null,
      d,
    ),
  ]);
  return { id };
}
export async function timetableList(actor: Actor, year: string, page: number) {
  permit(actor, "timetable.view");
  await scopeYear(actor, year);
  const where =
    "institution_id=? AND academic_year_id=?" +
    (actor.role === "TEACHER" ? " AND status='Published'" : "");
  return {
    rows: await all(
      `SELECT * FROM timetables WHERE ${where} ORDER BY created_at DESC LIMIT 20 OFFSET ?`,
      [actor.institutionId, year, (page - 1) * 20],
    ),
    total: (await one(`SELECT COUNT(*) n FROM timetables WHERE ${where}`, [
      actor.institutionId,
      year,
    ]))!.n,
  };
}
export async function timetableDetail(actor: Actor, id: string, date?: string) {
  permit(actor, "timetable.view");
  const timetable = await own(actor, "timetables", id);
  if (actor.role === "TEACHER" && timetable.status !== "Published")
    throw new ApiError(404, "NOT_FOUND", "Published timetable not found.");
  const slots = await all(
    "SELECT x.*,a.teacher_id,a.section_id,a.subject_id,s.name subject_name,u.name teacher_name,sec.name section_name,c.name class_name FROM timetable_slots x JOIN teaching_assignments a ON a.id=x.assignment_id AND a.institution_id=x.institution_id JOIN teaching_subjects s ON s.id=a.subject_id JOIN users u ON u.id=a.teacher_id JOIN sections sec ON sec.id=a.section_id JOIN classes c ON c.id=sec.class_id WHERE x.institution_id=? AND x.timetable_id=?" +
      (actor.role === "TEACHER"
        ? " AND (a.teacher_id=? OR a.section_id=?)"
        : "") +
      " ORDER BY x.weekday,x.start_minute",
    [
      actor.institutionId,
      id,
      ...(actor.role === "TEACHER"
        ? [actor.userId, actor.sectionId || ""]
        : []),
    ],
  );
  const localDate = dateField.parse(date || today());
  const holidays = await holidaysOn(actor.institutionId, localDate),
    weekday = new Date(localDate + "T00:00:00Z").getUTCDay() || 7;
  return {
    timetable,
    slots,
    localDate,
    holidays,
    required: holidays.length === 0,
    expectedSlots:
      timetable.status !== "Published" || holidays.length
        ? []
        : slots.filter((s) => s.weekday === weekday),
  };
}
const slotInsert = (actor: Actor, id: string, s: ScheduledSlot) =>
  insert("timetable_slots", {
    id: uuid(),
    institution_id: actor.institutionId,
    timetable_id: id,
    assignment_id: s.assignmentId,
    weekday: s.weekday,
    start_minute: s.start,
    end_minute: s.end,
    room: s.room,
    ...stamps(actor.userId),
  });
async function loads(actor: Actor, year: string) {
  return all(
    "SELECT * FROM teaching_assignments WHERE institution_id=? AND academic_year_id=? ORDER BY id LIMIT 101",
    [actor.institutionId, year],
  );
}
export async function generateDraft(actor: Actor, input: unknown) {
  permit(actor, "timetable.manage");
  const d = z
    .object({
      name: z.string().trim().min(3).max(100),
      yearId: z.string(),
      days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      periods: z
        .array(z.object({ start: z.string(), end: z.string() }))
        .min(1)
        .max(12),
    })
    .parse(input);
  await openYear(actor, d.yearId);
  const assignments = await loads(actor, d.yearId);
  let periods;
  try {
    periods = d.periods.map((p) => ({
      start: minute(p.start),
      end: minute(p.end),
    }));
  } catch (e) {
    throw new ApiError(422, "INVALID_TIME", (e as Error).message);
  }
  const slots = scheduled(() =>
      generateTimetable(
        assignments.map((a) => ({
          id: a.id,
          teacherId: a.teacher_id,
          sectionId: a.section_id,
          room: a.room,
          periods: a.periods_per_week,
        })),
        d.days,
        periods,
      ),
    ),
    id = uuid();
  await batch([
    insert("timetables", {
      id,
      institution_id: actor.institutionId,
      academic_year_id: d.yearId,
      name: d.name,
      status: "Draft",
      version: 1,
      ...stamps(actor.userId),
    }),
    ...slots.map((s) => slotInsert(actor, id, s)),
    audit(actor, "Generated draft timetable", "timetables", id, null, {
      ...d,
      lessons: slots.length,
    }),
  ]);
  return { id, lessons: slots.length };
}
export async function saveDraft(actor: Actor, id: string, input: unknown) {
  permit(actor, "timetable.manage");
  const timetable = await own(actor, "timetables", id);
  await openYear(actor, timetable.academic_year_id);
  if (timetable.status !== "Draft")
    throw new ApiError(409, "TIMETABLE_FROZEN", "Only drafts can be adjusted.");
  const d = z
    .object({
      version: z.number().int().min(1),
      slots: z
        .array(
          z.object({
            assignmentId: z.string(),
            weekday: z.number().int().min(1).max(7),
            start: z.string(),
            end: z.string(),
            room: z.string().trim().min(1).max(80),
          }),
        )
        .min(1)
        .max(300),
    })
    .parse(input);
  if (timetable.version !== d.version)
    throw new ApiError(
      409,
      "TIMETABLE_STALE",
      "The draft changed. Reload before saving.",
    );
  const assignments = await loads(actor, timetable.academic_year_id);
  const slots = scheduled(() =>
    d.slots.map((s) => {
      const a = assignments.find((a) => a.id === s.assignmentId);
      if (!a)
        throw new SchedulingError(
          "Assignment does not belong to this academic year.",
        );
      return {
        ...s,
        room: s.room.toLowerCase(),
        teacherId: a.teacher_id,
        sectionId: a.section_id,
        start: minute(s.start),
        end: minute(s.end),
      };
    }),
  );
  scheduled(() => {
    validateSlots(slots);
    return slots;
  });
  for (const a of assignments)
    if (
      slots.filter((s) => s.assignmentId === a.id).length !== a.periods_per_week
    )
      throw new ApiError(
        422,
        "TEACHING_LOAD",
        "Keep the required weekly periods for every assignment.",
      );
  await batch([
    stmt(
      "UPDATE timetables SET version=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=?",
      [d.version + 1, now(), actor.userId, id, actor.institutionId],
    ),
    stmt(
      "DELETE FROM timetable_slots WHERE institution_id=? AND timetable_id=?",
      [actor.institutionId, id],
    ),
    ...slots.map((s) => slotInsert(actor, id, s)),
    audit(
      actor,
      "Adjusted draft timetable",
      "timetables",
      id,
      { version: d.version },
      { version: d.version + 1, slots: d.slots },
    ),
  ]);
  return { version: d.version + 1 };
}
export async function publishTimetable(
  actor: Actor,
  id: string,
  input: unknown,
) {
  permit(actor, "timetable.manage");
  const d = z.object({ version: z.number().int().min(1) }).parse(input),
    t = await own(actor, "timetables", id);
  await openYear(actor, t.academic_year_id);
  if (t.status !== "Draft" || t.version !== d.version)
    throw new ApiError(
      409,
      "TIMETABLE_STALE",
      "Reload this draft before publishing.",
    );
  const detail = await timetableDetail(actor, id);
  scheduled(() => {
    validateSlots(
      detail.slots.map((s) => ({
        assignmentId: s.assignment_id,
        teacherId: s.teacher_id,
        sectionId: s.section_id,
        weekday: s.weekday,
        start: s.start_minute,
        end: s.end_minute,
        room: s.room,
      })),
    );
    return [];
  });
  if (!detail.slots.length)
    throw new ApiError(
      422,
      "EMPTY_TIMETABLE",
      "Generate lessons before publishing.",
    );
  const assignments = await loads(actor, t.academic_year_id);
  for (const a of assignments) {
    if (
      detail.slots.filter((s) => s.assignment_id === a.id).length !==
        a.periods_per_week ||
      !(await one(
        "SELECT id FROM memberships WHERE institution_id=? AND user_id=? AND active=1 AND role='TEACHER'",
        [actor.institutionId, a.teacher_id],
      ))
    )
      throw new ApiError(
        422,
        "TEACHING_LOAD",
        "Recheck active teachers and weekly lesson counts before publishing.",
      );
  }
  const stamp = now();
  await batch([
    stmt(
      "UPDATE timetables SET status='Archived',version=version+1,updated_at=?,updated_by=? WHERE institution_id=? AND academic_year_id=? AND status='Published'",
      [stamp, actor.userId, actor.institutionId, t.academic_year_id],
    ),
    stmt(
      "UPDATE timetables SET status='Published',version=?,published_at=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
      [d.version + 1, stamp, stamp, actor.userId, actor.institutionId, id],
    ),
    stmt(
      "INSERT OR IGNORE INTO notifications(id,institution_id,academic_year_id,student_id,parent_id,recipient,channel,message,status,metadata,created_at,updated_at,created_by,updated_by) SELECT ?||p.id,p.institution_id,?,MIN(e.student_id),p.id,p.email,'Email',?,'Queued','{\"kind\":\"timetable\"}',?,?,?,? FROM parents p JOIN student_parents sp ON sp.parent_id=p.id AND sp.institution_id=p.institution_id JOIN enrollments e ON e.student_id=sp.student_id AND e.institution_id=p.institution_id WHERE p.institution_id=? AND e.academic_year_id=? AND p.email<>'' AND EXISTS(SELECT 1 FROM provider_configs pc WHERE pc.institution_id=p.institution_id AND pc.provider='Email') GROUP BY p.id",
      [
        "timetable:" + id + ":",
        t.academic_year_id,
        "A new class timetable has been published. Open your existing institution student/parent link to view it.",
        stamp,
        stamp,
        actor.userId,
        actor.userId,
        actor.institutionId,
        t.academic_year_id,
      ],
    ),
    audit(
      actor,
      "Published timetable and queued portal announcement",
      "timetables",
      id,
      { status: "Draft", version: d.version },
      { status: "Published", version: d.version + 1 },
    ),
  ]);
  scheduleNotifications(actor);
  return { published: true, version: d.version + 1 };
}
export async function studentPublishedTimetable(
  actor: Actor,
  studentId: string,
  yearId: string,
) {
  const enrollment = await one(
    "SELECT section_id FROM enrollments WHERE institution_id=? AND student_id=? AND academic_year_id=?",
    [actor.institutionId, studentId, yearId],
  );
  if (!enrollment) return [];
  return all(
    "SELECT x.weekday,x.start_minute,x.end_minute,x.room,s.name subject_name,u.name teacher_name,t.published_at FROM timetable_slots x JOIN timetables t ON t.id=x.timetable_id AND t.institution_id=x.institution_id JOIN teaching_assignments a ON a.id=x.assignment_id AND a.institution_id=x.institution_id JOIN teaching_subjects s ON s.id=a.subject_id JOIN users u ON u.id=a.teacher_id WHERE x.institution_id=? AND t.academic_year_id=? AND t.status='Published' AND a.section_id=? ORDER BY x.weekday,x.start_minute LIMIT 100",
    [actor.institutionId, yearId, enrollment.section_id],
  );
}
