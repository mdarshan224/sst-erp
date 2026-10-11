import assert from "node:assert/strict";
import { test } from "node:test";
import { navigationTarget, campusHref } from "../lib/navigation-target.ts";
import {
  readNavigationFilters,
  saveNavigationFilters,
} from "../lib/navigation-filters.ts";

test("client router destinations retain query/hash and reject off-site or unsafe navigation", () => {
  const origin = "https://school.test/admin";
  assert.equal(
    navigationTarget("/campus/test-school/fees?new=1#form", origin),
    "/campus/test-school/fees?new=1#form",
  );
  assert.equal(
    navigationTarget("https://school.test/admin/plans", origin),
    "/admin/plans",
  );
  assert.throws(() => navigationTarget("javascript:alert(1)", origin));
  assert.throws(() =>
    navigationTarget("https://another-school.test/admin", origin),
  );
  assert.throws(() => navigationTarget("//another-school.test/admin", origin));
});
test("campus navigation scopes local routes exactly once and preserves global/API entrypoints", () => {
  const base = "/campus/test-school";
  assert.equal(campusHref(base, "/"), base);
  assert.equal(campusHref(base, "/fees?new=1"), base + "/fees?new=1");
  for (const path of [
    "/api/receipts/id/pdf",
    "/admin",
    "/campus/other-school/students",
    "/auth/setup",
    "https://other.test",
    "#tab",
    "//other.test",
  ])
    assert.equal(campusHref(base, path), path);
});

test("academic filters survive section navigation without crossing user or institution boundaries", () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const scope = {
    year: "2026",
    campus: "main",
    class: "10",
    section: "A",
    stream: "",
    from: "2026-06-01",
    to: "2027-05-31",
  };
  saveNavigationFilters("school-a", "user-a", scope);
  assert.deepEqual(readNavigationFilters("school-a", "user-a"), scope);
  assert.equal(readNavigationFilters("school-b", "user-a"), null);
  assert.equal(readNavigationFilters("school-a", "user-b"), null);
  values.set("fee-filters:user-a:school-a", "invalid json");
  assert.equal(readNavigationFilters("school-a", "user-a"), null);
  delete globalThis.sessionStorage;
  assert.doesNotThrow(() => saveNavigationFilters("a", "b", scope));
  assert.equal(readNavigationFilters("a", "b"), null);
});
