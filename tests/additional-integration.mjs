import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const secret = randomBytes(32).toString("hex");
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "saas" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: "tejomaya@mvdt.in",
    PLATFORM_ORIGIN: "https://campus.test",
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
});
async function req(
  path,
  {
    email = "tejomaya@mvdt.in",
    method = "GET",
    body,
    tenant,
    cookie,
    status = 200,
    extra = {},
    raw = false,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      ...(method === "POST" &&
      /^(payments|refunds|cash|fees|invoices)(\/|$)/.test(
        path.replace(/^campus\/[^/]+\//, ""),
      ) &&
      path !== "payments/webhook"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      "oai-authenticated-user-email": email,
      ...(tenant ? { "x-institution-id": tenant } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return req(path, {
      email,
      method,
      body,
      status,
      raw,
      tenant,
      cookie,
      extra,
    });
  }
  if (raw) {
    if (Array.isArray(status))
      assert.ok(status.includes(response.status), path);
    else assert.equal(response.status, status, path);
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
try {
  const db = await mf.getD1Database("DB");
  let legacySections;
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file.startsWith("0018_"))
      legacySections = await db
        .prepare("SELECT id,name FROM sections ORDER BY id")
        .all();
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }
  assert.deepEqual(
    (await db.prepare("SELECT id,name FROM sections ORDER BY id").all())
      .results,
    legacySections.results,
  );
  console.log(
    "PASS migration preserves every existing section ID and display name",
  );
  await req("session");
  const tenant = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Portal Test School",
      institutionCode: "PT-TEST",
      institutionType: "School",
      adminName: "Portal Admin",
      adminEmail: "portal-admin@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-01-01",
      subscriptionEnd: "2027-12-31",
      setupAcademic: true,
    },
  });
  const campus = "campus/" + tenant.slug + "/",
    email = "portal-admin@example.test";
  const boot = await req(campus + "bootstrap", { email });
  const create = async (n) =>
    req(campus + "students", {
      email,
      method: "POST",
      body: {
        name: "Student " + n,
        admissionNumber: "PORTAL-" + n,
        yearId: boot.years[0].id,
        sectionId: boot.sections[0].id,
        parentName: "Guardian " + n,
        mobile: "9876543210",
      },
    });
  await create("Workflow");
  const post = (path, body, status = 200) =>
    req(campus + path, { email, method: "POST", body, status });

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const future = new Date(today + "T00:00:00Z");
  future.setUTCDate(future.getUTCDate() + 1);
  const tomorrow = future.toISOString().slice(0, 10);
  const student = {
    name: "DOB student",
    admissionNumber: "DOB-FUTURE",
    yearId: boot.years[0].id,
    sectionId: boot.sections[0].id,
    parentName: "Guardian",
    mobile: "9876543210",
    dob: "2050-01-01",
  };
  const rejected = await post("students", student, 422);
  assert.match(rejected.message, /Date of birth cannot be in the future/);
  await post("students", {
    ...student,
    admissionNumber: "DOB-TODAY",
    dob: today,
  });
  await post("students", {
    ...student,
    admissionNumber: "DOB-PAST",
    dob: "2000-02-29",
  });
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM students WHERE admission_number='DOB-FUTURE'",
        )
        .first()
    ).n,
    0,
  );
  console.log(
    "PASS future DOB rejected before writes; today and historical DOB accepted",
  );
  const grid = await req(
    campus +
      `attendance?year=${boot.years[0].id}&section=${boot.sections[0].id}&date=${today}`,
    { email },
  );
  const attendance = {
    yearId: boot.years[0].id,
    sectionId: boot.sections[0].id,
    date: tomorrow,
    rows: [
      {
        enrollmentId: grid.rows[0].enrollment_id,
        morning: "Present",
        version: 0,
      },
    ],
  };
  const invalid = await post("attendance", attendance, 422);
  assert.equal(
    invalid.message,
    "Attendance cannot be marked for a future date.",
  );
  await post("attendance", { ...attendance, date: today });
  await post("attendance", {
    ...attendance,
    date: today,
    rows: [{ ...attendance.rows[0], morning: "Absent", version: 1 }],
  });
  await post("attendance", { ...attendance, date: "2026-10-01" });
  console.log(
    "PASS future attendance rejected; today, historical and authorized editing accepted",
  );
  const section = {
    name: "  UNIQUE   SECTION ",
    yearId: boot.years[0].id,
    classId: boot.classes[0].id,
    campusId: boot.campuses[0].id,
    capacity: 40,
  };
  await post("catalog/sections", section);
  const duplicate = await post(
    "catalog/sections",
    { ...section, name: "unique section" },
    409,
  );
  assert.equal(
    duplicate.message,
    "This section already exists for the selected class and campus.",
  );
  const secondCampus = await post("catalog/campuses", {
    name: "Second campus",
  });
  await post("catalog/sections", { ...section, campusId: secondCampus.id });
  const secondClass = await post("catalog/classes", {
    name: "Second class",
    level: "School",
  });
  await post("catalog/sections", { ...section, classId: secondClass.id });
  const results = await Promise.all(
    [0, 1].map(() =>
      req(campus + "catalog/sections", {
        email,
        method: "POST",
        body: { ...section, name: "Concurrent" },
        raw: true,
        status: [200, 409],
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  await Promise.all(results.map((r) => r.text()));
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM sections WHERE institution_id=? AND name='Concurrent'",
        )
        .bind(tenant.id)
        .first()
    ).n,
    1,
  );
  assert.equal(results.length, 2);
  console.log(
    "PASS section normalization/scope and concurrent duplicate prevention",
  );
  const admin = await db
    .prepare(
      "SELECT user_id FROM memberships WHERE institution_id=? AND role=?",
    )
    .bind(tenant.id, "INSTITUTION_ADMIN")
    .first();
  let setup = await req(campus + "teaching?year=" + boot.years[0].id, {
    email,
  });
  assert.ok(!setup.teachers.some((t) => t.id === admin.user_id));
  const subject = await post("teaching/subjects", {
    name: "Science",
    code: "SCI",
  });
  const assignment = {
    yearId: boot.years[0].id,
    sectionId: boot.sections[0].id,
    teacherId: admin.user_id,
    subjectId: subject.id,
    periods: 1,
    room: "  ROOM-402  ",
  };
  await post("teaching/assignments", assignment, 422);
  await post("teaching/eligibility", { userId: admin.user_id, eligible: true });
  await post("teaching/eligibility", { userId: admin.user_id, eligible: true });
  setup = await req(campus + "teaching?year=" + boot.years[0].id, { email });
  assert.equal(setup.teachers.filter((t) => t.id === admin.user_id).length, 1);
  const assigned = await post("teaching/assignments", assignment);
  assert.equal(
    (
      await db
        .prepare("SELECT room FROM teaching_assignments WHERE id=?")
        .bind(assigned.id)
        .first()
    ).room,
    "ROOM-402",
  );
  await post(
    "teaching/eligibility",
    { userId: "foreign-user", eligible: true },
    422,
  );
  await req(campus + "teaching/eligibility", {
    email: "outsider@example.test",
    method: "POST",
    body: { userId: admin.user_id, eligible: true },
    status: 403,
  });
  const draft = await post("timetables/generate", {
    name: "Administrator teaching",
    yearId: boot.years[0].id,
    days: [1],
    periods: [{ start: "09:00", end: "09:45" }],
  });
  let timetable = await req(campus + "timetables/" + draft.id, { email });
  assert.equal(timetable.slots[0].room, "ROOM-402");
  await post("timetables/" + draft.id + "/slots", {
    version: 1,
    slots: [
      {
        assignmentId: assigned.id,
        weekday: 1,
        start: "09:00",
        end: "09:45",
        room: " ROOM-403 ",
      },
    ],
  });
  timetable = await req(campus + "timetables/" + draft.id, { email });
  assert.equal(timetable.slots[0].room, "ROOM-403");
  await post("timetables/" + draft.id + "/publish", { version: 2 });
  await post("teaching/eligibility", {
    userId: admin.user_id,
    eligible: false,
  });
  setup = await req(campus + "teaching?year=" + boot.years[0].id, { email });
  assert.ok(!setup.teachers.some((t) => t.id === admin.user_id));
  console.log(
    "PASS explicit administrator teaching eligibility, revocation, isolation and room capitalization",
  );
  const detail = await req("platform/institutions/" + tenant.slug);
  assert.equal(detail.institution.id, tenant.id);
  assert.equal(
    (await req("portal/" + tenant.slug.toUpperCase())).id,
    tenant.id,
  );
  assert.equal((await req("portal/%70" + tenant.slug.slice(1))).id, tenant.id);
  await req("portal/bad%2Fslug", { status: 404 });
  assert.equal((await req("portal/" + tenant.slug)).logoUrl, null);
  await req("portal/not-a-real-slug", { status: 404 });
  await req("platform/institutions/" + tenant.slug, { email, status: 403 });
  for (const route of [
    "/campus/" + tenant.slug,
    "/campus/" + tenant.slug + "/",
    "/admin/institutions/" + tenant.slug,
  ]) {
    for (let refresh = 0; refresh < 2; refresh++) {
      const response = await mf.dispatchFetch("https://campus.test" + route);
      assert.equal(response.status, 200, route);
      await response.text();
    }
  }
  assert.equal(
    detail.domains.defaultPortal,
    "https://campus.test/campus/" + tenant.slug,
  );
  console.log(
    "PASS friendly platform/campus slugs, direct requests/refresh, authorization, absent logo metadata and configured portal origin",
  );
} finally {
  await mf.dispose();
}
