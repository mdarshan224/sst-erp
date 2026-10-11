import { env } from "cloudflare:workers";
import { z } from "zod";
import QRCode from "qrcode";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import {
  Actor,
  ApiError,
  audit,
  hasPermission,
  hmac,
  own,
  permit,
  sha256,
  constantEqual,
} from "./security";
import { dateField } from "./catalog";
import {
  cohortPercentile,
  internalGrade,
  markUnits,
  timetableConflict,
} from "../lib/exam-grading";
function parseMarks(value: string) {
  try {
    return markUnits(value);
  } catch {
    throw new ApiError(
      422,
      "INVALID_MARKS",
      "Use marks with at most two decimals.",
    );
  }
}
const bands = z
  .array(
    z.object({
      minimum: z.number().int().min(0).max(100),
      grade: z.string().trim().min(1).max(12),
    }),
  )
  .min(1)
  .max(15)
  .refine(
    (a) =>
      a[a.length - 1].minimum === 0 &&
      a.every((b, i) => !i || a[i - 1].minimum > b.minimum),
    "Grade thresholds must descend to zero.",
  );
const policy = z.object({
  bands,
  qualitative: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(10)
    .default(["Emerging", "Developing", "Secure", "Advanced"]),
});
async function scopedExam(actor: Actor, id: string) {
  permit(actor, "exams.view");
  const exam = await own(actor, "exams", id);
  if (actor.role === "TEACHER" && actor.sectionId !== exam.section_id)
    throw new ApiError(404, "NOT_FOUND", "Exam not found.");
  return exam;
}
export async function examList(actor: Actor, year: string, page = 1) {
  permit(actor, "exams.view");
  await own(actor, "academic_years", year);
  const v = [
      actor.institutionId,
      year,
      ...(actor.role === "TEACHER" ? [actor.sectionId || "none"] : []),
    ],
    w =
      "e.institution_id=? AND e.academic_year_id=?" +
      (actor.role === "TEACHER" ? " AND e.section_id=?" : "");
  const rows = await all(
    `SELECT e.*,c.name class_name,s.name section_name,(SELECT COUNT(*) FROM exam_registrations r WHERE r.exam_id=e.id AND r.institution_id=e.institution_id) registered FROM exams e JOIN sections s ON s.id=e.section_id AND s.institution_id=e.institution_id JOIN classes c ON c.id=s.class_id WHERE ${w} ORDER BY e.created_at DESC LIMIT 25 OFFSET ?`,
    [...v, (page - 1) * 25],
  );
  return {
    rows,
    total: (await one(`SELECT COUNT(*) n FROM exams e WHERE ${w}`, v))?.n || 0,
    page,
  };
}
export async function createExam(actor: Actor, input: unknown) {
  permit(actor, "exams.manage");
  const d = z
    .object({
      name: z.string().trim().min(3).max(120),
      yearId: z.string(),
      sectionId: z.string(),
      board: z.enum(["CBSE", "ICSE", "State Board", "PUC", "Other"]),
      tier: z.enum(["Nursery", "School", "PUC"]),
      kind: z.enum(["Formative", "Summative", "Board", "Mock", "Activity"]),
      competitiveExam: z.enum(["KCET", "JEE", "NEET"]).optional(),
      policy,
      policyReference: z.string().trim().min(5).max(300),
      approved: z.literal(true),
    })
    .parse(input);
  const year = await own(actor, "academic_years", d.yearId),
    section = await own(actor, "sections", d.sectionId);
  if (
    section.academic_year_id !== year.id ||
    year.status === "Archived" ||
    year.status === "Closed"
  )
    throw new ApiError(
      422,
      "EXAM_SCOPE",
      "Choose an open academic year and matching section.",
    );
  const cls = await own(actor, "classes", section.class_id);
  if (
    (d.tier === "Nursery" && cls.level !== "Pre-Primary") ||
    (d.tier === "PUC" &&
      !["PU College", "Senior Secondary"].includes(cls.level)) ||
    (d.tier === "School" && cls.level !== "School")
  )
    throw new ApiError(
      422,
      "GRADE_TIER",
      "The grading tier must match the selected class level.",
    );
  if (d.kind === "Mock" && (d.tier !== "PUC" || !d.competitiveExam))
    throw new ApiError(
      422,
      "MOCK_SCOPE",
      "Competitive mocks require a PUC section and exam type.",
    );
  if (d.tier === "Nursery" && d.kind !== "Activity")
    throw new ApiError(
      422,
      "NURSERY_POLICY",
      "Nursery uses qualitative activity assessments.",
    );
  const id = uuid();
  await batch([
    insert("exams", {
      id,
      institution_id: actor.institutionId,
      academic_year_id: d.yearId,
      section_id: d.sectionId,
      name: d.name,
      board: d.board,
      tier: d.tier,
      kind: d.kind,
      competitive_exam: d.kind === "Mock" ? d.competitiveExam : null,
      policy: JSON.stringify(d.policy),
      policy_reference: d.policyReference,
      status: "Draft",
      ...stamps(actor.userId),
    }),
    audit(actor, "Approved exam grading policy", "exams", id, null, {
      board: d.board,
      tier: d.tier,
      policy: d.policy,
      reference: d.policyReference,
    }),
  ]);
  return { id };
}
export async function addSubject(actor: Actor, id: string, input: unknown) {
  permit(actor, "exams.manage");
  const exam = await scopedExam(actor, id);
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      code: z.string().trim().min(1).max(30),
      assessment: z.enum([
        "Formative",
        "Summative",
        "Theory",
        "Practical",
        "Activity",
        "Assignment",
        "Mock",
      ]),
      min: z.string().default("0"),
      max: z.string(),
      pass: z.string().default("0"),
      date: dateField.optional(),
      start: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      end: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      room: z.string().trim().max(100).default(""),
      graderUserId: z.string().optional(),
    })
    .parse(input);
  if (exam.status !== "Draft")
    throw new ApiError(
      409,
      "EXAM_FROZEN",
      "Subjects and schedules are frozen after scheduling.",
    );
  const min = parseMarks(d.min),
    max = parseMarks(d.max),
    pass = parseMarks(d.pass);
  if (
    max <= 0 ||
    min > 0 ||
    pass < 0 ||
    pass > max ||
    (exam.kind !== "Mock" && min !== 0)
  )
    throw new ApiError(
      422,
      "MARK_BOUNDS",
      "Check minimum, maximum and pass marks.",
    );
  if (
    exam.tier === "Nursery" &&
    !["Activity", "Assignment"].includes(d.assessment)
  )
    throw new ApiError(
      422,
      "NURSERY_POLICY",
      "Use activities or assignments for Nursery.",
    );
  if (d.date || d.start || d.end) {
    const year = await own(actor, "academic_years", exam.academic_year_id);
    if (
      !d.date ||
      !d.start ||
      !d.end ||
      d.start >= d.end ||
      d.date < year.start_date ||
      d.date > year.end_date
    )
      throw new ApiError(
        422,
        "EXAM_TIME",
        "Enter a valid date and time range within the academic year.",
      );
  }
  if (
    d.graderUserId &&
    !(await one(
      "SELECT id FROM memberships WHERE institution_id=? AND user_id=? AND active=1 AND (role='INSTITUTION_ADMIN' OR (role='TEACHER' AND section_id=?))",
      [actor.institutionId, d.graderUserId, exam.section_id],
    ))
  )
    throw new ApiError(
      422,
      "GRADER_SCOPE",
      "Assign an active teacher from this section.",
    );
  if (
    await one(
      "SELECT id FROM exam_subjects WHERE institution_id=? AND exam_id=? AND code=?",
      [actor.institutionId, id, d.code],
    )
  )
    throw new ApiError(
      409,
      "SUBJECT_EXISTS",
      "This subject code is already in the exam.",
    );
  const subjectId = uuid();
  await batch([
    insert("exam_subjects", {
      id: subjectId,
      institution_id: actor.institutionId,
      exam_id: id,
      name: d.name,
      code: d.code,
      assessment: d.assessment,
      min_units: min,
      max_units: max,
      pass_units: pass,
      exam_date: d.date || null,
      start_time: d.start || null,
      end_time: d.end || null,
      room: d.room,
      grader_user_id: d.graderUserId || null,
      ...stamps(actor.userId),
    }),
    audit(actor, "Added exam subject and schedule", "exams", id, null, d),
  ]);
  return { id: subjectId };
}
export async function registerStudents(
  actor: Actor,
  id: string,
  input: unknown,
) {
  permit(actor, "exams.manage");
  const exam = await scopedExam(actor, id),
    d = z
      .object({
        studentIds: z.array(z.string()).min(1).max(100),
        subjectIds: z.array(z.string()).min(1).max(40),
      })
      .parse(input);
  if (exam.status !== "Draft")
    throw new ApiError(
      409,
      "EXAM_FROZEN",
      "Register students before scheduling.",
    );
  if (
    new Set(d.studentIds).size !== d.studentIds.length ||
    new Set(d.subjectIds).size !== d.subjectIds.length
  )
    throw new ApiError(
      422,
      "DUPLICATE_SELECTION",
      "Remove duplicate selections.",
    );
  const subjects = await all(
    "SELECT * FROM exam_subjects WHERE institution_id=? AND exam_id=?",
    [actor.institutionId, id],
  );
  const selected = subjects.filter((s) => d.subjectIds.includes(s.id));
  if (
    selected.length !== d.subjectIds.length ||
    timetableConflict(
      selected.map((s) => ({
        exam_date: s.exam_date,
        start_time: s.start_time,
        end_time: s.end_time,
      })),
    )
  )
    throw new ApiError(
      422,
      "SUBJECT_CONFLICT",
      "Select valid subjects without overlapping exam times.",
    );
  const q = [];
  for (const studentId of d.studentIds) {
    if (
      await one(
        "SELECT id FROM exam_registrations WHERE institution_id=? AND exam_id=? AND student_id=?",
        [actor.institutionId, id, studentId],
      )
    )
      throw new ApiError(
        409,
        "ALREADY_REGISTERED",
        "A selected student is already registered.",
      );
    const enrollment = await one(
      "SELECT e.id FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.student_id=? AND e.academic_year_id=? AND e.section_id=? AND s.status='Active'",
      [actor.institutionId, studentId, exam.academic_year_id, exam.section_id],
    );
    if (!enrollment)
      throw new ApiError(
        422,
        "STUDENT_SCOPE",
        "Every student must be active in the exam section and year.",
      );
    q.push(
      insert("exam_registrations", {
        id: uuid(),
        institution_id: actor.institutionId,
        exam_id: id,
        student_id: studentId,
        enrollment_id: enrollment.id,
        subjects: JSON.stringify(d.subjectIds),
        ...stamps(actor.userId),
      }),
    );
  }
  q.push(
    audit(actor, "Registered exam candidates", "exams", id, null, {
      count: d.studentIds.length,
      subjects: d.subjectIds,
    }),
  );
  await batch(q);
  return { registered: d.studentIds.length };
}
export async function examCandidates(actor: Actor, id: string, page: number) {
  permit(actor, "exams.manage");
  const exam = await scopedExam(actor, id),
    v = [actor.institutionId, exam.academic_year_id, exam.section_id, id];
  const where =
    "e.institution_id=? AND e.academic_year_id=? AND e.section_id=? AND s.status='Active' AND NOT EXISTS(SELECT 1 FROM exam_registrations r WHERE r.exam_id=? AND r.student_id=s.id AND r.institution_id=s.institution_id)";
  return {
    rows: await all(
      `SELECT s.id,s.name,s.admission_number FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE ${where} ORDER BY s.name LIMIT 50 OFFSET ?`,
      [...v, (page - 1) * 50],
    ),
    total:
      (
        await one(
          `SELECT COUNT(*) n FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE ${where}`,
          v,
        )
      )?.n || 0,
  };
}
export async function examDetail(actor: Actor, id: string, p: URLSearchParams) {
  const exam = await scopedExam(actor, id),
    page = Math.max(1, Number(p.get("page")) || 1);
  const subjects = await all(
    "SELECT * FROM exam_subjects WHERE institution_id=? AND exam_id=? ORDER BY exam_date,start_time,code",
    [actor.institutionId, id],
  );
  const roster = await all(
    "SELECT r.*,s.name,s.admission_number,e.roll_number,s.photo_key FROM exam_registrations r JOIN students s ON s.id=r.student_id AND s.institution_id=r.institution_id JOIN enrollments e ON e.id=r.enrollment_id AND e.institution_id=r.institution_id WHERE r.institution_id=? AND r.exam_id=? ORDER BY s.name LIMIT 25 OFFSET ?",
    [actor.institutionId, id, (page - 1) * 25],
  );
  const results = await all(
    "SELECT x.* FROM exam_results x JOIN exam_registrations r ON r.id=x.registration_id AND r.institution_id=x.institution_id WHERE x.institution_id=? AND r.exam_id=? AND r.id IN (" +
      (roster.map(() => "?").join(",") || "''") +
      ")",
    [actor.institutionId, id, ...roster.map((r) => r.id)],
  );
  const cohort = await all(
    "SELECT r.id,SUM(x.score_units) total FROM exam_registrations r JOIN exam_results x ON x.registration_id=r.id AND x.institution_id=r.institution_id WHERE r.institution_id=? AND r.exam_id=? GROUP BY r.id HAVING COUNT(*)=json_array_length(r.subjects) AND SUM(x.absent)=0 AND COUNT(x.score_units)=COUNT(*)",
    [actor.institutionId, id],
  );
  const scores = cohort.map((r) => r.total as number),
    gradePolicy = JSON.parse(exam.policy);
  return {
    exam: { ...exam, policy: gradePolicy },
    subjects,
    roster: roster.map((r) => ({
      ...r,
      cohortPercentile:
        exam.kind === "Mock" && cohort.some((c) => c.id === r.id)
          ? cohortPercentile(cohort.find((c) => c.id === r.id)!.total, scores)
          : null,
    })),
    results: results.map((r) => ({
      ...r,
      grade: r.absent
        ? "Absent"
        : exam.tier === "Nursery"
          ? r.qualitative
          : exam.kind === "Board"
            ? r.official_grade || "Not reported"
            : r.score_units === null
              ? "Not graded"
              : internalGrade(
                  r.score_units,
                  subjects.find((s) => s.id === r.subject_id)!.max_units,
                  gradePolicy.bands,
                ),
    })),
    total:
      (
        await one(
          "SELECT COUNT(*) n FROM exam_registrations WHERE institution_id=? AND exam_id=?",
          [actor.institutionId, id],
        )
      )?.n || 0,
    page,
    cohortSize: cohort.length,
    teachers: hasPermission(actor, "exams.manage")
      ? await all(
          "SELECT m.user_id,m.display_name,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.active=1 AND m.role='TEACHER' AND m.section_id=?",
          [actor.institutionId, exam.section_id],
        )
      : [],
  };
}
export async function gradeResults(actor: Actor, id: string, input: unknown) {
  permit(actor, "exams.grade");
  const exam = await scopedExam(actor, id),
    d = z
      .object({
        rows: z
          .array(
            z.object({
              registrationId: z.string(),
              subjectId: z.string(),
              score: z.string().optional(),
              qualitative: z.string().optional(),
              assignmentStatus: z
                .enum([
                  "Not applicable",
                  "Pending",
                  "Submitted",
                  "Reviewed",
                  "Missing",
                ])
                .default("Not applicable"),
              notes: z.string().trim().max(1000).default(""),
              absent: z.boolean().default(false),
              officialGrade: z.string().trim().max(12).optional(),
              version: z.number().int().min(0),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(input);
  if (exam.status !== "Scheduled")
    throw new ApiError(
      409,
      "EXAM_FROZEN",
      "Grade a scheduled exam; published results are locked.",
    );
  const keys = new Set<string>(),
    queries = [];
  for (const row of d.rows) {
    const key = row.registrationId + ":" + row.subjectId;
    if (keys.has(key))
      throw new ApiError(422, "DUPLICATE_RESULT", "Duplicate result row.");
    keys.add(key);
    const reg = await own(actor, "exam_registrations", row.registrationId),
      subject = await own(actor, "exam_subjects", row.subjectId);
    if (
      reg.exam_id !== id ||
      subject.exam_id !== id ||
      !JSON.parse(reg.subjects).includes(row.subjectId)
    )
      throw new ApiError(
        422,
        "RESULT_SCOPE",
        "Grade only the registered subjects.",
      );
    if (actor.role === "TEACHER" && subject.grader_user_id !== actor.userId)
      throw new ApiError(
        403,
        "GRADER_SCOPE",
        "You are not assigned to grade this subject.",
      );
    const score =
      row.absent || exam.tier === "Nursery"
        ? null
        : parseMarks(row.score || "");
    if (
      score !== null &&
      (score < subject.min_units || score > subject.max_units)
    )
      throw new ApiError(
        422,
        "MARK_BOUNDS",
        "Marks are outside the subject limits.",
      );
    if (
      exam.tier === "Nursery" &&
      !row.absent &&
      !JSON.parse(exam.policy).qualitative.includes(row.qualitative)
    )
      throw new ApiError(
        422,
        "QUALITATIVE_REQUIRED",
        "Choose a configured qualitative assessment.",
      );
    const current = await one(
      "SELECT * FROM exam_results WHERE institution_id=? AND registration_id=? AND subject_id=?",
      [actor.institutionId, row.registrationId, row.subjectId],
    );
    if ((current?.version || 0) !== row.version)
      throw new ApiError(
        409,
        "RESULT_CONFLICT",
        "Results changed. Reload before saving.",
      );
    queries.push(
      stmt(
        "INSERT INTO exam_results(id,institution_id,registration_id,subject_id,score_units,qualitative,assignment_status,notes,absent,official_grade,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(registration_id,subject_id) DO UPDATE SET score_units=excluded.score_units,qualitative=excluded.qualitative,assignment_status=excluded.assignment_status,notes=excluded.notes,absent=excluded.absent,official_grade=excluded.official_grade,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
        [
          current?.id || uuid(),
          actor.institutionId,
          row.registrationId,
          row.subjectId,
          score,
          exam.tier === "Nursery" && !row.absent ? row.qualitative : null,
          row.assignmentStatus,
          row.notes,
          +row.absent,
          exam.kind === "Board" ? row.officialGrade || null : null,
          row.version + 1,
          current?.created_at || now(),
          now(),
          current?.created_by || actor.userId,
          actor.userId,
        ],
      ),
      audit(
        actor,
        "Recorded exam assessment",
        "exam_results",
        current?.id || key,
        current,
        { ...row, scoreUnits: score },
      ),
    );
  }
  await batch(queries);
  return { saved: d.rows.length };
}
export async function transitionExam(actor: Actor, id: string, status: string) {
  permit(actor, "exams.manage");
  const exam = await scopedExam(actor, id);
  if (
    !(
      (exam.status === "Draft" && status === "Scheduled") ||
      (exam.status === "Scheduled" && status === "Published") ||
      (exam.status !== "Archived" && status === "Archived")
    )
  )
    throw new ApiError(409, "EXAM_TRANSITION", "Invalid exam transition.");
  if (
    status === "Scheduled" &&
    exam.tier !== "Nursery" &&
    (await one(
      "SELECT id FROM exam_subjects WHERE institution_id=? AND exam_id=? AND exam_date IS NULL LIMIT 1",
      [actor.institutionId, id],
    ))
  )
    throw new ApiError(
      422,
      "TIMETABLE_INCOMPLETE",
      "Complete subject dates and times first.",
    );
  if (
    status === "Scheduled" &&
    !(await one(
      "SELECT id FROM exam_registrations WHERE institution_id=? AND exam_id=? LIMIT 1",
      [actor.institutionId, id],
    ))
  )
    throw new ApiError(422, "NO_CANDIDATES", "Register candidates first.");
  if (
    status === "Published" &&
    (await one(
      "SELECT r.id FROM exam_registrations r,json_each(r.subjects) j WHERE r.institution_id=? AND r.exam_id=? AND NOT EXISTS(SELECT 1 FROM exam_results x WHERE x.institution_id=r.institution_id AND x.registration_id=r.id AND x.subject_id=j.value) LIMIT 1",
      [actor.institutionId, id],
    ))
  )
    throw new ApiError(
      422,
      "RESULTS_INCOMPLETE",
      "Complete all registered assessments before publishing.",
    );
  await batch([
    stmt(
      "UPDATE exams SET status=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=?",
      [status, now(), actor.userId, id, actor.institutionId],
    ),
    audit(
      actor,
      "Changed exam status",
      "exams",
      id,
      { status: exam.status },
      { status },
    ),
  ]);
  return { status };
}
export async function issueAdmitCard(
  actor: Actor,
  id: string,
  registrationId: string,
) {
  const exam = await scopedExam(actor, id),
    reg = await own(actor, "exam_registrations", registrationId);
  if (reg.exam_id !== id || !["Scheduled", "Published"].includes(exam.status))
    throw new ApiError(
      422,
      "ADMIT_UNAVAILABLE",
      "Schedule the exam before issuing admit cards.",
    );
  const student = await own(actor, "students", reg.student_id),
    year = await own(actor, "academic_years", exam.academic_year_id),
    section = await own(actor, "sections", exam.section_id),
    cls = await own(actor, "classes", section.class_id),
    inst = await one("SELECT name,address,slug FROM institutions WHERE id=?", [
      actor.institutionId,
    ]);
  const subjects = (
    await all(
      "SELECT * FROM exam_subjects WHERE institution_id=? AND exam_id=? ORDER BY exam_date,start_time,code",
      [actor.institutionId, id],
    )
  ).filter((s) => JSON.parse(reg.subjects).includes(s.id));
  if (exam.tier !== "Nursery" && subjects.some((s) => !s.exam_date))
    throw new ApiError(
      422,
      "TIMETABLE_INCOMPLETE",
      "Every selected subject needs an examination date and time.",
    );
  const cardId = uuid(),
    expires = new Date(Date.now() + 90 * 86400000).toISOString(),
    nonce = uuid() + uuid(),
    payload =
      cardId +
      "." +
      Math.floor(new Date(expires).getTime() / 1000) +
      "." +
      nonce;
  if (!env.PROVIDER_ENCRYPTION_KEY)
    throw new ApiError(
      503,
      "SIGNING_NOT_CONFIGURED",
      "Document signing is unavailable.",
    );
  const token =
    payload +
    "." +
    (await hmac(env.PROVIDER_ENCRYPTION_KEY, "admit:" + payload));
  const verificationUrl = "https://erp.sohansoft.in/exam-verification/" + token;
  await batch([
    insert("admit_cards", {
      id: cardId,
      institution_id: actor.institutionId,
      registration_id: registrationId,
      token_hash: await sha256(token),
      expires_at: expires,
      ...stamps(actor.userId),
    }),
    audit(actor, "Issued exam admit card", "admit_cards", cardId, null, {
      registrationId,
    }),
  ]);
  return {
    id: cardId,
    cardNumber: cardId.toUpperCase().slice(0, 13),
    institution: inst,
    student: {
      name: student.name,
      admissionNumber: student.admission_number,
      photoUrl: student.photo_key
        ? `/api/campus/${inst!.slug}/exams/${id}/photo/${registrationId}`
        : null,
    },
    className: cls.name,
    section: section.name,
    year: year.name,
    exam: exam.name,
    board: exam.board,
    subjects,
    verificationUrl,
    qrDataUrl: await QRCode.toDataURL(verificationUrl, {
      errorCorrectionLevel: "M",
      width: 220,
      margin: 1,
    }),
    expiresAt: expires,
  };
}
export async function verifyAdmitCard(token: string) {
  const parts = token.split(".");
  if (
    parts.length !== 4 ||
    token.length > 300 ||
    !env.PROVIDER_ENCRYPTION_KEY ||
    !constantEqual(
      parts[3],
      await hmac(
        env.PROVIDER_ENCRYPTION_KEY,
        "admit:" + parts.slice(0, 3).join("."),
      ),
    )
  )
    throw new ApiError(404, "INVALID_CARD", "Admit card is invalid.");
  const row = await one(
    "SELECT a.id,a.expires_at,i.name institution,e.name exam FROM admit_cards a JOIN exam_registrations r ON r.id=a.registration_id AND r.institution_id=a.institution_id JOIN exams e ON e.id=r.exam_id AND e.institution_id=r.institution_id JOIN institutions i ON i.id=a.institution_id WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.expires_at>? AND e.status IN ('Scheduled','Published') AND i.status='Active'",
    [await sha256(token), now()],
  );
  if (!row)
    throw new ApiError(
      404,
      "INVALID_CARD",
      "Admit card is expired or revoked.",
    );
  return {
    valid: true,
    cardNumber: row.id.toUpperCase().slice(0, 13),
    institution: row.institution,
    exam: row.exam,
    expiresAt: row.expires_at,
  };
}
export async function examPhoto(
  actor: Actor,
  id: string,
  registrationId: string,
) {
  await scopedExam(actor, id);
  const r = await own(actor, "exam_registrations", registrationId);
  if (r.exam_id !== id)
    throw new ApiError(404, "NOT_FOUND", "Photo not found.");
  const student = await own(actor, "students", r.student_id),
    file =
      student.photo_key && env.BUCKET
        ? await env.BUCKET.get(student.photo_key)
        : null;
  if (!file) throw new ApiError(404, "NOT_FOUND", "Photo not found.");
  return new Response(file.body, {
    headers: {
      "Content-Type": file.httpMetadata?.contentType || "image/png",
      "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
