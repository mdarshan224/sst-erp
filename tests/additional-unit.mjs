import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler"))("esbuild");
const temp = await mkdtemp(resolve(".additional-unit-"));
try {
  await build({
    entryPoints: [
      "lib/local-date.ts",
      "lib/form-validation.ts",
      "lib/installment-dates.ts",
      "lib/portal-url.ts",
      "components/campus/InstitutionLogo.tsx",
    ],
    outbase: ".",
    outdir: temp,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });
  const load = (n) => import(pathToFileURL(resolve(temp, n + ".mjs")));
  const { localToday } = await load("lib/local-date");
  assert.equal(
    localToday("Asia/Kolkata", new Date("2026-10-22T20:00:00Z")),
    "2026-10-23",
  );
  assert.equal(
    localToday("America/Los_Angeles", new Date("2026-10-23T01:00:00Z")),
    "2026-10-22",
  );
  const { studentSchemaForToday, structureFormSchema } = await load(
    "lib/form-validation",
  );
  const dob = studentSchemaForToday("2026-10-23").shape.dob;
  for (const d of ["", "2026-10-23", "2000-02-29"])
    assert.ok(dob.safeParse(d).success);
  for (const d of ["2026-10-24", "2050-01-01", "2025-02-29"])
    assert.equal(dob.safeParse(d).success, false);
  assert.equal(
    dob.safeParse("2050-01-01").error.issues[0].message,
    "Date of birth cannot be in the future.",
  );
  console.log("PASS date-only validation and timezone midnight boundaries");
  const {
    addInstallment,
    changeInstallment,
    removeInstallment,
    moveInstallment,
  } = await load("lib/installment-dates");
  const old = ["2026-06-01"];
  let dates = addInstallment(old);
  assert.deepEqual(dates, ["2026-06-01", ""]);
  dates = changeInstallment(dates, 1, "2026-09-01");
  assert.deepEqual(old, ["2026-06-01"]);
  assert.deepEqual(moveInstallment(dates, 1, -1), ["2026-09-01", "2026-06-01"]);
  assert.deepEqual(removeInstallment(dates, 0), ["2026-09-01"]);
  const structure = {
    name: "Custom",
    cls: "class",
    stream: "",
    section: "",
    frequency: "Custom",
    items: [{ componentId: "tuition", amount: "100" }],
    dates,
  };
  assert.ok(structureFormSchema.safeParse(structure).success);
  for (const dates of [[""], ["2026-06-01", "2026-06-01"], ["2026-02-30"]])
    assert.equal(
      structureFormSchema.safeParse({ ...structure, dates }).success,
      false,
    );
  console.log(
    "PASS independent custom add/edit/remove/reorder, required/duplicate/invalid dates",
  );
  const { portalBase } = await load("lib/portal-url");
  assert.equal(
    portalBase("http://localhost:4173/admin", "https://erp.sohansoft.in"),
    "http://localhost:4173",
  );
  assert.equal(
    portalBase("http://127.0.0.1:8787/admin"),
    "http://127.0.0.1:8787",
  );
  assert.equal(
    portalBase(
      "https://staging.example/admin",
      "https://staging.example/base/",
    ),
    "https://staging.example/base",
  );
  assert.equal(
    portalBase("https://edge.example/admin", "https://erp.sohansoft.in"),
    "https://erp.sohansoft.in",
  );
  assert.equal(
    portalBase(
      "http://localhost:4173/admin",
      undefined,
      "https://dev.example:444/erp",
    ),
    "https://dev.example:444/erp",
  );
  assert.throws(() =>
    portalBase("https://example.test", "javascript:alert(1)"),
  );
  console.log(
    "PASS local/staging/production origin, ports, base paths and unsafe URL rejection",
  );
  const { InstitutionLogo } = await load("components/campus/InstitutionLogo");
  const { createElement } = await import("react"),
    { renderToStaticMarkup } = await import("react-dom/server");
  for (const src of [null, undefined, "", " "]) {
    const html = renderToStaticMarkup(
      createElement(InstitutionLogo, { src, name: "Test School" }),
    );
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("TS"));
  }
  assert.ok(
    renderToStaticMarkup(
      createElement(InstitutionLogo, {
        src: "/api/portal/test/logo",
        name: "Test School",
      }),
    ).includes("<img"),
  );
  console.log(
    "PASS absent logos render initials without image requests; valid logo retained",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
