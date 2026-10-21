import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler"))("esbuild");
const temp = await mkdtemp(resolve(".workflow-test-"));
try {
  await build({
    entryPoints: [
      "lib/fee-schedule.ts",
      "lib/student-form-tabs.ts",
      "lib/form-validation.ts",
      "lib/api-client.ts",
    ],
    outdir: temp,
    bundle: true,
    platform: "node",
    format: "esm",
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });
  const load = (n) => import(pathToFileURL(resolve(temp, n + ".mjs")));
  const { feeSchedule } = await load("fee-schedule"),
    { studentFieldTab } = await load("student-form-tabs"),
    { studentFormSchema } = await load("form-validation"),
    { api } = await load("api-client");
  for (const start of [
    "2026-01-01",
    "2026-04-01",
    "2026-06-01",
    "2026-06-15",
    "2025-08-31",
  ]) {
    const end = new Date(start + "T00:00:00Z");
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    for (const [f, n] of [
      ["Quarterly", 4],
      ["Monthly", 12],
      ["Half-yearly", 2],
      ["Annual", 1],
    ]) {
      const dates = feeSchedule(start, end.toISOString().slice(0, 10), f);
      assert.equal(dates.length, n);
      assert.equal(new Set(dates).size, n);
      assert.ok(
        dates.every((d) => d >= start && d <= end.toISOString().slice(0, 10)),
      );
    }
  }
  assert.deepEqual(feeSchedule("2026-06-01", "2027-05-31", "Quarterly"), [
    "2026-06-01",
    "2026-09-01",
    "2026-12-01",
    "2027-03-01",
  ]);
  assert.deepEqual(feeSchedule("2026-01-31", "2026-05-30", "Monthly"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
  ]);
  assert.equal(feeSchedule("2026-06-01", "2026-11-30", "Quarterly").length, 2);
  assert.throws(() => feeSchedule("2026-02-30", "2027-05-31", "Quarterly"));
  console.log(
    "PASS calendar/academic years, partial periods, month-end clamping and all frequencies",
  );
  const valid = {
    name: "Student",
    admissionNumber: "A1",
    sectionId: "s1",
    parentName: "Guardian",
    mobile: "9876543210",
    email: "",
    dob: "",
    gender: "Not specified",
    aadhaarLast4: "",
    rollNumber: "",
    bloodGroup: "",
    previousSchool: "",
  };
  for (const [field, bad, tab] of [
    ["name", "", "student"],
    ["sectionId", "", "student"],
    ["parentName", "", "guardian"],
    ["mobile", "123", "guardian"],
    ["email", "bad", "guardian"],
    ["aadhaarLast4", "123", "additional"],
    ["previousSchool", "x".repeat(161), "additional"],
  ]) {
    const parsed = studentFormSchema.safeParse({ ...valid, [field]: bad });
    assert.equal(parsed.success, false);
    assert.equal(studentFieldTab(parsed.error.issues[0].path[0]), tab);
  }
  console.log("PASS validation errors map to every student tab");
  let capture;
  globalThis.fetch = async (url, opts) => {
    capture = opts;
    return Response.json({ success: true, data: { cancelled: true } });
  };
  await api("platform/holidays/x/cancel", { method: "POST" });
  assert.equal(capture.headers["Content-Type"], "application/json");
  assert.equal(capture.body, "{}");
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        message: "Invalid",
        errorCode: "VALIDATION_ERROR",
        fields: { mobile: ["Invalid number"] },
      },
      { status: 422 },
    );
  await assert.rejects(
    () => api("students", { method: "POST", body: {} }),
    (e) => e.fields.mobile[0] === "Invalid number",
  );
  console.log(
    "PASS body-less mutations send JSON and backend field errors survive client transport",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
