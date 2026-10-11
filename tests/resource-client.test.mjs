import assert from "node:assert/strict";
import { test } from "node:test";
import { createResourceClient } from "../lib/resource-client.ts";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
test("concurrent canonical GETs share one fetch; aborting one consumer does not abort the other", async () => {
  const d = deferred();
  let calls = 0;
  const client = createResourceClient((path, options) => {
    calls++;
    assert.equal(options.signal, undefined);
    return d.promise;
  });
  const c = new AbortController();
  const a = client.request("students?year=y&page=1", { signal: c.signal });
  const b = client.request("students?page=1&year=y");
  c.abort();
  await assert.rejects(a, { name: "AbortError" });
  d.resolve({ total: 2 });
  assert.deepEqual(await b, { total: 2 });
  assert.equal(calls, 1);
  assert.deepEqual(await client.request("students?year=y&page=1"), {
    total: 2,
  });
  assert.equal(calls, 1);
});
test("expiry, explicit refresh and bounded LRU-style eviction refetch data", async () => {
  const original = Date.now;
  let now = 1;
  Date.now = () => now;
  let calls = 0;
  try {
    const c = createResourceClient(async () => ++calls, 15, 2);
    assert.equal(await c.request("a"), 1);
    assert.equal(await c.request("a"), 1);
    now = 17;
    assert.equal(await c.request("a"), 2);
    c.invalidate();
    assert.equal(await c.request("a"), 3);
    await c.request("b");
    await c.request("c");
    assert.equal(await c.request("a"), 6);
  } finally {
    Date.now = original;
  }
});
test("separate institution/session clients never share responses", async () => {
  const a = createResourceClient(async () => ({ school: "A", user: "one" }));
  const b = createResourceClient(async () => ({ school: "B", user: "two" }));
  assert.notDeepEqual(await a.request("students"), await b.request("students"));
});
test("mutations are never coalesced, invalidate reads and preserve all request options", async () => {
  let calls = 0;
  const c = createResourceClient(async (path, options) => {
    calls++;
    if (options.method === "POST")
      assert.deepEqual(options.body, { amount: 100 });
    return calls;
  });
  await c.request("payments");
  await c.request("payments");
  assert.equal(calls, 1);
  await Promise.all([
    c.request("payments", { method: "POST", body: { amount: 100 } }),
    c.request("payments", { method: "POST", body: { amount: 100 } }),
  ]);
  await c.request("payments");
  assert.equal(calls, 4);
});
test("a read finishing after mutation cannot resurrect an invalidated cache", async () => {
  const old = deferred();
  let reads = 0;
  const c = createResourceClient((p, o) =>
    o.method === "POST"
      ? Promise.resolve("saved")
      : ++reads === 1
        ? old.promise
        : Promise.resolve("new"),
  );
  const stale = c.request("invoices");
  await c.request("payments", { method: "POST" });
  old.resolve("old");
  assert.equal(await stale, "old");
  assert.equal(await c.request("invoices"), "new");
  assert.equal(reads, 2);
});
test("rejections are never cached; authentication errors invalidate every entry", async () => {
  let calls = 0,
    denied = false;
  const c = createResourceClient(async (p) => {
    calls++;
    if (p === "bad") throw new Error("offline");
    if (denied) throw Object.assign(new Error("denied"), { status: 403 });
    return p;
  });
  await assert.rejects(c.request("bad"));
  await assert.rejects(c.request("bad"));
  assert.equal(calls, 2);
  await c.request("students");
  denied = true;
  await assert.rejects(c.request("fees"));
  denied = false;
  await c.request("students");
  assert.equal(calls, 5);
});
test("bootstrap only deduplicates in-flight reads, and aborted callers do not initiate fetches", async () => {
  let calls = 0;
  const c = createResourceClient(async () => ++calls);
  await c.request("bootstrap");
  await c.request("bootstrap");
  assert.equal(calls, 2);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(c.request("students", { signal: abort.signal }), {
    name: "AbortError",
  });
  assert.equal(calls, 2);
});
