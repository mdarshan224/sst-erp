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
  encryptionSecret = randomBytes(32).toString("hex"),
  tenant = "70a45679-cbbd-48aa-a126-34c73d631853",
  owner = "tejomaya@mvdt.in";
let cookie = "",
  checks = 0,
  delivered = false,
  deliveryStarted = false,
  domainToken = "";
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
    PROVIDER_ENCRYPTION_KEY: encryptionSecret,
  },
  outboundService: async (request) => {
    if (new URL(request.url).hostname === "cloudflare-dns.com") {
      const p = new URL(request.url).searchParams;
      return Response.json({
        Status: 0,
        Answer:
          p.get("type") === "TXT"
            ? [{ type: 16, data: '"' + domainToken + '"' }]
            : [
                {
                  type: 5,
                  name: p.get("name"),
                  data: "custom-domains.chatgpt.site.",
                },
              ],
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
      /^(payments|fees|invoices|refunds|cash|facilities)(\/|$)/.test(path)
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
  let legacyCipher;
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file.startsWith("0012")) {
      const key = await crypto.subtle.importKey(
          "raw",
          Buffer.from(encryptionSecret, "hex"),
          "AES-GCM",
          false,
          ["encrypt"],
        ),
        iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: new TextEncoder().encode(`${tenant}:Razorpay`),
        },
        key,
        new TextEncoder().encode(
          JSON.stringify({
            keyId: "legacy_merchant",
            keySecret: "legacy_secret",
            webhookSecret: "legacy_webhook",
          }),
        ),
      );
      legacyCipher =
        Buffer.from(iv).toString("base64") +
        "." +
        Buffer.from(encrypted).toString("base64");
      await db
        .prepare(
          "INSERT INTO provider_configs(id,institution_id,provider,ciphertext,mode,created_at,updated_at,created_by,updated_by) VALUES(?,?,'Razorpay',?,'test',?,?,?,?)",
        )
        .bind(
          randomUUID(),
          tenant,
          legacyCipher,
          new Date().toISOString(),
          new Date().toISOString(),
          "fixture",
          "fixture",
        )
        .run();
    }
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  }
  check("migration preserves existing encrypted merchant envelope", () => {});
  assert.equal(
    (
      await db
        .prepare("SELECT razorpay_credentials FROM institutions WHERE id=?")
        .bind(tenant)
        .first()
    ).razorpay_credentials,
    legacyCipher,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT ciphertext FROM provider_configs WHERE institution_id=? AND provider='Razorpay'",
        )
        .bind(tenant)
        .first()
    ).ciphertext,
    "",
  );
  checks++;
  await req("session");
  const support = await req(`platform/institutions/${tenant}/support`, {
    method: "POST",
    body: { reason: "Facilities isolated regression" },
    raw: true,
  });
  cookie = support.headers.get("set-cookie").split(";")[0];
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    students = (await req(`students?year=${year}`)).rows,
    student = students[0],
    other = students[1],
    component = boot.components[0].id;
  check("bootstrap does not expose encrypted merchant credentials", () => {
    assert.ok(!("razorpay_credentials" in boot.institution));
    assert.ok(!("cashfree_credentials" in boot.institution));
  });
  const details = await req(`platform/institutions/${tenant}`);
  check("platform detail redacts merchant credentials", () =>
    assert.ok(!("razorpay_credentials" in details.institution)),
  );
  await req("providers", {
    method: "POST",
    body: {
      provider: "Razorpay",
      mode: "test",
      config: {
        keyId: "school_A_key",
        keySecret: "school_A_secret",
        webhookSecret: "school_A_webhook",
      },
    },
  });
  const merchant = await db
    .prepare("SELECT razorpay_credentials FROM institutions WHERE id=?")
    .bind(tenant)
    .first();
  check("merchant keys stored on institution are encrypted", () => {
    assert.ok(merchant.razorpay_credentials);
    assert.ok(!merchant.razorpay_credentials.includes("school_A"));
  });
  const [nonce, cipher] = merchant.razorpay_credentials.split("."),
    key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(encryptionSecret, "hex"),
      "AES-GCM",
      false,
      ["decrypt"],
    );
  const clear = JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Buffer.from(nonce, "base64"),
          additionalData: new TextEncoder().encode(`${tenant}:Razorpay`),
        },
        key,
        Buffer.from(cipher, "base64"),
      ),
    ),
  );
  check("AES envelope decrypts only under correct tenant binding", () =>
    assert.equal(clear.keySecret, "school_A_secret"),
  );
  await assert.rejects(() =>
    crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(nonce, "base64"),
        additionalData: new TextEncoder().encode("other:Razorpay"),
      },
      key,
      Buffer.from(cipher, "base64"),
    ),
  );
  checks++;
  await req("settings", {
    method: "PATCH",
    body: {
      name: boot.institution.name,
      address: boot.institution.address,
      email: boot.institution.email,
      phone: boot.institution.phone,
      gstin: boot.institution.gstin || "",
      settings: boot.institution.settings,
    },
  });
  const settingsAudit = await db
    .prepare(
      "SELECT old_value FROM audit_logs WHERE institution_id=? AND action='Updated institution settings' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(tenant)
    .first();
  check("settings audit does not expose encrypted merchant envelope", () => {
    assert.ok(!settingsAudit.old_value.includes("razorpay_credentials"));
    assert.ok(!settingsAudit.old_value.includes(merchant.razorpay_credentials));
  });
  const create = (catalog, body, options = {}) =>
    req(`facilities/${catalog}`, { method: "POST", body, ...options });
  const vehicle = await create("vehicles", {
    registration: "KA01TEST",
    driver_name: "Test Driver",
    driver_mobile: "9876543210",
    capacity: 1,
  });
  const route = await create("routes", {
    name: "North Route",
    vehicle_id: vehicle.id,
  });
  const stop = await create("stops", {
    name: "Market",
    route_id: route.id,
    distance_km: 5,
    monthly_paise: 120050,
    component_id: component,
  });
  const allocation = {
    kind: "Transport",
    studentId: student.id,
    yearId: year,
    stopId: stop.id,
    startDate: "2026-08-15",
    endDate: "2027-03-31",
  };
  const idem = randomUUID(),
    a = await create("allocations", allocation, {
      extra: { "Idempotency-Key": idem },
    }),
    replay = await create("allocations", allocation, {
      extra: { "Idempotency-Key": idem },
    });
  check("network replay returns the same allocation and invoice", () =>
    assert.equal(a.invoiceId, replay.invoiceId),
  );
  const invoice = await db
    .prepare("SELECT * FROM invoice_balances WHERE id=?")
    .bind(a.invoiceId)
    .first();
  check("stop price generates exact initial invoice", () =>
    assert.equal(invoice.net_paise, 120050),
  );
  check("facility invoice posts a balanced double-entry journal", () =>
    assert.equal(invoice.net_paise, 120050),
  );
  const journal = await db
    .prepare(
      "SELECT * FROM journal_events j JOIN ledger_entries l ON l.id=j.ledger_entry_id WHERE l.invoice_id=?",
    )
    .bind(a.invoiceId)
    .first();
  assert.equal(journal.event_type, "INVOICE_GENERATED");
  assert.equal(journal.debit_account, "ACCOUNTS_RECEIVABLE");
  assert.equal(journal.credit_account, "FEE_REVENUE");
  checks++;
  await create("allocations", allocation, { status: 409 });
  checks++;
  const counts = await db.prepare("SELECT COUNT(*) n FROM invoices").first();
  await create(
    "allocations",
    { ...allocation, studentId: other.id },
    { status: 409 },
  );
  check("full vehicle rejects allocation atomically without invoice", () => {});
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM invoices").first()).n,
    counts.n,
  );
  await req(`facilities/allocations/${a.id}/end`, { method: "POST", body: {} });
  await create("allocations", { ...allocation, studentId: other.id });
  checks++;
  const block = await create("blocks", { name: "East Block" }),
    room = await create("rooms", {
      name: "101",
      block_id: block.id,
      capacity: 2,
      boarding_paise: 250025,
      mess_paise: 50010,
      boarding_component_id: component,
      mess_component_id: component,
    });
  const host = {
      kind: "Hostel",
      studentId: student.id,
      yearId: year,
      roomId: room.id,
      bedNumber: 1,
      startDate: "2026-08-15",
      endDate: "2027-03-31",
    },
    h = await create("allocations", host);
  check("boarding and mess use separate exact invoice items", () => {});
  const items = (
    await db
      .prepare(
        "SELECT amount_paise FROM invoice_items WHERE invoice_id=? ORDER BY amount_paise",
      )
      .bind(h.invoiceId)
      .all()
  ).results;
  assert.deepEqual(
    items.map((i) => i.amount_paise),
    [50010, 250025],
  );
  checks++;
  await create(
    "allocations",
    { ...host, studentId: other.id },
    { status: 409 },
  );
  checks++;
  await create(
    "allocations",
    { ...host, studentId: other.id, bedNumber: 3 },
    { status: 422 },
  );
  checks++;
  const beds = await req(
    `facilities/rooms/${room.id}/beds?from=2026-10-01&to=2026-10-31`,
  );
  check("bed availability returns occupied and free numbered beds", () =>
    assert.deepEqual(beds.beds, [
      { number: 1, occupied: true },
      { number: 2, occupied: false },
    ]),
  );
  // Parallel recurrence must create each calendar month's invoice exactly once.
  await Promise.all([create("bill", {}), create("bill", {})]);
  const bills = (
    await db
      .prepare(
        "SELECT period FROM facility_billings WHERE allocation_id=? ORDER BY period",
      )
      .bind(h.id)
      .all()
  ).results;
  check(
    "recurrence advances one period per bounded pass without duplicate",
    () => assert.ok(new Set(bills.map((b) => b.period)).size === bills.length),
  );
  while ((await create("bill", {})).hasMore) {}
  const due = await db
    .prepare("SELECT next_bill_date FROM facility_allocations WHERE id=?")
    .bind(h.id)
    .first();
  check("recurring maintenance catches up to first future month", () =>
    assert.ok(
      due.next_bill_date >
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
    ),
  );
  const beforeRepeat = (
    await db.prepare("SELECT COUNT(*) n FROM facility_billings").first()
  ).n;
  await create("bill", {});
  check("repeated maintenance does not duplicate monthly invoices", () => {});
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM facility_billings").first()).n,
    beforeRepeat,
  );
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE facility_allocations SET charges='[]' WHERE id=?")
        .bind(h.id)
        .run(),
    /FACILITY_IMMUTABLE/,
  );
  checks++;
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM facility_billings WHERE allocation_id=?")
        .bind(h.id)
        .run(),
    /FACILITY_IMMUTABLE/,
  );
  checks++;
  const enrollment = await db
    .prepare(
      "SELECT * FROM enrollments WHERE institution_id=? AND student_id=? AND academic_year_id=?",
    )
    .bind(tenant, student.id, year)
    .first();
  const existing = {
    yearId: year,
    sectionId: enrollment.section_id,
    date: "2026-10-11",
    rows: [{ enrollmentId: enrollment.id, morning: "Present", version: 0 }],
  };
  await req("attendance", { method: "POST", body: existing });
  const holiday = await req("platform/holidays", {
    method: "POST",
    body: {
      name: "National Test Holiday",
      kind: "National Holiday",
      startDate: "2026-10-11",
      endDate: "2026-10-12",
    },
  });
  const grid = await req(
    `attendance?year=${year}&section=${enrollment.section_id}&date=2026-10-11`,
  );
  check("global holiday waives attendance without deleting history", () => {
    assert.equal(grid.required, false);
    assert.equal(grid.holidays[0].name, "National Test Holiday");
    assert.equal(
      grid.rows.find((s) => s.student_id === student.id).morning,
      "Present",
    );
  });
  await req("attendance", {
    method: "POST",
    body: {
      ...existing,
      rows: [{ enrollmentId: enrollment.id, morning: "Absent", version: 1 }],
    },
    status: 409,
  });
  checks++;
  await req(`platform/holidays/${holiday.id}/cancel`, {
    method: "POST",
    body: {},
  });
  assert.equal(
    (
      await req(
        `attendance?year=${year}&section=${enrollment.section_id}&date=2026-10-11`,
      )
    ).required,
    true,
  );
  checks++;
  const local = await req("holidays", {
    method: "POST",
    body: {
      name: "Term Break",
      kind: "Term Break",
      startDate: "2026-10-20",
      endDate: "2026-10-22",
    },
  });
  // Global/local holiday rules are authoritative for published daily lessons.
  await req("users/invite", {
    method: "POST",
    body: {
      email: "holiday-teacher@example.test",
      fullName: "Holiday Teacher",
      role: "TEACHER",
      sectionId: enrollment.section_id,
    },
  });
  await req("bootstrap", { email: "holiday-teacher@example.test" });
  const teacherId = (
    await db
      .prepare(
        "SELECT id FROM users WHERE email='holiday-teacher@example.test'",
      )
      .first()
  ).id;
  const subject = await req("teaching/subjects", {
    method: "POST",
    body: { name: "Holiday Mathematics", code: "HMATH" },
  });
  await req("teaching/assignments", {
    method: "POST",
    body: {
      yearId: year,
      sectionId: enrollment.section_id,
      subjectId: subject.id,
      teacherId,
      periods: 1,
      room: "Holiday Room",
    },
  });
  const timetable = await req("timetables/generate", {
    method: "POST",
    body: {
      yearId: year,
      name: "Holiday Test Schedule",
      days: [2],
      periods: [{ start: "09:00", end: "09:45" }],
    },
  });
  await req(`timetables/${timetable.id}/publish`, {
    method: "POST",
    body: { version: 1 },
  });
  const holidaySchedule = await req(
      `timetables/${timetable.id}?date=2026-10-20`,
    ),
    regularSchedule = await req(`timetables/${timetable.id}?date=2026-10-27`);
  check(
    "holiday suppresses daily lessons without altering published weekly template",
    () => {
      assert.equal(holidaySchedule.required, false);
      assert.equal(holidaySchedule.expectedSlots.length, 0);
      assert.equal(holidaySchedule.slots.length, 1);
      assert.equal(regularSchedule.expectedSlots.length, 1);
    },
  );
  // Facility invoices are collectible using the unchanged payment/receipt flow.
  const inst = (
    await db
      .prepare("SELECT id FROM installments WHERE invoice_id=?")
      .bind(h.invoiceId)
      .first()
  ).id;
  const payment = await req("payments", {
    method: "POST",
    body: {
      studentId: student.id,
      yearId: year,
      amount: "3000.35",
      method: "UPI",
      reference: "FACILITY-INVOICE-COLLECTION",
      idempotencyKey: randomUUID(),
      allocations: [{ installmentId: inst, amount: "3000.35" }],
    },
  });
  check(
    "facility invoice can be paid with a real receipt and updated balance",
    () => {
      assert.ok(payment.receipt?.number);
    },
  );
  assert.equal(
    (
      await db
        .prepare("SELECT outstanding_paise FROM invoice_balances WHERE id=?")
        .bind(h.invoiceId)
        .first()
    ).outstanding_paise,
    0,
  );
  checks++;
  const second = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Facilities Isolation School",
      institutionCode: "FAC-ISO",
      institutionType: "School",
      adminName: "Test Admin",
      adminEmail: "fac-admin@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
  });
  const otherBoot = await req(`campus/${second.slug}/bootstrap`, {
    email: "fac-admin@example.test",
    tenantId: second.id,
  });
  await create(
    "routes",
    { name: "Stolen Vehicle", vehicle_id: vehicle.id },
    { email: "fac-admin@example.test", tenantId: second.id, status: 404 },
  );
  checks++;
  await req(`facilities/rooms/${room.id}/beds?from=2026-10-01&to=2026-10-31`, {
    email: "fac-admin@example.test",
    tenantId: second.id,
    status: 404,
  });
  checks++;
  await req(`facilities/allocations/${h.id}/end`, {
    method: "POST",
    body: {},
    email: "fac-admin@example.test",
    tenantId: second.id,
    status: 404,
  });
  checks++;
  const locals = await req("holidays?from=2026-10-01&to=2026-10-31", {
    email: "fac-admin@example.test",
    tenantId: second.id,
  });
  check("local holidays do not bleed into other institutions", () =>
    assert.ok(!locals.rows.some((row) => row.id === local.id)),
  );
  await req(`holidays/${local.id}/cancel`, {
    method: "POST",
    body: {},
    email: "fac-admin@example.test",
    tenantId: second.id,
    status: 404,
  });
  checks++;
  await req("holidays", {
    method: "POST",
    body: {
      name: "Cross Tenant Holiday",
      kind: "Local Event",
      startDate: "2026-10-25",
      endDate: "2026-10-25",
      institutionId: tenant,
    },
    email: "fac-admin@example.test",
    tenantId: second.id,
    status: 403,
  });
  checks++;
  // Concurrent requests for the same free bed: at most one succeeds.
  const thirdStudent = await req("students", {
    method: "POST",
    body: {
      name: "Bed Candidate",
      admissionNumber: randomUUID(),
      yearId: year,
      sectionId: enrollment.section_id,
      parentName: "Guardian",
      mobile: "9876543210",
    },
  });
  const concurrent = await Promise.all([
    req("facilities/allocations", {
      method: "POST",
      body: { ...host, studentId: other.id, bedNumber: 2 },
      status: null,
      raw: true,
    }),
    req("facilities/allocations", {
      method: "POST",
      body: { ...host, studentId: thirdStudent.id, bedNumber: 2 },
      status: null,
      raw: true,
    }),
  ]);
  check("concurrent bed allocation is serialized by database guard", () =>
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]),
  );
  await req("users/invite", {
    method: "POST",
    body: {
      email: "facility-teacher@example.test",
      fullName: "Class Teacher",
      role: "TEACHER",
      sectionId: enrollment.section_id,
    },
  });
  await req("bootstrap", { email: "facility-teacher@example.test" });
  await req(`facilities?kind=Hostel&year=${year}`, {
    email: "facility-teacher@example.test",
    status: 403,
  });
  checks++;
  await req("holidays", {
    method: "POST",
    body: {
      name: "Not permitted",
      kind: "Local Event",
      startDate: "2026-10-25",
      endDate: "2026-10-25",
    },
    email: "facility-teacher@example.test",
    status: 403,
  });
  checks++;
  console.log(
    `PASS ${checks} facilities, merchant storage, holiday and isolation checks`,
  );
} finally {
  await mf.dispose();
}
