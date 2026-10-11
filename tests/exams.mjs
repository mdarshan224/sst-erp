import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const secret = randomBytes(32).toString("hex"),
  tenant = "70a45679-cbbd-48aa-a126-34c73d631853",
  owner = "tejomaya@mvdt.in";
let cookie = "",
  checks = 0,
  delivered = false,
  deliveryStarted = false;
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "refactor" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (request) => {
    if (new URL(request.url).hostname === "notify.example.test") {
      deliveryStarted = true;
      await new Promise((r) => setTimeout(r, 1500));
      delivered = true;
      return Response.json({ id: "mock-delivered" });
    }
    throw new Error("Unexpected outbound request " + request.url);
  },
});
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = owner,
    method = "GET",
    body,
    status = 200,
    extra = {},
    raw = false,
    tenantId = tenant,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      "x-institution-id": tenantId,
      ...(cookie && email === owner ? { cookie } : {}),
      ...(body
        ? { "Content-Type": "application/json", origin: "https://campus.test" }
        : {}),
      ...(method === "POST" &&
      /^(payments|fees|invoices|refunds|cash)(\/|$)/.test(path)
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return req(path, { email, method, body, status, raw, tenantId, extra });
  }
  if (raw) {
    if (status !== null) assert.equal(response.status, status, path);
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  await req("session");
  const support = await req("platform/institutions/" + tenant + "/support", {
    method: "POST",
    body: { reason: "Architecture regression checks" },
    raw: true,
  });
  cookie = support.headers.get("set-cookie").split(";")[0];
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    students = await req("students?year=" + year),
    student = students.rows[0].id;

  const before = await db
    .prepare(
      "SELECT SUM(debit_paise)-SUM(credit_paise) balance,COUNT(*) n FROM ledger_entries",
    )
    .first();
  const policy = {
    bands: [
      { minimum: 80, grade: "A" },
      { minimum: 50, grade: "B" },
      { minimum: 0, grade: "C" },
    ],
    qualitative: ["Emerging", "Secure"],
  };
  const eligible = await db
    .prepare(
      "SELECT e.*,c.level FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN classes c ON c.id=s.class_id WHERE e.institution_id=?",
    )
    .bind(tenant)
    .all();
  for (const level of ["Pre-Primary", "PU College"]) {
    const section = boot.sections.find(
      (s) => boot.classes.find((c) => c.id === s.class_id)?.level === level,
    );
    assert.ok(section, level);
    await req("students", {
      method: "POST",
      body: {
        name: level + " Test Candidate",
        admissionNumber: randomUUID(),
        yearId: year,
        sectionId: section.id,
        parentName: "Guardian",
        mobile: "9876543210",
      },
    });
  }
  const extraEnrollments = await db
    .prepare(
      "SELECT e.*,c.level FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN classes c ON c.id=s.class_id WHERE e.institution_id=?",
    )
    .bind(tenant)
    .all();
  eligible.results = extraEnrollments.results;
  async function setup(tier, kind, competitiveExam) {
    const level = {
        Nursery: "Pre-Primary",
        School: "School",
        PUC: "PU College",
      }[tier],
      enrollment = eligible.results.find((e) => e.level === level);
    assert.ok(enrollment, level);
    const exam = await req("exams", {
      method: "POST",
      body: {
        name: tier + " assessment",
        yearId: enrollment.academic_year_id,
        sectionId: enrollment.section_id,
        board: tier === "PUC" ? "PUC" : "State Board",
        tier,
        kind,
        competitiveExam,
        policy,
        policyReference: "Approved institutional policy version 1",
        approved: true,
      },
    });
    const subject = await req(`exams/${exam.id}/subjects`, {
      method: "POST",
      body: {
        name: "Assessment",
        code: "AS1",
        assessment:
          tier === "Nursery"
            ? "Assignment"
            : kind === "Mock"
              ? "Mock"
              : "Theory",
        min: kind === "Mock" ? "-20" : "0",
        max: "100",
        pass: "35",
        date: "2026-11-01",
        start: "09:00",
        end: "10:00",
      },
    });
    await req(`exams/${exam.id}/register`, {
      method: "POST",
      body: { studentIds: [enrollment.student_id], subjectIds: [subject.id] },
    });
    await req(`exams/${exam.id}/status`, {
      method: "POST",
      body: { status: "Scheduled" },
    });
    const detail = await req(`exams/${exam.id}`);
    return { exam, subject, reg: detail.roster[0] };
  }
  const school = await setup("School", "Formative");
  checks++;
  console.log(
    "PASS exam creation, subject scheduling and enrollment registration",
  );
  const path = `exams/${school.exam.id}`;
  await req(path + "/status", {
    method: "POST",
    body: { status: "Published" },
    status: 422,
  });
  checks++;
  console.log("PASS incomplete results cannot publish");
  const result = {
    registrationId: school.reg.id,
    subjectId: school.subject.id,
    score: "85.25",
    version: 0,
  };
  await req(path + "/results", {
    method: "POST",
    body: { rows: [{ ...result, score: "garbage" }] },
    status: 422,
  });
  await req(path + "/results", {
    method: "POST",
    body: { rows: [{ ...result, score: "100.01" }] },
    status: 422,
  });
  checks++;
  console.log("PASS strict decimal input and score limits");
  await req(path + "/results", { method: "POST", body: { rows: [result] } });
  const d = await req(path);
  check("configured internal grade uses exact mark units", () => {
    assert.equal(d.results[0].score_units, 8525);
    assert.equal(d.results[0].grade, "A");
  });
  await req(path + "/results", {
    method: "POST",
    body: { rows: [result] },
    status: 409,
  });
  checks++;
  console.log("PASS stale edits rejected");
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE exam_results SET score_units=10001,version=version+1 WHERE registration_id=?",
        )
        .bind(school.reg.id)
        .run(),
    /EXAM_RESULT_SCOPE/,
  );
  checks++;
  console.log("PASS database rejects invalid marks even on direct update");
  const card = await req(path + "/admit", {
    method: "POST",
    body: { registrationId: school.reg.id },
  });
  check("real QR embeds canonical verification URL", () => {
    assert.ok(card.qrDataUrl.startsWith("data:image/png;base64,"));
    assert.ok(
      card.verificationUrl.startsWith(
        "https://erp.sohansoft.in/exam-verification/",
      ),
    );
  });
  const token = card.verificationUrl.split("/").pop();
  const verified = await req("exams/verify/" + token, { email: "" });
  check(
    "signed verification works publicly without student disclosures",
    () => {
      assert.equal(verified.valid, true);
      assert.equal(verified.student, undefined);
      assert.equal(verified.admissionNumber, undefined);
    },
  );
  await req("exams/verify/" + token.slice(0, -1) + "x", {
    email: "",
    status: 404,
  });
  checks++;
  console.log("PASS altered signed QR rejected");
  await req(path + "/revoke", { method: "POST", body: { cardId: card.id } });
  await req("exams/verify/" + token, { email: "", status: 404 });
  checks++;
  console.log("PASS revoked QR rejected");
  await req(path + "/status", {
    method: "POST",
    body: { status: "Published" },
  });
  await req(path + "/results", {
    method: "POST",
    body: { rows: [{ ...result, version: 1 }] },
    status: 409,
  });
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE exam_results SET score_units=5000,version=version+1 WHERE registration_id=?",
        )
        .bind(school.reg.id)
        .run(),
    /EXAM_RESULT_SCOPE|EXAM_RESULT_FROZEN/,
  );
  checks++;
  console.log("PASS published marks frozen in API and database");
  const nursery = await setup("Nursery", "Activity");
  await req(`exams/${nursery.exam.id}/results`, {
    method: "POST",
    body: {
      rows: [
        {
          registrationId: nursery.reg.id,
          subjectId: nursery.subject.id,
          qualitative: "Secure",
          assignmentStatus: "Reviewed",
          notes: "Activity demonstrated independently",
          version: 0,
        },
      ],
    },
  });
  const nd = await req(`exams/${nursery.exam.id}`);
  check(
    "nursery qualitative assessment and assignment tracking persisted",
    () => {
      assert.equal(nd.results[0].grade, "Secure");
      assert.equal(nd.results[0].assignment_status, "Reviewed");
      assert.equal(nd.results[0].score_units, null);
    },
  );
  const mock = await setup("PUC", "Mock", "NEET");
  await req(`exams/${mock.exam.id}/results`, {
    method: "POST",
    body: {
      rows: [
        {
          registrationId: mock.reg.id,
          subjectId: mock.subject.id,
          score: "-5.50",
          version: 0,
        },
      ],
    },
  });
  const md = await req(`exams/${mock.exam.id}`);
  check(
    "PUC mock permits configured negative marking and cohort percentile",
    () => {
      assert.equal(md.results[0].score_units, -550);
      assert.equal(md.roster[0].cohortPercentile, "100.0000000");
      assert.equal(md.cohortSize, 1);
    },
  );
  await req(path, { tenantId: randomUUID(), status: 404 });
  checks++;
  console.log("PASS foreign institution cannot access exams by ID");
  const second = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Exam Isolation School",
      institutionCode: "EX-ISO",
      institutionType: "School",
      adminName: "Exam Admin",
      adminEmail: "exam-admin@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
  });
  await req(`campus/${second.slug}/bootstrap`, {
    email: "exam-admin@example.test",
    tenantId: second.id,
  });
  for (const endpoint of ["", "/candidates"])
    await req(`campus/${second.slug}/${path}${endpoint}`, {
      email: "exam-admin@example.test",
      tenantId: second.id,
      status: 404,
    });
  await req(`campus/${second.slug}/${path}/admit`, {
    email: "exam-admin@example.test",
    tenantId: second.id,
    method: "POST",
    body: { registrationId: school.reg.id },
    status: 404,
  });
  checks++;
  console.log(
    "PASS real second-tenant admin cannot read another tenant's exams, candidates or admit cards",
  );
  const schoolEnrollment = eligible.results.find((e) => e.level === "School");
  await req("users/invite", {
    method: "POST",
    body: {
      email: "exam-teacher@example.test",
      fullName: "Exam Teacher",
      role: "TEACHER",
      sectionId: schoolEnrollment.section_id,
    },
  });
  await req("bootstrap", { email: "exam-teacher@example.test" });
  await req(path, { email: "exam-teacher@example.test" });
  await req(path + "/results", {
    email: "exam-teacher@example.test",
    method: "POST",
    body: { rows: [result] },
    status: 409,
  });
  await req(`exams/${nursery.exam.id}`, {
    email: "exam-teacher@example.test",
    status: 404,
  });
  checks++;
  console.log("PASS teacher exam visibility is restricted to assigned section");
  const board = await setup("School", "Board");
  const br = {
    registrationId: board.reg.id,
    subjectId: board.subject.id,
    score: "85",
    officialGrade: "B1",
    version: 0,
  };
  await req(`exams/${board.exam.id}/results`, {
    email: "exam-teacher@example.test",
    method: "POST",
    body: { rows: [br] },
    status: 403,
  });
  checks++;
  console.log("PASS teacher cannot grade unassigned subjects");
  await req(`exams/${board.exam.id}/results`, {
    method: "POST",
    body: { rows: [br] },
  });
  const bd = await req(`exams/${board.exam.id}`);
  check(
    "official board grade is retained independently of internal grade bands",
    () => assert.equal(bd.results[0].grade, "B1"),
  );
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE exam_registrations SET institution_id=? WHERE id=?")
        .bind(second.id, board.reg.id)
        .run(),
    /EXAM_REGISTRATION_IMMUTABLE/,
  );
  checks++;
  console.log("PASS database prevents moving registrations across tenants");
  const after = await db
    .prepare(
      "SELECT SUM(debit_paise)-SUM(credit_paise) balance,COUNT(*) n FROM ledger_entries",
    )
    .first();
  check("existing fee history preserved", () =>
    assert.deepEqual(after, before),
  );
  console.log(`${checks} examination checks passed`);
} finally {
  await mf.dispose();
}
