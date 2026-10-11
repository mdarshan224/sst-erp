// Isolated D1 and mocked Fast2SMS; never sends real SMS.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const calls = [],
  key = "fast2sms-test-key-for-isolated-runtime",
  owner = "tejomaya@mvdt.in";
let checks = 0,
  ip = 1;
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "sms" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (r) => {
    assert.equal(new URL(r.url).origin, "https://www.fast2sms.com");
    assert.equal(r.headers.get("authorization"), key);
    const body = await r.json();
    calls.push({ path: new URL(r.url).pathname, body });
    if (r.url.endsWith("/send")) {
      assert.equal(body.otp_id, "7a563a8ad5");
      assert.equal(body.otp_length, 6);
      assert.equal(body.otp_expiry, 5);
      assert.equal(body.otp, undefined);
    }
    const valid = !r.url.endsWith("/verify") || body.otp === "123456";
    return Response.json(
      { return: valid, status_code: valid ? 200 : 400 },
      { status: valid ? 200 : 400 },
    );
  },
});
function check(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
async function req(
  path,
  {
    body,
    email,
    cookie,
    status = 200,
    tenant,
    origin = "https://campus.test",
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", origin } : {}),
      ...(email ? { "oai-authenticated-user-email": email } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body && path === "payments"
        ? { "Idempotency-Key": body.idempotencyKey }
        : {}),
      ...(tenant ? { "x-institution-id": tenant } : {}),
      "cf-connecting-ip": "192.0.2." + ip++,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return {
    data: result.data,
    result,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
try {
  const db = await mf.getD1Database("DB");
  for (const f of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const s of (await readFile("drizzle/" + f, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(s).run();
  await req("session", { email: owner });
  const initial = (await db.prepare("SELECT count(*) n FROM students").first())
    .n;
  await req("auth/configure", {
    body: { apiKey: key, mobile: "9876543210" },
    status: 401,
  });
  await req("auth/configure", {
    email: owner,
    origin: "https://evil.test",
    body: { apiKey: key, mobile: "9876543210" },
    status: 403,
  });
  const setup = await req("auth/configure", {
    email: owner,
    body: { apiKey: key, mobile: "9876543210" },
  });
  const stored = await db
    .prepare("SELECT value FROM platform WHERE key='auth:sms-config'")
    .first();
  check("Owner setup stores encrypted API key", () =>
    assert.ok(!stored.value.includes(key)),
  );
  await req("auth/verify", {
    email: owner,
    body: { challengeId: setup.data.challengeId, otp: "000000" },
    status: 400,
  });
  const activated = await req("auth/verify", {
    email: owner,
    body: { challengeId: setup.data.challengeId, otp: "123456" },
  });
  check("Session cookie is secure", () => {
    assert.match(activated.headers.get("set-cookie"), /HttpOnly/);
    assert.match(activated.headers.get("set-cookie"), /Secure/);
    assert.match(activated.headers.get("set-cookie"), /SameSite=Lax/);
  });
  check("SMS is activated only after verification", () =>
    assert.equal(activated.data.smsEnabled, true),
  );
  await req("session", { email: owner, status: 401 });
  await req("session", {
    email: owner,
    cookie: "__Host-sohan_session=forged",
    status: 401,
  });
  check("Old identity headers and forged cookies are rejected", () => {});
  const user = await req("session", { cookie: activated.cookie });
  assert.equal(user.data.platform, true);
  const token = activated.cookie.split("=")[1],
    session = await db.prepare("SELECT token_hash FROM sms_sessions").first();
  assert.notEqual(session.token_hash, token);
  await req("auth/verify", {
    cookie: activated.cookie,
    body: { challengeId: setup.data.challengeId, otp: "123456" },
    status: 400,
  });
  check("Verified OTP cannot be replayed", () => {});
  const ownerId = user.data.user.userId,
    inst = randomUUID(),
    other = randomUUID(),
    stamp = new Date().toISOString();
  for (const id of [inst, other])
    await db
      .prepare(
        "INSERT INTO institutions(id,name,slug,settings,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(id, "SMS test " + id, id, "{}", stamp, stamp, ownerId, ownerId)
      .run();
  const invite = randomUUID();
  await db
    .prepare(
      "INSERT INTO invitations(id,institution_id,email,role,display_name,mobile,permissions,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'ACCOUNTANT','OTP Accountant','9123456789','[]','Pending',?,?,?,?)",
    )
    .bind(
      invite,
      inst,
      "sms-staff@example.test",
      stamp,
      stamp,
      ownerId,
      ownerId,
    )
    .run();
  const victim = randomUUID();
  await db
    .prepare(
      "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,'Existing staff',?,?,?,?)",
    )
    .bind(victim, "victim@example.test", stamp, stamp, ownerId, ownerId)
    .run();
  await db
    .prepare(
      "INSERT INTO memberships(id,institution_id,user_id,role,mobile,permissions,active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'ACCOUNTANT','','[]',1,?,?,?,?)",
    )
    .bind(randomUUID(), other, victim, stamp, stamp, ownerId, ownerId)
    .run();
  await db
    .prepare(
      "INSERT INTO invitations(id,institution_id,email,role,display_name,mobile,permissions,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'ACCOUNTANT','Existing staff','9222222222','[]','Pending',?,?,?,?)",
    )
    .bind(
      randomUUID(),
      inst,
      "victim@example.test",
      stamp,
      stamp,
      ownerId,
      ownerId,
    )
    .run();
  await req("auth/send", { body: { mobile: "9222222222" }, status: 403 });
  check(
    "An institution invitation cannot rebind another tenant’s existing account",
    () => {},
  );
  const login = await req("auth/send", { body: { mobile: "+919123456789" } });
  await req("auth/resend", {
    body: { challengeId: login.data.challengeId },
    status: 429,
  });
  await db
    .prepare("UPDATE sms_challenges SET last_sent_at=? WHERE id=?")
    .bind(new Date(Date.now() - 61000).toISOString(), login.data.challengeId)
    .run();
  await req("auth/resend", { body: { challengeId: login.data.challengeId } });
  const staff = await req("auth/verify", {
    body: { challengeId: login.data.challengeId, otp: "123456" },
  });
  const current = await req("session", { cookie: staff.cookie });
  assert.equal(current.data.memberships[0].institution_id, inst);
  check("Verified invited mobile accepts existing staff grant", () =>
    assert.equal(current.data.user.email, "sms-staff@example.test"),
  );
  await req("bootstrap", { cookie: staff.cookie, tenant: other, status: 403 });
  await req("platform/dashboard", { cookie: staff.cookie, status: 403 });
  check("SMS sessions preserve tenant and platform boundaries", () => {});

  const financialTenant = await db
    .prepare("SELECT institution_id FROM installments LIMIT 1")
    .first();
  await db
    .prepare(
      "INSERT INTO memberships(id,institution_id,user_id,role,display_name,mobile,permissions,active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'ACCOUNTANT','SMS Accountant','9123456789','[]',1,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      financialTenant.institution_id,
      current.data.user.userId,
      stamp,
      stamp,
      ownerId,
      ownerId,
    )
    .run();
  const boot = await req("bootstrap", {
    cookie: staff.cookie,
    tenant: financialTenant.institution_id,
  });
  const due = await db
    .prepare(
      "SELECT id,student_id,academic_year_id FROM installments WHERE institution_id=? AND amount_paise>0 LIMIT 1",
    )
    .bind(financialTenant.institution_id)
    .first();
  const paid = await req("payments", {
    cookie: staff.cookie,
    tenant: financialTenant.institution_id,
    body: {
      studentId: due.student_id,
      yearId: due.academic_year_id,
      amount: "1",
      method: "Cash",
      idempotencyKey: randomUUID(),
    },
  });
  check(
    "SMS-authenticated accountant collects a real atomic payment and receipt",
    () => {
      assert.ok(paid.data.payment.id);
      assert.ok(paid.data.receipt.id);
    },
  );
  await db
    .prepare("UPDATE memberships SET active=0 WHERE user_id=?")
    .bind(current.data.user.userId)
    .run();
  await req("bootstrap", { cookie: staff.cookie, tenant: inst, status: 403 });
  await req("auth/send", { body: { mobile: "9123456789" }, status: 403 });
  check("Disabled staff cannot use tenant APIs or request a login", () => {});
  await req("auth/send", { body: { mobile: "8111111111" }, status: 403 });
  await req("auth/send", { body: { mobile: "123" }, status: 422 });
  const retry = await req("auth/send", { body: { mobile: "9876543210" } });
  for (let i = 0; i < 5; i++)
    await req("auth/verify", {
      body: { challengeId: retry.data.challengeId, otp: "000000" },
      status: 400,
    });
  await req("auth/verify", {
    body: { challengeId: retry.data.challengeId, otp: "123456" },
    status: 429,
  });
  check("Verification attempts are capped at five", () => {});
  await db
    .prepare("UPDATE sms_challenges SET expires_at=? WHERE id=?")
    .bind("2020-01-01T00:00:00.000Z", retry.data.challengeId)
    .run();
  await req("auth/verify", {
    body: { challengeId: retry.data.challengeId, otp: "123456" },
    status: 400,
  });
  check("Expired challenges are rejected locally", () => {});
  await req("auth/logout", { cookie: activated.cookie, body: {} });
  await req("session", { cookie: activated.cookie, status: 401 });
  check("Logout revokes the server session", () => {});
  const after = (await db.prepare("SELECT count(*) n FROM students").first()).n;
  check("Existing students remain intact", () => assert.equal(initial, after));
  console.log(
    `${checks} OTP integration checks passed; ${calls.length} mocked provider requests.`,
  );
} finally {
  await mf.dispose();
}
