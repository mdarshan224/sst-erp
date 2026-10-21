import { createRequire } from "node:module";
import { readFile, writeFile, readdir } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler"))("esbuild");
await build({
  entryPoints: ["tests/ui-audit.tsx"],
  outfile: "public/qa-audit.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "isolated-navigation",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link)$/ }, (a) => ({
          path: a.path,
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, (a) => ({
          loader: "js",
          resolveDir: process.cwd(),
          contents:
            a.path === "next/navigation"
              ? `export const useRouter=()=>({push:()=>{},replace:()=>{}}); export const usePathname=()=>'/qa-audit.html';export const useSearchParams=()=>new URLSearchParams();`
              : `import React from 'react';export default function Link({prefetch,...props}){return React.createElement('a',props)}`,
        }));
      },
    },
  ],
});
const styles = (await readdir("dist/client/_next/static/css")).filter((f) =>
  f.endsWith(".css"),
);
await writeFile(
  "public/qa-audit.css",
  (
    await Promise.all(
      styles.map((f) => readFile("dist/client/_next/static/css/" + f, "utf8")),
    )
  ).join("\n"),
);
await writeFile(
  "public/qa-audit.html",
  '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/qa-audit.css"><title>Isolated ERP UI audit</title></head><body><div id="root"></div><script type="module" src="/qa-audit.js"></script></body></html>',
);
