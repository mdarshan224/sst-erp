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
  const st = await create("Workflow");
  const post = (path, body, status = 200) =>
    req(campus + path, { email, method: "POST", body, status });
  const before = (
    await db
      .prepare("SELECT COUNT(*) n FROM invoices WHERE institution_id=?")
      .bind(tenant.id)
      .first()
  ).n;
  for (const structureId of [undefined, "", " ", "../bad", 123])
    await post("invoices", { studentId: st.id, structureId }, 422);
  await post("invoices", { studentId: st.id, structureId: randomUUID() }, 404);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM invoices WHERE institution_id=?")
        .bind(tenant.id)
        .first()
    ).n,
    before,
  );
  const component = await post("catalog/components", {
    name: "Quarterly tuition",
    category: "Academic",
  });
  const dates = ["2026-06-01", "2026-09-01", "2026-12-01", "2027-03-01"];
  await db
    .prepare("UPDATE academic_years SET start_date=?,end_date=? WHERE id=?")
    .bind("2026-06-01", "2027-05-31", boot.years[0].id)
    .run();
  const structureBody = {
    name: "Quarterly year",
    yearId: boot.years[0].id,
    classId: boot.sections[0].class_id,
    frequency: "Quarterly",
    dates,
    items: [{ componentId: component.id, amount: "100.01" }],
  };
  await post(
    "catalog/structures",
    { ...structureBody, dates: [dates[0], dates[0]] },
    422,
  );
  const structure = await post("catalog/structures", structureBody);
  const key = randomUUID(),
    assignment = {
      studentId: st.id,
      structureId: structure.id,
      idempotencyKey: key,
    };
  const invoice = await post("invoices", assignment),
    again = await post("invoices", assignment);
  assert.equal(invoice.invoiceId, again.invoiceId);
  await post("invoices", { studentId: st.id, structureId: structure.id }, 409);
  const installments = (
    await db
      .prepare(
        "SELECT * FROM installments WHERE invoice_id=? ORDER BY due_date",
      )
      .bind(invoice.invoiceId)
      .all()
  ).results;
  assert.equal(installments.length, 4);
  assert.deepEqual(
    installments.map((r) => r.due_date),
    dates,
  );
  assert.equal(
    installments.reduce((s, r) => s + r.amount_paise, 0),
    10001,
  );
  console.log(
    "PASS missing/malformed/nonexistent fee selection, four instalments, paise conservation and duplicate assignment prevention",
  );
  const holiday = {
    name: "Workflow holiday",
    kind: "Local Event",
    startDate: "2026-10-25",
    endDate: "2026-10-25",
  };
  const h = await post("holidays", holiday);
  await post("holidays", holiday, 409);
  await post("holidays/" + h.id + "/edit", {
    ...holiday,
    name: "Updated holiday",
    endDate: "2026-10-26",
  });
  let list = await req(campus + "holidays?from=2026-10-01&to=2026-10-31", {
    email,
  });
  assert.ok(
    list.rows.some((r) => r.id === h.id && r.name === "Updated holiday"),
  );
  await post("holidays/" + h.id + "/cancel", {});
  await post("holidays/" + h.id + "/cancel", {});
  list = await req(campus + "holidays?from=2026-10-01&to=2026-10-31", {
    email,
  });
  assert.ok(!list.rows.some((r) => r.id === h.id));
  await post("holidays", { ...holiday, startDate: "2026-02-30" }, 422);
  const global = await req("platform/holidays", {
    method: "POST",
    body: { ...holiday, name: "Global holiday" },
  });
  await post("holidays/" + global.id + "/cancel", {}, 404);
  await post(
    "holidays/" + global.id + "/edit",
    { ...holiday, name: "Forbidden" },
    404,
  );
  console.log(
    "PASS holiday add/edit/cancel, duplicate/date validation and global scope protection",
  );
  await post("users/invite", {
    email: "workflow.teacher@example.test",
    fullName: "Faculty Display Name",
    role: "TEACHER",
    sectionId: boot.sections[0].id,
    mobile: "9876543211",
  });
  await req(campus + "bootstrap", { email: "workflow.teacher@example.test" });
  const faculty = (await req(campus + "users", { email })).members.find(
    (m) => m.email === "workflow.teacher@example.test",
  );
  assert.equal(faculty.name, "Faculty Display Name");
  assert.equal(faculty.section_id, boot.sections[0].id);
  await req(campus + "holidays", {
    email: "workflow.teacher@example.test",
    method: "POST",
    body: holiday,
    status: 403,
  });
  await req("student-portal/session", {
    email: "workflow.teacher@example.test",
    status: 401,
  });
  await req(campus + "users", { email: "", status: 401 });
  console.log(
    "PASS faculty mapping, unauthorised holiday write and staff/student authentication separation",
  );
  console.log("Workflow integration checks passed");
} finally {
  await mf.dispose();
}
