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
  const { config } = await req("platform/settings/website");
  check("website defaults contain all four policies", () =>
    assert.equal(Object.keys(config.policies).length, 4),
  );
  const changed = {
    ...config,
    headline: "A campus built around your people.",
    email: "support@example.test",
    phone: "+919876543210",
    address: "Test address",
    hours: "Test hours",
  };
  await req("platform/settings/website", { method: "PATCH", body: changed });
  for (const path of [
    "",
    "/features",
    "/communication",
    "/pricing",
    "/about",
    "/contact",
    "/policies/privacy",
    "/policies/terms",
    "/policies/refunds",
    "/policies/delivery",
    "/benefits",
    "/implementation",
    "/faq",
    "/solutions/fees-finance",
    "/solutions/students-admissions",
    "/solutions/attendance-timetable",
    "/solutions/examinations",
    "/solutions/transport-hostel",
    "/solutions/reports-insights",
    "/solutions/security-control",
  ]) {
    const response = await mf.dispatchFetch("https://erp.sohansoft.in" + path);
    const html = await response.text();
    check(
      "public route renders without login or company redirects: " +
        (path || "/"),
      () => {
        assert.equal(response.status, 200);
        assert.match(html, /<details[^>]*class="[^"]*mobileMenu/);
        assert.match(html, /<summary/);
        assert.doesNotMatch(
          html,
          /href="(?:https:\/\/sohansoft.in|\/admin|\/campus)/,
        );
        assert.match(html, /href="\/policies\/privacy"/);
      },
    );
    if (path === "") assert.match(html, /A campus built around your people/);
  }
  const badSolution = await mf.dispatchFetch(
    "https://erp.sohansoft.in/solutions/not-a-module",
  );
  check("unknown module returns 404", () =>
    assert.equal(badSolution.status, 404),
  );
  const richHome = await (
    await mf.dispatchFetch("https://erp.sohansoft.in/")
  ).text();
  check("home contains images, benefits, workflows and FAQs", () => {
    assert.match(richHome, /connected-campus.webp/);
    assert.match(richHome, /connected-workday.webp/);
    assert.match(richHome, /For accounts teams/);
    assert.match(richHome, /Read all FAQs/);
    assert.match(richHome, /solutions\/examinations/);
  });
  const missing = await mf.dispatchFetch(
    "https://erp.sohansoft.in/policies/not-a-policy",
  );
  check("unknown policy returns 404", () => assert.equal(missing.status, 404));
  await req("platform/settings/website", {
    method: "PATCH",
    body: { ...changed, accent: "url(javascript:alert(1))" },
    status: 422,
  });
  const role = await req("platform/roles", {
    method: "POST",
    body: {
      name: "Website viewer",
      permissions: ["settings.view"],
      active: true,
    },
  });
  const email = "website.viewer@example.test";
  await req("platform/administrators", {
    method: "POST",
    body: {
      name: "Website viewer",
      email,
      mobile: "9876507890",
      roleId: role.id,
      active: true,
    },
  });
  await req("platform/settings/website", { email });
  await req("platform/settings/website", {
    email,
    method: "PATCH",
    body: changed,
    status: 403,
  });
  check("read-only role cannot modify website", () => assert.ok(true));
  const anonymous = await mf.dispatchFetch(
    "https://campus.test/api/platform/settings/enquiries",
  );
  check("anonymous visitors cannot read enquiries", () =>
    assert.equal(anonymous.status, 401),
  );
  const data = {
    id: randomUUID(),
    name: "Website Test",
    email: "visitor@example.test",
    institution: "Example Institution",
    topic: "Demo request",
    message: "Please arrange a demonstration.",
    consent: true,
    website: "",
  };
  const submit = (body, extra = {}) =>
    req("website/enquiries", {
      email: "",
      method: "POST",
      body,
      extra: { "cf-connecting-ip": randomUUID(), ...extra },
    });
  const results = await Promise.all([submit(data), submit(data)]);
  check("concurrent form retries return the same reference", () =>
    assert.equal(results[0].reference, results[1].reference),
  );
  let inbox = await req("platform/settings/enquiries");
  check("enquiry stored exactly once", () => {
    assert.equal(inbox.total, 1);
    assert.equal(inbox.rows[0].message, data.message);
  });
  await req("website/enquiries", {
    email: "",
    method: "POST",
    body: { ...data, message: "Changed request content" },
    extra: { "cf-connecting-ip": randomUUID() },
    status: 409,
  });
  await req("website/enquiries", {
    email: "",
    method: "POST",
    body: { ...data, id: randomUUID(), consent: false },
    extra: { "cf-connecting-ip": randomUUID() },
    status: 422,
  });
  await req("website/enquiries", {
    email: "",
    method: "POST",
    body: { ...data, id: randomUUID(), website: "bot.example" },
    extra: { "cf-connecting-ip": randomUUID() },
    status: 422,
  });
  await req("website/enquiries", {
    email: "",
    method: "POST",
    body: { ...data, id: randomUUID() },
    extra: { origin: "https://evil.test" },
    status: 403,
  });
  check(
    "conflicts, missing consent, honeypot and cross-origin requests rejected",
    () => assert.ok(true),
  );
  const key = inbox.rows[0].key;
  await req("platform/settings/enquiries", {
    email,
    method: "PATCH",
    body: { key, status: "Closed" },
    status: 403,
  });
  await req("platform/settings/enquiries", {
    method: "PATCH",
    body: { key: "settings", status: "Closed" },
    status: 422,
  });
  await req("platform/settings/enquiries", {
    method: "PATCH",
    body: { key, status: "In progress" },
  });
  inbox = await req("platform/settings/enquiries");
  check("authorised status update saved", () =>
    assert.equal(inbox.rows[0].status, "In progress"),
  );
  const audits = await db
    .prepare(
      "SELECT COUNT(*) n FROM platform_audit_logs WHERE action IN ('Updated public website','Updated enquiry status')",
    )
    .first();
  check("website and enquiry changes audited", () => assert.equal(audits.n, 2));
  const ip = randomUUID();
  for (let i = 0; i < 5; i++)
    await submit({ ...data, id: randomUUID() }, { "cf-connecting-ip": ip });
  await req("website/enquiries", {
    email: "",
    method: "POST",
    body: { ...data, id: randomUUID() },
    extra: { "cf-connecting-ip": ip },
    status: 429,
  });
  check("public form rate limited", () => assert.ok(true));
  console.log(`Website integration: ${checks} checks passed`);
} finally {
  await mf.dispose();
}
