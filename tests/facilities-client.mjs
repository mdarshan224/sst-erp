import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler"))("esbuild"),
  temp = await mkdtemp(resolve(tmpdir(), "facilities-client-"));
await build({
  entryPoints: ["lib/api-client.ts", "lib/facilities.ts"],
  outdir: temp,
  bundle: true,
  format: "esm",
  platform: "node",
  outExtension: { ".js": ".mjs" },
});
const original = globalThis.fetch;
try {
  const { api } = await import(pathToFileURL(resolve(temp, "api-client.mjs"))),
    { nextMonth } = await import(
      pathToFileURL(resolve(temp, "facilities.mjs"))
    );
  const captured = [];
  let fail = false;
  globalThis.fetch = async (url, init) => {
    captured.push({ url, ...init });
    if (fail) throw new Error("Network lost");
    return Response.json({ success: true, data: { saved: true } });
  };
  for (const suffix of [
    "facilities/vehicles",
    "facilities/allocations",
    "facilities/bill",
    "fees/assign",
    "payments",
    "refunds",
    "reconciliation/bank-commit",
  ]) {
    await api("campus/test-school/" + suffix, {
      method: "POST",
      body: { test: true },
    });
    assert.match(captured.at(-1).headers["Idempotency-Key"], /^[a-f0-9-]{36}$/);
  }
  await api("facilities/blocks", { method: "POST", body: { name: "A" } });
  assert.ok(captured.at(-1).headers["Idempotency-Key"]);
  fail = true;
  await assert.rejects(() =>
    api("campus/test-school/facilities/allocations", {
      method: "POST",
      body: { studentId: "retry" },
    }),
  );
  const before = captured.at(-1).headers["Idempotency-Key"];
  fail = false;
  await api("campus/test-school/facilities/allocations", {
    method: "POST",
    body: { studentId: "retry" },
  });
  assert.equal(captured.at(-1).headers["Idempotency-Key"], before);
  await api("campus/other-school/facilities/allocations", {
    method: "POST",
    body: { studentId: "retry" },
  });
  assert.notEqual(captured.at(-1).headers["Idempotency-Key"], before);
  assert.equal(nextMonth("2026-12-31"), "2027-01-01");
  assert.equal(nextMonth("2028-02-29"), "2028-03-01");
  globalThis.fetch = async () =>
    new Response("<html>Temporarily unavailable</html>", {
      status: 502,
      headers: { "X-Request-ID": "test-support-id" },
    });
  await assert.rejects(
    api("students"),
    (e) =>
      e.code === "INVALID_RESPONSE" &&
      e.status === 502 &&
      e.requestId === "test-support-id",
  );
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        errorCode: "FORBIDDEN",
        message: "No access",
        requestId: "correlation-id",
      },
      { status: 403 },
    );
  await assert.rejects(
    api("students"),
    (e) => e.code === "FORBIDDEN" && e.requestId === "correlation-id",
  );
  console.log(
    "14 client idempotency, actionable failure and monthly-boundary checks passed",
  );
} finally {
  globalThis.fetch = original;
  await rm(temp, { recursive: true, force: true });
}
