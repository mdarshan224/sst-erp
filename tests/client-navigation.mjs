import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler"))("esbuild");
const temp = await mkdtemp(resolve(".navigation-test-"));
try {
  await build({
    entryPoints: ["components/campus/context.tsx"],
    outdir: temp,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    outExtension: { ".js": ".mjs" },
    plugins: [
      {
        name: "mock-next-router",
        setup(b) {
          b.onResolve({ filter: /^next\/(navigation|link)$/ }, (a) => ({
            path: a.path,
            namespace: "mock-next",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock-next" }, (a) => ({
            loader: "js",
            contents:
              a.path === "next/navigation"
                ? "export const useRouter=()=>globalThis.__mockRouter; export const usePathname=()=>'/campus/a'; export const useSearchParams=()=>new URLSearchParams();"
                : 'import React from "react"; export default function Link({prefetch,...p}) { globalThis.__capturedLinks.push(p); return React.createElement("a", {...p,"data-client-link":"true"}); }',
          }));
        },
      },
    ],
  });
  const { AppContext, CampusLink, useCampusRouter } = await import(
    pathToFileURL(resolve(temp, "context.mjs"))
  );
  const calls = [];
  globalThis.__capturedLinks = [];
  globalThis.window = {
    location: {
      href: "https://erp.test/campus/a",
      origin: "https://erp.test",
      pathname: "/campus/a",
      search: "",
    },
    history: {
      pushState: (state, title, path) => calls.push(["history.push", path]),
      replaceState: (state, title, path) =>
        calls.push(["history.replace", path]),
    },
    dispatchEvent: (e) => calls.push(["event", e.type]),
    scrollTo: () => calls.push(["scroll"]),
  };
  globalThis.__mockRouter = {
    push: (...a) => calls.push(["push", ...a]),
    replace: (...a) => calls.push(["replace", ...a]),
    refresh: () => calls.push(["refresh"]),
    back: () => calls.push(["back"]),
    forward: () => calls.push(["forward"]),
    prefetch: () => {},
  };
  let router;
  function Capture() {
    router = useCampusRouter();
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        CampusLink,
        { href: "/students?new=1", className: "nav" },
        "Students",
      ),
      React.createElement(
        CampusLink,
        { href: "/api/receipts/one/pdf", download: true },
        "Download",
      ),
      React.createElement(
        CampusLink,
        { href: "/admin", target: "_blank" },
        "Admin",
      ),
    );
  }
  const html = renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      { value: { basePath: "/campus/a" } },
      React.createElement(Capture),
    ),
  );
  assert.match(
    html,
    /href="\/campus\/a\/students\?new=1"[^>]*data-client-link="true"/,
  );
  assert.match(html, /href="\/api\/receipts\/one\/pdf"/);
  assert.doesNotMatch(
    html,
    /href="\/api\/receipts\/one\/pdf"[^>]*data-client-link/,
  );
  assert.match(
    html,
    /<a(?=[^>]*href="\/admin")(?=[^>]*target="_blank")(?=[^>]*data-client-link="true")[^>]*>/,
  );
  router.push("/fees?new=1", { scroll: false });
  router.replace("/students");
  router.push("/campus/b");
  router.back();
  router.forward();
  router.refresh();
  assert.deepEqual(calls, [
    ["history.push", "/campus/a/fees?new=1"],
    ["event", "sohan:workspace-navigation"],
    ["history.replace", "/campus/a/students"],
    ["event", "sohan:workspace-navigation"],
    ["scroll"],
    ["history.push", "/campus/b"],
    ["event", "sohan:workspace-navigation"],
    ["scroll"],
    ["back"],
    ["forward"],
    ["refresh"],
  ]);
  assert.throws(() => router.push("https://other.test"));
  calls.length = 0;
  const link = globalThis.__capturedLinks.find(
    (p) => p.href === "/campus/a/students?new=1",
  );
  const event = {
    defaultPrevented: false,
    button: 0,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  link.onClick(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(calls[0], ["history.push", "/campus/a/students?new=1"]);
  calls.length = 0;
  link.onClick({ ...event, defaultPrevented: false, ctrlKey: true });
  assert.equal(calls.length, 0);
  globalThis.__capturedLinks
    .find((p) => p.href === "/admin")
    .onClick({ ...event, defaultPrevented: false });
  assert.equal(calls.length, 0);
  window.location.pathname = "/";
  router.push("/admin/plans");
  assert.deepEqual(calls[0], ["push", "/admin/plans", undefined]);
  for (const publicPath of [
    "/features",
    "/communication",
    "/pricing",
    "/about",
    "/contact",
    "/policies/refunds",
    "/solutions/fees-finance",
    "/benefits",
    "/implementation",
    "/faq",
  ]) {
    calls.length = 0;
    window.location.pathname = "/campus/a/students";
    router.push(publicPath);
    assert.deepEqual(
      calls,
      [["push", publicPath, undefined]],
      "public route must leave retained workspace: " + publicPath,
    );
    calls.length = 0;
    window.location.pathname = publicPath;
    router.push("/admin");
    assert.deepEqual(
      calls,
      [["push", "/admin", undefined]],
      "public route must not retain workspace layout",
    );
  }
  console.log(
    "31 workspace/public navigation, click interception and modifier checks passed",
  );
} finally {
  delete globalThis.__capturedLinks;
  delete globalThis.__mockRouter;
  delete globalThis.window;
  await rm(temp, { recursive: true, force: true });
}
