# Complete source package

This ZIP contains the existing ERP source, migrations, assets, lockfile, configuration templates, tests and deployment documentation corresponding to the deployed audit release. It does not contain runtime secrets, production database rows/documents, installed dependencies or temporary build caches.

## Run and verify

1. Use Node.js 22.13 or newer and the package manager/version in `package.json` (`pnpm@11.25.0`). Install dependencies with `pnpm install --frozen-lockfile`. The hosted build uses the existing Sites helper workflow; local builds use `pnpm build`.
2. Configure the existing Worker environment, D1 and R2 bindings. See `.openai/hosting.json`, `cloudflare-env.d.ts`, `.env.example` and the deployment directory. Do not deploy another copy against the live database accidentally. Keep `PLATFORM_ORIGIN=https://erp.sohansoft.in` for the canonical deployment.
3. Apply the numbered `drizzle/*.sql` migrations in order using a migration-aware deployment tool; the files contain `--> statement-breakpoint` markers and triggers that must not be naively split on every semicolon. Back up existing D1/R2 before deployment. No new migration is required by this audit update.
4. Use the existing secure setup/settings workflow for SMS OTP, encrypted provider settings and Cloudflare SaaS. Merchant keys and the 64-hex-character provider encryption key must be supplied separately and kept server-side. Losing the encryption key prevents decrypting stored provider settings and deletion snapshots.
5. Run `pnpm typecheck`, `pnpm build` and the test commands listed in `audit-2026-10-11.md`. Worker integration tests require `dist/server` from the build and create isolated databases/storage. `pnpm lint` currently reports the documented legacy debt.
6. `pnpm dev` starts local development; `pnpm start` runs the built Worker locally. Use separately configured non-production services for development. No real payments or notification sends are necessary to run the automated fixtures.

## Domains and billing

Follow `public/setup/domain-billing-guide.md`; the ZIP includes the custom-domain proxy source and example Wrangler configuration under `deployment/`. Cloudflare zone/token/fallback configuration must exist before the API can provision and return TXT records. Customer CNAME target is `erp.sohansoft.in`; provider-issued ownership and SSL record values must remain exact.

Platform billing webhooks:
- Razorpay: `https://erp.sohansoft.in/api/billing/webhook/razorpay`
- Cashfree: `https://erp.sohansoft.in/api/billing/webhook/cashfree`

Enable providers and configure separate webhook secrets in the secure platform settings. Institution fee merchant keys and platform subscription merchant keys serve different purposes and must not be mixed. Browser checkout success does not activate a subscription until server verification succeeds.

## Recovery

Keep the encryption key and R2 recovery objects backed up securely. The application supports quarantine restoration before purge. After purge starts, the documented encrypted snapshots require an operator-led restoration; do not import them into a running production tenant without consistency review. Audit and statutory financial records intentionally survive operational deletion.

Read the audit report for exact verification scope and unresolved lint/browser/load-test limitations.
