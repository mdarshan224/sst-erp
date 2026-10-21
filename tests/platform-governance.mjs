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
const secret = randomBytes(32).toString("hex"),
  encryption = randomBytes(32).toString("hex");
let sentOtp;
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
  outboundService: async (request) => {
    assert.equal(new URL(request.url).origin, "https://www.fast2sms.com");
    const body = await request.json();
    sentOtp = body.otp;
    assert.equal(body.variables_values, "{otp}");
    assert.match(sentOtp, /^\d{6}$/);
    return Response.json({ return: true, status_code: 200 });
  },
  bindings: {
    PLATFORM_OWNER_EMAIL: "tejomaya@mvdt.in",
    PLATFORM_ORIGIN: "https://campus.test",
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: encryption,
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
    if (file.startsWith("0013_")) {
      await db
        .prepare(
          "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES('legacy-admin','legacy.admin@example.test','Existing administrator',?,?, 'migration-test','migration-test')",
        )
        .bind(new Date().toISOString(), new Date().toISOString())
        .run();
      await db
        .prepare(
          "INSERT INTO platform_admins(user_id,active,created_at,updated_at,created_by,updated_by) VALUES('legacy-admin',1,?,?,'migration-test','migration-test')",
        )
        .bind(new Date().toISOString(), new Date().toISOString())
        .run();
    }
    for (const sql of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  }
  const legacy = await req("session", { email: "legacy.admin@example.test" });
  check(
    "Upgrade migration preserves existing platform administrator permissions",
    () => assert.ok(legacy.platformPermissions.includes("institutions.delete")),
  );
  const login = await req("session"),
    owner = login.user.userId;
  const original = await db
    .prepare(
      "SELECT COUNT(*) n,SUM(debit_paise)-SUM(credit_paise) b FROM ledger_entries",
    )
    .first();
  const test = "70a45679-cbbd-48aa-a126-34c73d631853";
  const preview = await req("platform/cleanup");
  check("Audit flags confirmed tests without deleting records", () => {
    assert.equal(preview.automaticDeletion, false);
    assert.match(
      preview.rows.find((i) => i.id === test).classification,
      /test/,
    );
  });
  const role = await req("platform/roles", {
    method: "POST",
    body: {
      name: "Domain Operator",
      permissions: ["institutions.view", "domains.view", "domains.manage"],
      active: true,
    },
  });
  const email = "domain.operator@example.test";
  await req("platform/administrators", {
    method: "POST",
    body: {
      name: "Domain Operator",
      email,
      mobile: "9876501234",
      roleId: role.id,
      active: true,
    },
  });
  const operator = await req("session", { email });
  check("Delegated administrator receives exact role permissions", () =>
    assert.deepEqual(operator.platformPermissions, [
      "institutions.view",
      "domains.view",
      "domains.manage",
    ]),
  );
  for (const path of ["dashboard", "audit", "roles", "payments", "cleanup"])
    await req("platform/" + path, { email, status: 403 });
  await req("platform/institutions", {
    email,
    method: "POST",
    body: {},
    status: 403,
  });
  await req(`platform/institutions/${test}/deletion/challenge`, {
    email,
    method: "POST",
    body: { action: "request" },
    status: 403,
  });
  checks++;
  console.log(
    "PASS all destructive, configuration and report APIs deny unrelated grants",
  );
  await req("platform/roles/" + role.id, {
    method: "POST",
    body: { name: "Domain Operator", permissions: [], active: false },
  });
  await req("platform/institutions", { email, status: 403 });
  await req("platform/administrators", {
    method: "POST",
    body: {
      name: "Owner",
      email: login.user.email,
      mobile: "9876500000",
      roleId: role.id,
      active: false,
    },
    status: 422,
  });
  checks++;
  console.log(
    "PASS role revocation takes immediate effect and primary account is protected",
  );
  const created = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Deletion Recovery Test",
      institutionCode: "DELETE-TEST",
      institutionType: "School",
      adminName: "Test Admin",
      adminEmail: "delete.admin@example.test",
      adminMobile: "9876509999",
      planId: "plan-starter",
      subscriptionStart: "2026-01-01",
      subscriptionEnd: "2028-12-31",
      setupAcademic: true,
    },
  });
  const id = created.id,
    base = `platform/institutions/${id}/deletion/`;
  const previewStarted = performance.now();
  const inventoryPreview = await req(base.slice(0, -1));
  const schemaTables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND lower(substr(name,1,4))<>'_cf_' AND name NOT IN ('institution_deletion_jobs','institution_deletion_challenges')",
      )
      .all()
  ).results;
  const oldQueries =
    1 + schemaTables.length + 3 * inventoryPreview.inventory.entries.length;
  const newQueries =
    2 + Math.ceil(inventoryPreview.inventory.entries.length / 10);
  console.log(
    `MEASURE inventory ${inventoryPreview.inventory.entries.length} tenant tables: ${oldQueries} -> ${newQueries} planned DB round trips; endpoint ${(performance.now() - previewStarted).toFixed(1)}ms in local Worker test`,
  );
  for (const entry of inventoryPreview.inventory.entries) {
    const count = await db
      .prepare(`SELECT COUNT(*) n FROM "${entry.table}" WHERE institution_id=?`)
      .bind(id)
      .first();
    assert.equal(entry.count, count.n, entry.table);
  }
  check(
    "Batched inventory matches independent per-table tenant counts",
    () => {},
  );
  const stamp = new Date().toISOString();
  for (let n = 0; n < 105; n++)
    await db
      .prepare(
        "INSERT INTO fee_components(id,institution_id,name,category,sort_order,active,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,'Academic',0,1,?,?,?,?)",
      )
      .bind(
        randomUUID(),
        id,
        `Batch component ${n}`,
        stamp,
        stamp,
        owner,
        owner,
      )
      .run();
  const bucket = await mf.getR2Bucket("BUCKET");
  await bucket.put(id + "/documents/test.pdf", "recovery-document-payload");
  await bucket.put(test + "/documents/keep.pdf", "other-tenant-document");
  await db
    .prepare(
      "INSERT INTO sms_accounts(mobile,user_id,verified_at) VALUES(?,?,?)",
    )
    .bind("9876500000", owner, new Date().toISOString())
    .run();
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(encryption, "hex"),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("sohan:otp"),
    },
    key,
    new TextEncoder().encode(
      JSON.stringify({ apiKey: "mock-provider-key", template: "7a563a8ad5" }),
    ),
  );
  await db
    .prepare("INSERT INTO platform(key,value) VALUES('auth:sms-config',?)")
    .bind(
      Buffer.from(iv).toString("base64") +
        "." +
        Buffer.from(cipher).toString("base64"),
    )
    .run();
  const otpChallenge = async (action, target = id) => {
    await db
      .prepare(
        "UPDATE institution_deletion_challenges SET created_at=? WHERE user_id=?",
      )
      .bind(new Date(Date.now() - 61000).toISOString(), owner)
      .run();
    await db
      .prepare("DELETE FROM rate_limits WHERE key LIKE 'delete-otp:%'")
      .run();
    const value = await req(
      `platform/institutions/${target}/deletion/challenge`,
      { method: "POST", body: { action } },
    );
    return {
      ...value,
      otp: sentOtp,
      institutionName:
        target === id ? "Deletion Recovery Test" : "CampusLedger Test School",
      secondWarningAccepted: true,
    };
  };
  let c = await otpChallenge("request");
  const stored = await db
    .prepare("SELECT otp_hash FROM institution_deletion_challenges WHERE id=?")
    .bind(c.challengeId)
    .first();
  assert.equal(
    stored.otp_hash,
    createHash("sha256")
      .update(c.challengeId + ":" + sentOtp)
      .digest("hex"),
  );
  await req(base + "challenge", {
    method: "POST",
    body: { action: "request" },
    status: 429,
  });
  const oldChallenge = c;
  c = await otpChallenge("request");
  await req(base + "request", {
    method: "POST",
    body: oldChallenge,
    status: 403,
  });
  checks++;
  console.log(
    "PASS exact outgoing OTP hash, resend cooldown and stale challenge invalidation",
  );
  await req(base + "request", {
    method: "POST",
    body: { ...c, institutionName: "Wrong name" },
    status: 422,
  });
  await req(base + "request", {
    method: "POST",
    body: { ...c, secondWarningAccepted: false },
    status: 422,
  });
  for (let i = 0; i < 5; i++)
    await req(base + "request", {
      method: "POST",
      body: { ...c, otp: c.otp === "000000" ? "111111" : "000000" },
      status: 403,
    });
  await req(base + "request", { method: "POST", body: c, status: 403 });
  checks++;
  console.log(
    "PASS exact-name second-warning and five-attempt lockout enforced",
  );
  c = await otpChallenge("request");
  await db
    .prepare(
      "UPDATE institution_deletion_challenges SET expires_at=? WHERE id=?",
    )
    .bind(new Date(Date.now() - 1000).toISOString(), c.challengeId)
    .run();
  await req(base + "request", { method: "POST", body: c, status: 403 });
  c = await otpChallenge("request");
  const deletion = await req(base + "request", {
    method: "POST",
    body: c,
    cookie: "analytics=changed-after-challenge",
  });
  const replay = await req(base + "request", { method: "POST", body: c });
  assert.equal(replay.jobId, deletion.jobId);
  assert.equal(replay.replayed, true);
  check(
    "Lost-response request retry returns the existing authorized workflow",
    () => {},
  );
  await req(`campus/${created.slug}/bootstrap`, {
    email: "delete.admin@example.test",
    status: 404,
  });
  await req(`platform/institutions/${id}/status`, {
    method: "POST",
    body: { status: "Active" },
    status: 409,
  });
  await req(base + "finalize", { method: "POST", body: c, status: 409 });
  await assert.rejects(
    db
      .prepare(
        "INSERT INTO fee_components(id,institution_id,name,category,sort_order,active,created_at,updated_at,created_by,updated_by) VALUES('blocked',?,'Blocked','Academic',0,1,?,?,?,?)",
      )
      .bind(
        id,
        new Date().toISOString(),
        new Date().toISOString(),
        owner,
        owner,
      )
      .run(),
    /TENANT_DELETING/,
  );
  check("Quarantine blocks tenant access and prevents early purge", () =>
    assert.equal(deletion.status, "Quarantined"),
  );
  c = await otpChallenge("restore");
  await req(base + "restore", { method: "POST", body: c });
  await req(`campus/${created.slug}/bootstrap`, {
    email: "delete.admin@example.test",
  });
  check(
    "Fresh OTP recovers quarantined institution with academics intact",
    () => {},
  );
  c = await otpChallenge("request");
  const second = await req(base + "request", { method: "POST", body: c });
  await db
    .prepare("UPDATE institution_deletion_jobs SET recovery_until=? WHERE id=?")
    .bind(new Date(Date.now() - 1000).toISOString(), second.jobId)
    .run();
  c = await otpChallenge("finalize");
  await req(base + "finalize", { method: "POST", body: c });
  await req(base + "finalize", { method: "POST", body: c, status: 409 });
  await db
    .prepare(
      "UPDATE institution_deletion_jobs SET error='lease:interrupted',updated_at=? WHERE id=?",
    )
    .bind(new Date(Date.now() - 11 * 60000).toISOString(), second.jobId)
    .run();
  // A live lease must deny a concurrent resume without advancing the cursor.
  await db
    .prepare(
      "UPDATE institution_deletion_jobs SET error='lease:active',updated_at=? WHERE id=?",
    )
    .bind(new Date().toISOString(), second.jobId)
    .run();
  await req(base + "resume", { method: "POST", body: {}, status: 409 });
  const busyPreview = await req(base.slice(0, -1));
  assert.equal(busyPreview.job.error, null);
  assert.equal(busyPreview.job.running, true);
  await db
    .prepare(
      "UPDATE institution_deletion_jobs SET error='RECOVERY_UNAVAILABLE' WHERE id=?",
    )
    .bind(second.jobId)
    .run();
  check(
    "Active lease blocks duplicate batches; sanitized failures remain retryable",
    () => {},
  );
  const persisted = await db
    .prepare("SELECT inventory FROM institution_deletion_jobs WHERE id=?")
    .bind(second.jobId)
    .first();
  const originalInventory = JSON.parse(persisted.inventory);
  await db
    .prepare(
      "UPDATE institution_deletion_jobs SET inventory=?,cursor=0 WHERE id=?",
    )
    .bind(
      JSON.stringify({
        ...originalInventory,
        purgeOrder: ["missing_test_table"],
      }),
      second.jobId,
    )
    .run();
  await req(base + "resume", { method: "POST", body: {}, status: 500 });
  assert.equal((await req(base.slice(0, -1))).job.error, "BATCH_FAILED");
  await db
    .prepare(
      "UPDATE institution_deletion_jobs SET inventory=?,cursor=? WHERE id=?",
    )
    .bind(
      persisted.inventory,
      originalInventory.purgeOrder.length,
      second.jobId,
    )
    .run();
  const repaired = await req(base + "resume", { method: "POST", body: {} });
  assert.equal(repaired.status, "Purging");
  check(
    "Interrupted error persists and final verification repairs skipped table progress",
    () => {},
  );
  let result,
    requests = 0;
  do {
    result = await req(base + "resume", { method: "POST", body: {} });
    assert.ok(++requests < 150);
  } while (result.hasMore);
  const state = await db
    .prepare("SELECT status FROM institutions WHERE id=?")
    .bind(id)
    .first();
  assert.equal(state.status, "Deleted");
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM fee_components WHERE institution_id=?")
        .bind(id)
        .first()
    ).n,
    0,
  );
  check(
    "More than 100 operational records are purged in bounded recoverable batches",
    () => {},
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM classes WHERE institution_id=?")
        .bind(id)
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM memberships WHERE institution_id=?")
        .bind(id)
        .first()
    ).n,
    0,
  );
  const objects = await (
    await mf.getR2Bucket("BUCKET")
  ).list({ prefix: `deletion-recovery/${id}/${second.jobId}/` });
  assert.ok(objects.objects.length > 0);
  assert.equal(await bucket.get(id + "/documents/test.pdf"), null);
  assert.equal(
    await (await bucket.get(test + "/documents/keep.pdf")).text(),
    "other-tenant-document",
  );
  const root = JSON.parse(
    await (
      await bucket.get(
        `deletion-recovery/${id}/${second.jobId}/institution.json`,
      )
    ).text(),
  );
  const restored = JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Buffer.from(root.iv, "base64"),
          additionalData: new TextEncoder().encode(second.jobId),
        },
        key,
        Buffer.from(root.cipher, "base64"),
      ),
    ),
  );
  assert.equal(restored.name, "Deletion Recovery Test");
  checks++;
  console.log(
    "PASS interrupted purge resumes with verified encrypted backups and no leaked operational data",
  );
  const inv = await req(`platform/institutions/${test}/deletion`);
  assert.equal(
    inv.inventory.entries.find((e) => e.table === "ledger_entries").retained,
    true,
  );
  assert.equal(
    inv.inventory.entries.find((e) => e.table === "students").retained,
    true,
  );
  assert.deepEqual(
    await db
      .prepare(
        "SELECT COUNT(*) n,SUM(debit_paise)-SUM(credit_paise) b FROM ledger_entries",
      )
      .first(),
    original,
  );
  checks++;
  console.log(
    "PASS protected finance and necessary ancestry remain intact across tenant cleanup",
  );
  await assert.rejects(
    db.prepare("DELETE FROM institution_deletion_jobs").run(),
  );
  await assert.rejects(db.prepare("DELETE FROM platform_audit_logs").run());
  checks++;
  console.log("PASS immutable deletion and audit histories cannot be erased");
  console.log(
    `${checks} platform governance, OTP, recovery and isolation checks passed`,
  );
} finally {
  await mf.dispose();
}
