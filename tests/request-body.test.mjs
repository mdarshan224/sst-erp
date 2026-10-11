import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler"))("esbuild");
const temp = await mkdtemp(resolve(tmpdir(), "erp-body-"));
await build({
  entryPoints: ["lib/request-body.ts"],
  outdir: temp,
  bundle: true,
  platform: "node",
  format: "esm",
  outExtension: { ".js": ".mjs" },
});
const { readJsonObject } = await import(
  pathToFileURL(resolve(temp, "request-body.mjs"))
);
const request = (body) =>
  new Request("https://erp.test/api/students", { method: "POST", body });
test("JSON object, empty body and Unicode survive decoding", async () => {
  assert.deepEqual(await readJsonObject(request('{"name":"ಕನ್ನಡ"}')), {
    name: "ಕನ್ನಡ",
  });
  assert.deepEqual(await readJsonObject(request("")), {});
});
test("malformed and non-object bodies get actionable 400 errors", async () => {
  for (const value of ["null", "[]", "1", '"name"', "{broken"])
    await assert.rejects(
      readJsonObject(request(value)),
      (e) => e.status === 400 && e.code === "INVALID_JSON",
    );
});
test("chunked oversized payload cancels before the full body is buffered", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readJsonObject(
      new Request("https://erp.test", {
        method: "POST",
        body: stream,
        duplex: "half",
      }),
      10,
    ),
    (e) => e.status === 413,
  );
  assert.equal(cancelled, true);
});
test("declared oversized payload is rejected before reading", async () => {
  await assert.rejects(
    readJsonObject(
      new Request("https://erp.test", {
        method: "POST",
        headers: { "content-length": "100" },
        body: "{}",
      }),
      10,
    ),
    (e) => e.status === 413,
  );
});
process.on("exit", () => {});
await rm(temp, { recursive: true, force: true });
