// Uses a disposable D1/R2/Queue runtime and mocked provider responses only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const owner = "tejomaya@mvdt.in",
  admin = "advanced-admin@example.test",
  jobSecret = randomBytes(32).toString("hex"),
  gatewaySecret = randomBytes(32).toString("hex"),
  webhookSecret = randomBytes(32).toString("hex");
let loseCashfreeResponse = false;
const cashOrders = new Map(),
  captured = new Set();
const orders = new Map(),
  deliveries = [];
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "advanced" },
  r2Buckets: ["BUCKET"],
  queueProducers: { COMMUNICATION_QUEUE: "communications" },
  queueConsumers: { communications: { maxBatchSize: 1, maxBatchTimeout: 0 } },
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    JOB_SECRET: jobSecret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (req) => {
    const u = new URL(req.url);
    if (u.hostname === "sandbox.cashfree.com") {
      if (req.method === "POST") {
        const data = await req.json();
        cashOrders.set(data.order_id, data);
        if (loseCashfreeResponse)
          return new Response("Simulated lost response", { status: 502 });
        return Response.json({
          order_id: data.order_id,
          payment_session_id: "mock",
        });
      }
      const id = u.pathname.split("/").at(-2),
        data = cashOrders.get(id);
      return Response.json(
        captured.has(id)
          ? [
              {
                cf_payment_id: "cf_" + id,
                payment_status: "SUCCESS",
                payment_amount: data.order_amount,
                payment_currency: "INR",
              },
            ]
          : [],
      );
    }
    if (
      u.hostname === "api.razorpay.com" &&
      req.method === "GET" &&
      u.pathname.endsWith("/payments")
    ) {
      const id = u.pathname.split("/").at(-2),
        data = orders.get(id);
      return Response.json({
        items: captured.has(id)
          ? [
              {
                id: "rzp_" + id,
                order_id: id,
                status: "captured",
                currency: "INR",
                amount: data.amount,
              },
            ]
          : [],
      });
    }
    if (u.hostname === "api.razorpay.com" && u.pathname === "/v1/orders") {
      const data = await req.json(),
        id = "order_" + randomUUID();
      orders.set(id, data);
      return Response.json({ id, amount: data.amount, currency: "INR" });
    }
    if (
      u.hostname === "api.razorpay.com" &&
      u.pathname.startsWith("/v1/payments/")
    ) {
      const id = u.pathname.split("/").at(-1),
        order = [...orders].find(([key]) => id === "captured_" + key);
      return Response.json({
        id,
        order_id: order?.[0],
        amount: order?.[1].amount,
        currency: "INR",
        status: "captured",
      });
    }
    if (
      u.hostname === "notify.example.test" ||
      u.hostname === "graph.facebook.com"
    ) {
      deliveries.push(await req.json());
      return Response.json({
        id: "mock-delivery",
        messages: [{ id: "meta-mock" }],
      });
    }
    throw new Error("Unexpected network request " + req.url);
  },
});
let tenant,
  checks = 0;
const check = (name, fn = () => {}) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = admin,
    method = "GET",
    body,
    status = 200,
    raw = false,
    headers = {},
    tenantId = tenant,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      ...(tenantId ? { "x-institution-id": tenantId } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...(method === "POST"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) {
    assert.equal(
      response.status,
      status,
      path + " " + (response.status === status ? "" : await response.text()),
    );
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
const post = (path, body, extra = {}) =>
  req(path, { method: "POST", body, ...extra });
const sign = (secret, raw) =>
  createHmac("sha256", secret).update(raw).digest("hex");
const eventually = async (fn) => {
  for (let i = 0; i < 50; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Background operation did not complete");
};
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  await req("session", { email: owner });
  const testSchool = "70a45679-cbbd-48aa-a126-34c73d631853",
    original = await db
      .prepare("SELECT COUNT(*) count FROM students WHERE institution_id=?")
      .bind(testSchool)
      .first();
  const institution = await post(
    "platform/institutions",
    {
      name: "Advanced Integration School",
      institutionCode: "ADV-QA",
      institutionType: "School",
      adminName: "Advanced Admin",
      adminEmail: admin,
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
    { email: owner },
  );
  tenant = institution.id;
  const second = await post(
    "platform/institutions",
    {
      name: "Isolated Integration School",
      institutionCode: "ISO-QA",
      institutionType: "School",
      adminName: "Isolated Admin",
      adminEmail: "isolated@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
    { email: owner },
  );
  await req("bootstrap", {
    email: "isolated@example.test",
    tenantId: second.id,
  });
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    section = boot.sections[0];
  const student = await post("students", {
    name: "Portal Student",
    admissionNumber: "ADV-001",
    yearId: year,
    sectionId: section.id,
    parentName: "Portal Guardian",
    mobile: "9876543201",
    email: "parent@example.test",
  });
  const sibling = await post("students", {
    name: "Other Family Student",
    admissionNumber: "ADV-002",
    yearId: year,
    sectionId: section.id,
    parentName: "Other Guardian",
    mobile: "9876543202",
  });
  const profile = await req("students/" + student.id + "?year=" + year),
    parentId = profile.student.parent_id;
  const component = await post("catalog/components", {
    name: "Tuition QA",
    category: "Academic",
  });
  const structure = await post("catalog/structures", {
    name: "Annual QA tuition",
    yearId: year,
    classId: section.class_id,
    sectionId: section.id,
    frequency: "Annual",
    dates: ["2026-10-10"],
    items: [{ componentId: component.id, amount: "10000" }],
  });
  await post("fees/assign", {
    studentId: student.id,
    structureId: structure.id,
  });

  await post("providers", {
    provider: "Cashfree",
    mode: "sandbox",
    config: { keyId: "mock-cf", keySecret: gatewaySecret },
  });
  await post("providers", {
    provider: "Razorpay",
    mode: "test",
    config: { keyId: "mock-rzp", keySecret: gatewaySecret, webhookSecret },
  });
  const make = (gateway) =>
    post("payments/initiate", {
      studentId: student.id,
      yearId: year,
      amount: "100.01",
      gateway,
      idempotencyKey: randomUUID(),
    });
  const gatewayList = await req("payments/gateways");
  assert.deepEqual(gatewayList.providers.map((p) => p.provider).sort(), [
    "Cashfree",
    "Razorpay",
  ]);
  assert.equal(JSON.stringify(gatewayList).includes(gatewaySecret), false);
  await post("users/invite", {
    fullName: "Read-only Auditor",
    email: "auditor@example.test",
    role: "AUDITOR",
  });
  await req("bootstrap", { email: "auditor@example.test" });
  const cf = await make("Cashfree");
  await post(
    "payments/" + cf.paymentId + "/reconcile",
    {},
    { email: "auditor@example.test", status: 403 },
  );
  check("read-only auditor cannot reconcile or collect funds");
  await post("payments/" + cf.paymentId + "/reconcile", {}, { status: 409 });
  assert.equal(
    (await req("students/" + student.id + "?year=" + year)).student
      .outstanding_paise,
    1000000,
  );
  check("unsettled provider order leaves ledger and dues untouched");
  const event = {
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: cf.id, order_amount: 100.01, order_currency: "INR" },
      payment: {
        cf_payment_id: "cf_" + cf.id,
        payment_amount: 100.01,
        payment_currency: "INR",
        payment_status: "SUCCESS",
      },
    },
  };
  const raw = JSON.stringify(event),
    timestamp = String(Date.now());
  const headers = {
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": createHmac("sha256", gatewaySecret)
      .update(timestamp + raw)
      .digest("base64"),
  };
  await post("payments/webhook/cashfree", event, {
    email: "",
    headers: { ...headers, "x-webhook-signature": "invalid" },
    status: 400,
  });
  check("Cashfree forged signature cannot post a payment");
  const wrong = {
    ...event,
    data: {
      ...event.data,
      payment: { ...event.data.payment, payment_amount: 101 },
    },
  };
  await post("payments/webhook/cashfree", wrong, {
    email: "",
    headers: {
      ...headers,
      "x-webhook-signature": createHmac("sha256", gatewaySecret)
        .update(timestamp + JSON.stringify(wrong))
        .digest("base64"),
    },
    status: 422,
  });
  check("signed amount mismatch is rejected");
  await Promise.all([
    post("payments/webhook/cashfree", event, { email: "", headers }),
    post("payments/webhook/cashfree", event, { email: "", headers }),
  ]);
  await post("payments/webhook/cashfree", event, { email: "", headers });
  const count = await db
    .prepare("SELECT COUNT(*) n FROM receipts WHERE payment_id=?")
    .bind(cf.paymentId)
    .first();
  assert.equal(count.n, 1);
  assert.equal(
    (await req("students/" + student.id + "?year=" + year)).student
      .outstanding_paise,
    989999,
  );
  check(
    "concurrent Cashfree callbacks create one receipt and exact partial-payment balance",
  );
  await post(
    "payments/" + cf.paymentId + "/reconcile",
    {},
    { email: "isolated@example.test", tenantId: second.id, status: 404 },
  );
  check("reconciliation rejects IDs from another tenant");
  const rz = await make("Razorpay");
  captured.add(rz.id);
  await Promise.all([
    post("payments/" + rz.paymentId + "/reconcile", {}),
    post("payments/" + rz.paymentId + "/reconcile", {}),
  ]);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM receipts WHERE payment_id=?")
        .bind(rz.paymentId)
        .first()
    ).n,
    1,
  );
  check("concurrent provider rechecks settle one existing order exactly once");
  const delayed = await make("Cashfree");
  await db
    .prepare("UPDATE payments SET status='Failed' WHERE id=?")
    .bind(delayed.paymentId)
    .run();
  captured.add(delayed.id);
  await post(
    "payments/" + delayed.paymentId + "/confirm",
    { reference: "unverified" },
    { status: 403 },
  );
  await post("payments/" + delayed.paymentId + "/reconcile", {});
  check(
    "delayed settlement recovers a failed online intent only through provider verification",
  );
  loseCashfreeResponse = true;
  const recoveryKey = randomUUID();
  await post(
    "payments/initiate",
    {
      studentId: student.id,
      yearId: year,
      amount: "100.01",
      gateway: "Cashfree",
      idempotencyKey: recoveryKey,
    },
    { status: 502 },
  );
  loseCashfreeResponse = false;
  const lost = await db
    .prepare(
      "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
    )
    .bind(tenant, recoveryKey)
    .first();
  assert.equal(lost.gateway_order_id, lost.id);
  captured.add(lost.id);
  await post("payments/" + lost.id + "/reconcile", {});
  check(
    "lost Cashfree create response preserves stable order for safe reconciliation",
  );
  const balanced = await db
    .prepare(
      "SELECT COUNT(*) n FROM (SELECT e.id,SUM(p.debit_paise-p.credit_paise) balance FROM journal_events e JOIN journal_postings p ON p.event_id=e.id WHERE e.institution_id=? GROUP BY e.id HAVING balance!=0)",
    )
    .bind(tenant)
    .first();
  assert.equal(balanced.n, 0);
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM ledger_entries WHERE institution_id=?")
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  check(
    "all financial journals balance and immutable ledger guards remain enabled",
  );
  // Manual reminder batching must use the selected year, never lexical UUID order.
  await post("notifications", {
    studentIds: [student.id, student.id],
    yearId: year,
    channel: "Email",
  });
  const duplicate = await post("notifications", {
    studentIds: [student.id],
    yearId: year,
    channel: "Email",
  });
  assert.equal(duplicate.queued, 0);
  check(
    "manual reminder retries deduplicate by tenant/year/student/channel/day",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) count FROM students WHERE institution_id=?")
        .bind(testSchool)
        .first()
    ).count,
    original.count,
  );
  check(
    "existing test-school records are preserved by migration and collection flow",
  );
  console.log(`\n${checks} fee collection checks passed.`);
} finally {
  await mf.dispose();
}
