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
  admin = "billing-admin@example.test",
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
    if (u.hostname === "api.cloudflare.com") {
      assert.equal(
        req.headers.get("authorization"),
        "Bearer scoped-test-token-not-live",
      );
      const base = {
        id: "mock-cf",
        hostname: "fees.integration-school.in",
        status: "pending",
        ssl: { status: "pending_validation" },
      };
      if (u.pathname.endsWith("/fallback_origin"))
        return Response.json({
          success: true,
          result: { origin: "saas-origin.sohansoft.in", status: "active" },
        });
      if (u.searchParams.has("hostname"))
        return Response.json({ success: true, result: [] });
      if (req.method === "POST")
        return Response.json({ success: true, result: base });
      return Response.json({
        success: true,
        result: {
          ...base,
          ownership_verification: {
            type: "txt",
            name: "_cf-custom-hostname.fees.integration-school.in",
            value: "owner-token",
          },
          ssl: {
            ...base.ssl,
            validation_records: [
              {
                txt_name: "_acme-challenge.fees.integration-school.in",
                txt_value: "ssl-token",
              },
            ],
          },
        },
      });
    }
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
      phone: "9876543210",
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
      phone: "9876543210",
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

  await post(
    "platform/cloudflare",
    {
      zoneId: "a".repeat(32),
      apiToken: "scoped-test-token-not-live",
      proxySecret: "p".repeat(48),
    },
    { email: owner },
  );
  const cloud = await req("platform/cloudflare", { email: owner });
  assert.equal(cloud.configured, true);
  assert.equal(cloud.proxyConfigured, true);
  assert.equal(
    JSON.stringify(cloud).includes("scoped-test-token-not-live"),
    false,
  );
  const encrypted = await db
    .prepare("SELECT value FROM platform WHERE key='secret:cloudflare'")
    .first();
  assert.equal(encrypted.value.includes("scoped-test-token-not-live"), false);
  check("Cloudflare credentials are encrypted and never returned by settings");
  assert.equal(
    (await post("platform/cloudflare/check", {}, { email: owner })).ready,
    true,
  );
  await post(
    "platform/institutions/" + second.id + "/domain",
    { hostname: "fees.integration-school.in" },
    { email: owner },
  );
  const provisioned = await post(
    "platform/institutions/" + second.id + "/verify-domain",
    {},
    { email: owner },
  );
  assert.equal(provisioned.status, "Pending Verification");
  assert.equal(
    provisioned.dns.find((r) => r.type === "CNAME").value,
    "erp.sohansoft.in",
  );
  assert.deepEqual(
    provisioned.dns
      .filter((r) => r.type === "TXT")
      .map((r) => r.value)
      .sort(),
    ["owner-token", "ssl-token"],
  );
  assert.equal(provisioned.customPortal, null);
  check(
    "Cloudflare fallback check and asynchronous TXT retrieval preserve truthful pending status",
  );
  const domainRole = await post(
    "platform/roles",
    {
      name: "Domain Operator",
      permissions: ["domains.view", "domains.manage"],
      active: true,
    },
    { email: owner },
  );
  await post(
    "platform/administrators",
    {
      name: "Domain Operator",
      email: "domain.operator@example.test",
      mobile: "9876501234",
      roleId: domainRole.id,
      active: true,
    },
    { email: owner },
  );
  await req("platform/cloudflare", { email: "domain.operator@example.test" });
  await req("platform/billing-gateways", {
    email: "domain.operator@example.test",
    status: 403,
  });
  await req("platform/billing-orders", {
    email: "domain.operator@example.test",
    status: 403,
  });
  check(
    "delegated domain administrators cannot access payment keys or subscription orders",
  );
  // A customer's host is authoritative only after the proxy HMAC is verified.
  const domain = "fees.qa-school.example";
  await db
    .prepare(
      "INSERT INTO institution_domains(id,institution_id,hostname,status,verification_token,verification_status,ssl_status,hosting_id,hosting_status,created_at,updated_at,created_by,updated_by) VALUES(?, ?, ?, 'Active', 'qa', 'Verified', 'Active', 'cf:qa', 'active', ?, ?, 'qa', 'qa')",
    )
    .bind(
      randomUUID(),
      tenant,
      domain,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
  async function proxyRequest(path, options = {}) {
    const method = options.method || "GET",
      timestamp = String(Date.now() - (options.age || 0));
    const host = options.host || domain;
    const signature = sign(
      "p".repeat(48),
      [host, timestamp, method, "/api/" + path].join("\n"),
    );
    const response = await mf.dispatchFetch(
      "https://erp.sohansoft.in/api/" + path,
      {
        method,
        headers: {
          "oai-authenticated-user-email": admin,
          "x-sohan-proxy-host": host,
          "x-sohan-proxy-time": timestamp,
          "x-sohan-proxy-signature": signature,
          ...(options.body
            ? { "content-type": "application/json", origin: "https://" + host }
            : {}),
          ...options.headers,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      },
    );
    const data = await response.json();
    assert.equal(
      response.status,
      options.status || 200,
      path + " " + JSON.stringify(data),
    );
    return data.data;
  }
  assert.equal((await proxyRequest("domain/context")).institution.id, tenant);
  assert.equal((await proxyRequest("bootstrap")).institution.id, tenant);
  await proxyRequest("domain/context", {
    headers: { "x-sohan-proxy-signature": "forged" },
    status: 403,
  });
  await proxyRequest("domain/context", { age: 181000, status: 403 });
  await proxyRequest("domain/context", {
    host: "unmapped.example",
    status: 404,
  });
  await proxyRequest("bootstrap", {
    headers: { "x-institution-id": second.id },
    status: 403,
  });
  await proxyRequest("platform/institutions", { status: 403 });
  await proxyRequest("students", {
    method: "POST",
    body: {
      name: "Proxy Student",
      admissionNumber: "PROXY-001",
      yearId: year,
      sectionId: section.id,
      parentName: "Proxy Guardian",
      mobile: "9876543203",
    },
  });
  check(
    "signed customer domains enforce tenancy, freshness, platform restrictions and same-origin mutations",
  );
  await post(
    "platform/billing-gateways",
    {
      provider: "Razorpay",
      enabled: true,
      mode: "test",
      testInstitutionCodes: ["ADV-QA"],
      keyId: "rzp-platform",
      keySecret: gatewaySecret,
      webhookSecret,
    },
    { email: owner },
  );
  await post(
    "platform/billing-gateways",
    {
      provider: "Cashfree",
      enabled: true,
      mode: "test",
      testInstitutionCodes: ["ADV-QA"],
      keyId: "cf-platform",
      keySecret: gatewaySecret,
    },
    { email: owner },
  );
  const config = await req("platform/billing-gateways", { email: owner });
  assert.equal(config.providers.filter((p) => p.enabled).length, 2);
  assert.equal(JSON.stringify(config).includes(gatewaySecret), false);
  check("both platform merchants are enabled without exposing secrets");
  await post("users/invite", {
    fullName: "Auditor",
    email: "auditor@example.test",
    role: "AUDITOR",
  });
  await req("bootstrap", { email: "auditor@example.test" });
  await req("billing", { email: "auditor@example.test", status: 403 });
  const ledgerBefore = await db
    .prepare("SELECT COUNT(*) n FROM ledger_entries WHERE institution_id=?")
    .bind(tenant)
    .first();
  await db
    .prepare(
      "UPDATE institution_subscriptions SET status='Expired',end_date='2026-01-01' WHERE institution_id=?",
    )
    .bind(tenant)
    .run();
  await post(
    "platform/plans",
    {
      name: "Paid QA Plan",
      code: "paid-qa",
      price: "1499.00",
      billingCycle: "Monthly",
      studentLimit: 500,
      userLimit: 20,
      modules: ["students", "fees", "payments", "reports"],
      status: "Active",
    },
    { email: owner },
  );
  const summary = await req("billing");
  const plan = summary.plans[0];
  assert.equal(
    (
      await req("billing", {
        email: "isolated@example.test",
        tenantId: second.id,
      })
    ).gateways.length,
    0,
  );
  await post(
    "billing/checkout",
    { planId: plan.id, gateway: "Cashfree", idempotencyKey: randomUUID() },
    { email: "isolated@example.test", tenantId: second.id, status: 403 },
  );
  check(
    "sandbox payments are hidden and denied outside explicitly allowed test institutions",
  );
  const key = randomUUID();
  const body = {
    planId: plan.id,
    gateway: "Cashfree",
    idempotencyKey: key,
    amount: "0.01",
  };
  const order = await post("billing/checkout", body);
  const replay = await post("billing/checkout", body);
  assert.equal(order.paymentId, replay.paymentId);
  assert.equal(cashOrders.get(order.id).order_amount, plan.price_paise / 100);
  check(
    "expired institution can renew, server price is authoritative and retries create one order",
  );
  await post(
    "billing/checkout",
    { ...body, idempotencyKey: randomUUID() },
    { status: 409 },
  );
  await post(
    "billing/orders/" + order.paymentId + "/reconcile",
    {},
    { status: 409 },
  );
  await post(
    "billing/orders/" + order.paymentId + "/reconcile",
    {},
    { email: "isolated@example.test", tenantId: second.id, status: 404 },
  );
  check(
    "unconfirmed payments cannot activate plans or cross tenant boundaries",
  );
  const event = {
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: {
        order_id: order.id,
        order_currency: "INR",
        order_amount: plan.price_paise / 100,
      },
      payment: {
        cf_payment_id: "cf_" + order.id,
        payment_status: "SUCCESS",
        payment_amount: plan.price_paise / 100,
        payment_currency: "INR",
      },
    },
  };
  const timestamp = String(Date.now());
  const signed = (e) => ({
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": createHmac("sha256", gatewaySecret)
      .update(timestamp + JSON.stringify(e))
      .digest("base64"),
  });
  await post("billing/webhook/cashfree", event, {
    email: "",
    headers: { ...signed(event), "x-webhook-signature": "fake" },
    status: 400,
  });
  const wrong = {
    ...event,
    data: {
      ...event.data,
      payment: { ...event.data.payment, payment_amount: 0.01 },
    },
  };
  await post("billing/webhook/cashfree", wrong, {
    email: "",
    headers: signed(wrong),
    status: 422,
  });
  await Promise.all([
    post("billing/webhook/cashfree", event, {
      email: "",
      headers: signed(event),
    }),
    post("billing/webhook/cashfree", event, {
      email: "",
      headers: signed(event),
    }),
  ]);
  await post("billing/webhook/cashfree", event, {
    email: "",
    headers: signed(event),
  });
  const paid = await req("billing");
  assert.equal(paid.subscription.status, "Active");
  assert.equal(paid.payments.length, 1);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT SUM(debit_paise-credit_paise) balance,COUNT(*) n FROM billing_postings WHERE institution_id=?",
        )
        .bind(tenant)
        .first()
    ).balance,
    0,
  );
  check(
    "signed Cashfree callbacks atomically activate a plan, append two balanced postings and deduplicate",
  );
  const rz = await post("billing/checkout", {
    planId: plan.id,
    gateway: "Razorpay",
    idempotencyKey: randomUUID(),
  });
  captured.add(rz.id);
  await post("billing/orders/" + rz.paymentId + "/reconcile", {});
  await post("billing/orders/" + rz.paymentId + "/reconcile", {});
  const extended = await req("billing");
  assert.ok(extended.subscription.end_date > paid.subscription.end_date);
  assert.equal(extended.subscription.start_date, paid.subscription.start_date);
  assert.equal(extended.payments.length, 2);
  check(
    "Razorpay server capture extends renewal without interrupting the current term",
  );
  const hooked = await post("billing/checkout", {
    planId: plan.id,
    gateway: "Razorpay",
    idempotencyKey: randomUUID(),
  });
  const rzEvent = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "hook_" + hooked.id,
          order_id: hooked.id,
          status: "captured",
          amount: plan.price_paise,
          currency: "INR",
        },
      },
    },
  };
  const rzHeaders = {
    "x-razorpay-signature": sign(webhookSecret, JSON.stringify(rzEvent)),
    "x-razorpay-event-id": "event_" + hooked.id,
  };
  await post("billing/webhook/razorpay", rzEvent, {
    email: "",
    headers: { ...rzHeaders, "x-razorpay-signature": "forged" },
    status: 400,
  });
  await post("billing/webhook/razorpay", rzEvent, {
    email: "",
    headers: rzHeaders,
  });
  await post("billing/webhook/razorpay", rzEvent, {
    email: "",
    headers: rzHeaders,
  });
  assert.equal((await req("billing")).payments.length, 3);
  check(
    "Razorpay webhook requires a valid signature and deduplicates captured payments",
  );
  const unowned = {
    ...event,
    data: {
      ...event.data,
      order: { ...event.data.order, order_id: "provider-dashboard-test" },
    },
  };
  assert.equal(
    (
      await post("billing/webhook/cashfree", unowned, {
        email: "",
        headers: signed(unowned),
      })
    ).ignored,
    true,
  );
  await post("billing/webhook/cashfree", unowned, {
    email: "",
    headers: { ...signed(unowned), "x-webhook-signature": "forged" },
    status: 400,
  });
  check(
    "authenticated provider test events are acknowledged without changing tenant records",
  );
  // A supervisor edit during checkout must never be overwritten by a callback.
  const conflicted = await post("billing/checkout", {
    planId: plan.id,
    gateway: "Razorpay",
    idempotencyKey: randomUUID(),
  });
  await db
    .prepare(
      "UPDATE institution_subscriptions SET user_limit=user_limit+1,updated_at='supervisor-edit' WHERE institution_id=?",
    )
    .bind(tenant)
    .run();
  captured.add(conflicted.id);
  await post(
    "billing/orders/" + conflicted.paymentId + "/reconcile",
    {},
    { status: 409 },
  );
  assert.equal((await req("billing")).payments.length, 3);
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM billing_orders WHERE id=?")
        .bind(conflicted.paymentId)
        .first()
    ).status,
    "Initiated",
  );
  check(
    "subscription edits cause an atomic settlement rollback and require manual review",
  );
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE billing_postings SET credit_paise=1 WHERE institution_id=?",
        )
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM subscription_payments WHERE institution_id=?")
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM ledger_entries WHERE institution_id=?")
        .bind(tenant)
        .first()
    ).n,
    ledgerBefore.n,
  );
  check(
    "subscription money is isolated from immutable student fees and cannot be overwritten",
  );
  await post(
    "platform/billing-gateways",
    {
      provider: "Cashfree",
      enabled: false,
      mode: "test",
      testInstitutionCodes: ["ADV-QA"],
      keyId: "cf-platform",
    },
    { email: owner },
  );
  assert.equal((await req("billing")).gateways.length, 1);
  check("each provider can be independently enabled or disabled");
  console.log(
    `\n${checks} subscription billing and infrastructure checks passed.`,
  );
} finally {
  await mf.dispose();
}
