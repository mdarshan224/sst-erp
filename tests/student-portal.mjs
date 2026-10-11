import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
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
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
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
    assert.equal(response.status, status, path);
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
    .sort()) {
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }
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
  const st = await create("One"),
    other = await create("Two");
  assert.ok(st.credentials.password);
  assert.notEqual(st.credentials.username, other.credentials.username);
  console.log("PASS automatic unique credentials");
  let ip = 0;
  async function portal(
    action,
    { body, cookie, status = 200, raw = false, extra = {} } = {},
  ) {
    return req("student-portal/" + action, {
      email: "",
      method: body ? "POST" : "GET",
      body,
      cookie,
      status,
      raw,
      extra: { "cf-connecting-ip": "192.0.2." + ++ip, ...extra },
    });
  }
  async function login(c) {
    const r = await portal("login", {
      body: { username: c.username, password: c.password },
      raw: true,
    });
    assert.match(
      r.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    return r.headers.get("set-cookie").split(";")[0];
  }
  let cookie = await login(st.credentials);
  await portal("overview", { cookie, status: 403 });
  await portal("password", {
    cookie,
    body: {
      currentPassword: st.credentials.password,
      password: "new-secure-password-2026",
    },
  });
  await portal("session", { cookie, status: 401 });
  cookie = await login({
    ...st.credentials,
    password: "new-secure-password-2026",
  });
  const view = await portal("overview", { cookie });
  assert.equal(view.studentId, st.id);
  assert.equal(view.children.length, 1);
  assert.equal(view.profile.name, "Student One");
  assert.equal(view.profile.photo_key, undefined);
  console.log("PASS forced password change and scoped overview");
  await portal("overview?student=" + other.id, { cookie, status: 404 });
  await portal("checkout", {
    cookie,
    body: {
      studentId: other.id,
      yearId: boot.years[0].id,
      amount: "1",
      gateway: "Razorpay",
      idempotencyKey: randomUUID(),
    },
    status: 404,
  });
  await portal("document/not-a-document", { cookie, status: 404 });
  await portal("receipt/not-a-receipt", { cookie, status: 404 });
  await portal("services", {
    cookie,
    body: {
      studentId: other.id,
      yearId: boot.years[0].id,
      kind: "Transport",
      notes: "Near main road",
    },
    status: 404,
  });
  const service = await portal("services", {
    cookie,
    body: {
      studentId: st.id,
      yearId: boot.years[0].id,
      kind: "Transport",
      notes: "Near main road",
    },
  });
  await portal("services", {
    cookie,
    body: {
      studentId: st.id,
      yearId: boot.years[0].id,
      kind: "Transport",
      notes: "Near main road",
    },
    status: 409,
  });
  const staff = (action, body, status = 200) =>
    req(campus + "portal-staff/" + st.id + "/" + action, {
      email,
      method: "POST",
      body,
      status,
    });
  await staff(
    "service",
    { id: service.id, status: "Fulfilled", resolution: "Allocated" },
    422,
  );
  await staff("service", {
    id: service.id,
    status: "Declined",
    resolution: "No route available",
  });
  const ann = await staff("announcement", {
    title: "School update",
    body: "Published for this student.",
  });
  const global = await staff("announcement", {
    title: "All students",
    body: "School holiday tomorrow.",
    institutionWide: true,
  });
  const doc = await staff("document", {
    title: "Test document",
    mime: "application/pdf",
    content: Buffer.from("%PDF-1.4\nTest fixture\n%%EOF").toString("base64"),
  });
  const secondView = await portal("overview", { cookie });
  assert.equal(secondView.announcements.length, 2);
  assert.equal(secondView.documents.length, 1);
  assert.equal(secondView.requests[0].status, "Declined");
  const file = await portal("document/" + doc.id, { cookie, raw: true });
  assert.match(file.headers.get("content-type"), /pdf/);
  await staff("archive", { kind: "announcement", id: ann.id });
  await staff("archive", { kind: "announcement", id: global.id });
  await staff("archive", { kind: "document", id: doc.id });
  assert.equal((await portal("overview", { cookie })).documents.length, 0);
  await portal("document/" + doc.id, { cookie, status: 404 });
  console.log(
    "PASS content publication, downloads, archive and facility requests",
  );
  const parent = (
    await db
      .prepare("SELECT parent_id FROM student_parents WHERE student_id=?")
      .bind(st.id)
      .first()
  ).parent_id;
  await db
    .prepare(
      "INSERT INTO student_parents(id,institution_id,student_id,parent_id) VALUES(?,?,?,?)",
    )
    .bind(randomUUID(), tenant.id, other.id, parent)
    .run();
  const pc = await staff("account", {
    kind: "Parent",
    parentId: parent,
    action: "create",
  });
  let parentCookie = await login(pc);
  await portal("password", {
    cookie: parentCookie,
    body: { currentPassword: pc.password, password: "parent-password-2026" },
  });
  parentCookie = await login({ ...pc, password: "parent-password-2026" });
  const siblings = await portal("overview", { cookie: parentCookie });
  assert.equal(siblings.children.length, 2);
  assert.equal(
    (await portal("overview?student=" + other.id, { cookie: parentCookie }))
      .studentId,
    other.id,
  );
  console.log("PASS linked parent sibling switching");
  await staff("account", {
    kind: "Student",
    action: "rename",
    username: "student.one",
  });
  await portal("session", { cookie, status: 401 });
  const reset = await staff("account", { kind: "Student", action: "reset" });
  cookie = await login(reset);
  assert.equal((await portal("session", { cookie })).mustChange, true);
  await staff("account", { kind: "Student", action: "disable" });
  await portal("session", { cookie, status: 401 });
  await portal("login", {
    body: { username: reset.username, password: reset.password },
    status: 401,
  });
  const account = await db
    .prepare("SELECT password_hash FROM portal_accounts WHERE student_id=?")
    .bind(st.id)
    .first();
  assert.match(account.password_hash, /^scrypt\$/);
  assert.ok(!account.password_hash.includes(reset.password));
  const logs = JSON.stringify(
    (
      await db
        .prepare("SELECT * FROM audit_logs WHERE institution_id=?")
        .bind(tenant.id)
        .all()
    ).results,
  );
  assert.ok(!logs.includes(reset.password));
  assert.ok(!logs.includes(st.credentials.password));
  console.log(
    "PASS rename/reset/disable revoke sessions; passwords hashed and absent from audit",
  );
  await portal("login", {
    body: { username: "unknown.test", password: "bad-password" },
    extra: { origin: "https://evil.example" },
    status: 403,
  });
  const rateIdentity='portal-login-user:'+createHash('sha256').update('unknown.rate').digest('hex');
  const currentWindow=Math.floor(Date.now()/60000);
  for(const window of [currentWindow,currentWindow+1]) await db.prepare('INSERT OR REPLACE INTO rate_limits(key,count,window) VALUES(?,5,?)').bind(rateIdentity+':'+window,window).run();
  await portal('login',{body:{username:'unknown.rate',password:'bad-password'},status:429});
  console.log("PASS CSRF and login rate limit");
  const foreign = "70a45679-cbbd-48aa-a126-34c73d631853";
  await req("portal-staff/" + st.id, { email, tenant: foreign, status: 403 });
  await assert.rejects(() =>
    db
      .prepare(
        "INSERT INTO portal_accounts(id,institution_id,kind,student_id,username,password_hash,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        randomUUID(),
        foreign,
        "Student",
        st.id,
        "bad.tenant",
        "invalid",
        new Date().toISOString(),
        new Date().toISOString(),
        "test",
        "test",
      )
      .run(),
  );
  console.log("PASS API and database tenant isolation");
  await req(campus + "users/invite", {
    email,
    method: "POST",
    body: {
      email: "portal-teacher@example.test",
      fullName: "Portal Teacher",
      role: "TEACHER",
      sectionId: boot.sections[0].id,
      permissions: ["students.view", "portal.manage"],
    },
  });
  await req(campus + "bootstrap", { email: "portal-teacher@example.test" });
  await req(campus + "portal-staff/" + st.id + "/account", {
    email: "portal-teacher@example.test",
    method: "POST",
    body: { kind: "Student", action: "rename", username: "teacher.assigned" },
  });
  await db
    .prepare("UPDATE enrollments SET section_id=? WHERE student_id=?")
    .bind(boot.sections[1].id, other.id)
    .run();
  await req(campus + "portal-staff/" + other.id, {
    email: "portal-teacher@example.test",
    status: 403,
  });
  await req(campus + "portal-staff/" + st.id + "/account", {
    email: "portal-teacher@example.test",
    method: "POST",
    body: { kind: "Parent", parentId: parent, action: "reset" },
    status: 403,
  });
  await req(campus + "portal-staff/" + st.id + "/announcement", {
    email: "portal-teacher@example.test",
    method: "POST",
    body: { title: "Teacher notice", body: "Private class update" },
  });
  console.log(
    "PASS authorised teachers limited to assigned students and all parent siblings",
  );
  const page = await mf.dispatchFetch("https://campus.test/student-portal");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /student-portal|Student/);
  console.log("PASS portal page serves");
  console.log("Student portal workflow passed");
} finally {
  await mf.dispose();
}
