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
  deliveryStarted = false,
  domainToken = "",
  cloudflareActive = false;
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
    CLOUDFLARE_API_TOKEN: "mock-cloudflare-token",
    CLOUDFLARE_ZONE_ID: "a".repeat(32),
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (request) => {
    if (new URL(request.url).hostname === "cloudflare-dns.com")
      return Response.json({
        Status: 0,
        Answer: [
          { type: 5, name: "fees.school.invalid", data: "erp.sohansoft.in." },
        ],
      });
    if (new URL(request.url).hostname === "api.cloudflare.com") {
      assert.equal(
        request.headers.get("Authorization"),
        "Bearer mock-cloudflare-token",
      );
      const record = {
        id: "cf-id",
        hostname: "fees.school.invalid",
        status: cloudflareActive ? "active" : "pending",
        ssl: {
          status: cloudflareActive ? "active" : "pending_validation",
          validation_records: [
            {
              txt_name: "_acme-challenge.fees.school.invalid",
              txt_value: "mock-ssl-token",
            },
          ],
        },
        ownership_verification: {
          type: "txt",
          name: "_cf-custom-hostname.fees.school.invalid",
          value: "mock-ownership",
        },
      };
      return Response.json({
        success: true,
        result: new URL(request.url).search ? [] : record,
      });
    }
    if (new URL(request.url).hostname === "notify.example.test") {
      deliveryStarted = true;

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
      "SELECT COUNT(*) n,SUM(debit_paise)-SUM(credit_paise) balance FROM ledger_entries",
    )
    .first();
  const en = (
    await db
      .prepare(
        "SELECT * FROM enrollments WHERE institution_id=? AND academic_year_id=? LIMIT 2",
      )
      .bind(tenant, year)
      .all()
  ).results;
  assert.equal(en.length, 2);
  const teacherEmail = "scheduler-teacher@example.test",
    otherEmail = "other-teacher@example.test";
  for (const [email, section] of [
    [teacherEmail, en[0].section_id],
    [otherEmail, en[1].section_id],
  ]) {
    await req("users/invite", {
      method: "POST",
      body: {
        email,
        fullName: "Scheduling Teacher",
        role: "TEACHER",
        sectionId: section,
      },
    });
    await req("bootstrap", { email });
  }
  const teacher = (
    await db
      .prepare("SELECT id FROM users WHERE email=?")
      .bind(teacherEmail)
      .first()
  ).id;
  const math = await req("teaching/subjects", {
    method: "POST",
    body: { name: "Mathematics", code: "MATH" },
  });
  await req("teaching/subjects", {
    method: "POST",
    body: { name: "Mathematics", code: "MATH" },
    status: 409,
  });
  checks++;
  console.log("PASS teaching subject codes are unique per institution");
  for (const [i, e] of en.entries())
    await req("teaching/assignments", {
      method: "POST",
      body: {
        yearId: year,
        sectionId: e.section_id,
        subjectId: math.id,
        teacherId: teacher,
        periods: 1,
        room: "room " + i,
      },
    });
  await req("timetables/generate", {
    method: "POST",
    body: {
      name: "Impossible timetable",
      yearId: year,
      days: [1],
      periods: [{ start: "09:00", end: "09:45" }],
    },
    status: 422,
  });
  checks++;
  console.log(
    "PASS impossible teacher load returns validation error without partial draft",
  );
  const draft = await req("timetables/generate", {
    method: "POST",
    body: {
      name: "Weekly timetable",
      yearId: year,
      days: [1, 2],
      periods: [{ start: "09:00", end: "09:45" }],
    },
  });
  let detail = await req("timetables/" + draft.id);
  check("generator assigns complete non-overlapping lessons", () => {
    assert.equal(detail.slots.length, 2);
    assert.notEqual(detail.slots[0].weekday, detail.slots[1].weekday);
  });
  const slotData = detail.slots.map((s) => ({
    assignmentId: s.assignment_id,
    weekday: s.weekday,
    start: "09:00",
    end: "09:45",
    room: s.room,
  }));
  await req(`timetables/${draft.id}/slots`, {
    method: "POST",
    body: { version: 1, slots: slotData.map((s) => ({ ...s, weekday: 1 })) },
    status: 422,
  });
  checks++;
  console.log("PASS manual overlap is rejected by backend");
  await req(`timetables/${draft.id}/slots`, {
    method: "POST",
    body: { version: 1, slots: slotData },
  });
  await req(`timetables/${draft.id}/slots`, {
    method: "POST",
    body: { version: 1, slots: slotData },
    status: 409,
  });
  checks++;
  console.log("PASS draft version protects concurrent edits");
  await req(`timetables/${draft.id}`, { email: teacherEmail, status: 404 });
  check("teachers cannot read unapproved drafts", () =>
    assert.equal(true, true),
  );
  const profile = await req(`students/${en[0].student_id}?year=${year}`),
    grant = await req("parent-links", {
      method: "POST",
      body: { parentId: profile.student.parent_id, days: 1 },
    });
  const portal = `parent-access/${grant.token}?student=${en[0].student_id}&year=${year}`;
  const privateDraft = await req(portal, { email: "" });
  check("draft timetable is hidden from private parent links", () =>
    assert.equal(privateDraft.timetable.length, 0),
  );
  await db
    .prepare(
      "UPDATE parents SET email='guardian@example.test' WHERE id=? AND institution_id=?",
    )
    .bind(profile.student.parent_id, tenant)
    .run();
  await req("providers", {
    method: "POST",
    body: {
      provider: "Email",
      mode: "production",
      config: {
        url: "https://notify.example.test/email",
        token: "mock-provider",
      },
    },
  });
  await req(`timetables/${draft.id}/publish`, {
    method: "POST",
    body: { version: 2 },
  });
  await req(`timetables/${draft.id}`, { email: teacherEmail });
  const announced = await db
    .prepare(
      "SELECT COUNT(*) n FROM notifications WHERE institution_id=? AND id LIKE ?",
    )
    .bind(tenant, "timetable:" + draft.id + ":%")
    .first();
  check(
    "publish queues a real guardian announcement for configured delivery",
    () => assert.ok(announced.n > 0),
  );
  const published = await req(portal, { email: "" });
  check(
    "publish broadcasts actual timetable to linked student/parent data",
    () => {
      assert.equal(published.timetable.length, 1);
      assert.equal(published.timetable[0].subject_name, "Mathematics");
    },
  );
  await req(`timetables/${draft.id}/slots`, {
    method: "POST",
    body: { version: 3, slots: slotData },
    status: 409,
  });
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM timetable_slots WHERE timetable_id=?")
        .bind(draft.id)
        .run(),
    /TIMETABLE_FROZEN/,
  );
  checks++;
  console.log("PASS approved timetable is immutable at API and database");
  const attendance = {
    yearId: year,
    sectionId: en[0].section_id,
    date: "2026-10-11",
    rows: [{ enrollmentId: en[0].id, morning: "Present", version: 0 }],
  };
  await req("attendance", {
    email: teacherEmail,
    method: "POST",
    body: attendance,
  });
  let grid = await req(
    `attendance?year=${year}&section=${en[0].section_id}&date=2026-10-11`,
    { email: teacherEmail },
  );
  let row = grid.rows.find((s) => s.enrollment_id === en[0].id);
  check("morning automatically mirrors afternoon", () => {
    assert.equal(row.morning, "Present");
    assert.equal(row.afternoon, "Present");
  });
  await req("attendance", {
    email: teacherEmail,
    method: "POST",
    body: {
      ...attendance,
      rows: [{ ...attendance.rows[0], version: 1, halfDay: true }],
    },
    status: 422,
  });
  checks++;
  console.log("PASS early departure requires a reason");
  await req("attendance", {
    email: teacherEmail,
    method: "POST",
    body: {
      ...attendance,
      rows: [
        {
          ...attendance.rows[0],
          version: 1,
          halfDay: true,
          reason: "Guardian collected early",
        },
      ],
    },
  });
  grid = await req(
    `attendance?year=${year}&section=${en[0].section_id}&date=2026-10-11`,
    { email: teacherEmail },
  );
  row = grid.rows.find((s) => s.enrollment_id === en[0].id);
  check("half-day overrides afternoon without changing morning", () => {
    assert.equal(row.morning, "Present");
    assert.equal(row.afternoon, "Absent");
    assert.equal(row.half_day, 1);
  });
  await req("attendance", {
    email: teacherEmail,
    method: "POST",
    body: attendance,
    status: 409,
  });
  checks++;
  console.log("PASS stale attendance edits are rejected");
  await req(
    `attendance?year=${year}&section=${en[0].section_id}&date=2026-10-11`,
    { email: otherEmail, status: 404 },
  );
  checks++;
  console.log("PASS unassigned teacher cannot read another section");
  for (const level of ["Pre-Primary", "PU College"]) {
    const section = boot.sections.find(
      (s) => boot.classes.find((c) => c.id === s.class_id)?.level === level,
    );
    assert.ok(section);
    const child = await req("students", {
      method: "POST",
      body: {
        name: level + " Attendance Candidate",
        admissionNumber: randomUUID(),
        yearId: year,
        sectionId: section.id,
        parentName: "Test Guardian",
        mobile: "9876543210",
      },
    });
    const enrollment = await db
      .prepare(
        "SELECT id FROM enrollments WHERE institution_id=? AND student_id=? AND academic_year_id=?",
      )
      .bind(tenant, child.id, year)
      .first();
    await req("attendance", {
      method: "POST",
      body: {
        yearId: year,
        sectionId: section.id,
        date: "2026-10-11",
        rows: [{ enrollmentId: enrollment.id, morning: "Present", version: 0 }],
      },
    });
    const row = await db
      .prepare(
        "SELECT morning,afternoon FROM attendance_days WHERE enrollment_id=?",
      )
      .bind(enrollment.id)
      .first();
    check(level + " attendance mirrors both sessions", () =>
      assert.equal(row.afternoon, row.morning),
    );
  }
  const second = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Timetable Isolation School",
      institutionCode: "TT-ISO",
      institutionType: "School",
      adminName: "Test Admin",
      adminEmail: "tt-admin@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
  });
  await req(`campus/${second.slug}/bootstrap`, {
    email: "tt-admin@example.test",
    tenantId: second.id,
  });
  await req(`campus/${second.slug}/timetables/${draft.id}`, {
    email: "tt-admin@example.test",
    tenantId: second.id,
    status: 404,
  });
  await req(
    `campus/${second.slug}/attendance?year=${year}&section=${en[0].section_id}&date=2026-10-11`,
    { email: "tt-admin@example.test", tenantId: second.id, status: 404 },
  );
  checks++;
  console.log(
    "PASS real second institution cannot access foreign schedules or attendance",
  );
  const after = await db
    .prepare(
      "SELECT COUNT(*) n,SUM(debit_paise)-SUM(credit_paise) balance FROM ledger_entries",
    )
    .first();
  check("fees and journal history preserved", () =>
    assert.deepEqual(after, before),
  );
  const domain = await req(`platform/institutions/${tenant}/domain`, {
    method: "POST",
    body: { hostname: "fees.school.invalid" },
  });
  domainToken = domain.domain.verification_token;
  check("domain DNS points to real hosting edge", () =>
    assert.equal(domain.dns[0].value, "erp.sohansoft.in"),
  );
  const sync = {
    institutionId: tenant,
    hostname: "fees.school.invalid",
    hostingId: "mock-hosting-id",
    status: "active",
    sslStatus: "active",
    error: null,
    records: [
      {
        type: "TXT",
        name: "_openai-site-verification.fees.school.invalid",
        value: "mock-verification",
      },
    ],
  };
  const service = {
    email: "",
    extra: { authorization: "Bearer " + secret },
    method: "POST",
    body: sync,
  };
  const early = await req("jobs/domain-bindings", service);
  check("hosting SSL alone cannot fake tenant domain activation", () =>
    assert.equal(early.status, "Pending Verification"),
  );
  cloudflareActive = true;
  const verified = await req(`platform/institutions/${tenant}/verify-domain`, {
    method: "POST",
    body: {},
  });
  check("ownership plus active hosting SSL activates tenant binding", () => {
    assert.equal(verified.status, "Active");
    assert.equal(verified.dns.length, 3);
    assert.equal(verified.customPortal, "https://fees.school.invalid");
  });
  let response = await mf.dispatchFetch(
    "https://fees.school.invalid/api/domain/context",
  );
  let value = await response.json();
  check("custom hostname resolves correct institution branding context", () =>
    assert.equal(value.data.institution.id, tenant),
  );
  response = await mf.dispatchFetch(
    "https://fees.school.invalid/api/campus/another-school/bootstrap",
  );
  assert.equal(response.status, 404);
  checks++;
  console.log("PASS custom host rejects a foreign tenant path");
  response = await mf.dispatchFetch(
    "https://fees.school.invalid/api/bootstrap",
    {
      headers: {
        "x-institution-id": randomUUID(),
        "oai-authenticated-user-email": teacherEmail,
      },
    },
  );
  assert.equal(response.status, 403);
  checks++;
  console.log("PASS tenant header cannot override hostname binding");
  response = await mf.dispatchFetch(
    "https://fees.school.invalid/api/platform/dashboard",
    { headers: { "oai-authenticated-user-email": owner } },
  );
  assert.equal(response.status, 403);
  checks++;
  console.log("PASS institution domain cannot open platform admin APIs");
  response = await mf.dispatchFetch(
    "https://erp.sohansoft.in/api/domain/context",
    { headers: { "x-forwarded-host": "fees.school.invalid" } },
  );
  value = await response.json();
  check("forwarded host headers cannot select a tenant", () =>
    assert.equal(value.data.institution, null),
  );
  await req("jobs/domain-bindings", { ...service, status: 409 });
  cloudflareActive = false;
  await req(`platform/institutions/${tenant}/verify-domain`, {
    method: "POST",
    body: {},
  });
  response = await mf.dispatchFetch(
    "https://fees.school.invalid/api/domain/context",
  );
  value = await response.json();
  check("pending SSL disables custom-domain routing", () =>
    assert.equal(value.data.institution, null),
  );
  await req("jobs/domain-bindings", { email: "", method: "GET", status: 401 });
  checks++;
  console.log("PASS hosting synchronization requires service authentication");
  await req("settings", {
    method: "PATCH",
    body: {
      name: boot.institution.name,
      address: boot.institution.address,
      email: boot.institution.email,
      phone: boot.institution.phone,
      settings: { ...boot.institution.settings, primaryColor: "#ab4400" },
    },
  });
  const branded = await req("bootstrap");
  check("institution theme colour is persisted", () =>
    assert.equal(branded.institution.settings.primaryColor, "#ab4400"),
  );
  console.log(`${checks} timetable, attendance and domain checks passed`);
} finally {
  await mf.dispose();
}
