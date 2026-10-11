# Student & Parent Portal

## Entry and migration

The shared responsive entry point is `/student-portal`. It uses username/password authentication independently of existing staff authentication. Staff, permission grants, fee invoices, payment orders, ledger postings, provider integrations and receipt generation are reused unchanged. Signed `/portal/:token` links remain supported during migration. Retired `/api/parent` routes stay retired.

Apply additive migration `0016_reflective_blindfold.sql` through the existing deployment migration runner before serving the new Worker. It adds portal accounts, hashed sessions, announcements, documents and service requests with tenant scope triggers. It does not rewrite financial records or existing staff memberships. Existing student accounts are provisioned explicitly through the student profile; no default password is assigned to historical students.

## Staff workflow

Open a student profile → Student & parent portal. Institution admins have `portal.manage`; other authorised staff need that explicit permission. Teachers must be assigned to the student's section or teaching assignment. Managing a parent account requires scope for every linked child.

New individual admissions atomically create a globally unique student username and random 96-bit initial password. Authorised staff see the credentials once after save. Passwords are never stored in browser drafts, application logs or audit JSON. Temporary credentials expire after seven days and require a change before data access. Bulk imports create accounts as part of their existing atomic transaction; issue a reset from each profile to deliver fresh credentials after importing. Existing students can use Issue student account.

Issue a parent account for the selected existing guardian. Reuse the same guardian record when linking siblings (Student details → guardian linking); matching phone numbers alone do not grant access. The parent then sees a child selector. Student accounts remain limited to one student.

Username changes, password resets and account disable/enable revoke all sessions. Staff must verify the requester before resetting and share the one-time password privately. Forgotten-password recovery uses authorised staff; there is no unauthenticated email reset, OTP or unconfigured message delivery claim.

Publish student-specific or school-wide announcements (school-wide requires academic management and an administrator). Publish PDF/PNG/JPEG documents up to 1 MB; archived content is immediately inaccessible. Files remain private in the existing R2 binding.

Requests for transport/hostel enrolment appear in the student's portal controls. Allocate the actual service in the existing Transport/Hostel module, which performs capacity checks and creates the normal fee invoices. Select that allocation when fulfilling the request, or decline with a reason. No duplicate fee or receipt subsystem is created.

## Student/parent workflow

Sign in, change the initial password, then select a child/year. Views include profile and guardian details, attendance, published exam results, published timetable, announcements, documents, fee balances and invoices, payment history, receipt PDFs and facility assignments/requests. New accounts do not expose unpublished academic results. Long lists are paginated.

Online checkout reuses institution Razorpay/Cashfree configuration and existing invoice allocation. Provider responses are verified server-side; browser checkout completion alone does not record a successful payment. Pending orders can be checked in history. Receipt generation may return a preparation notice before a PDF is available. Fees for assigned transport and hostel services use the same ledger and checkout.

## Security and configuration

Passwords use salted scrypt (N=32768, r=8, p=3). Session tokens have 256 bits of randomness and are stored only as SHA-256 hashes. Cookies are HttpOnly, Secure, SameSite=Strict and API-path scoped. Sessions expire after 12 hours or 30 minutes idle. Password changes and account changes bump a version and revoke existing sessions. Database and API tenant scope checks, linked-student checks, same-origin JSON mutations, IP/account rate limiting, lockouts and redacted audit events cover the new endpoints.

No additional external credentials are required for username/password sign-in. Existing `DB` and `BUCKET` bindings are required. Keep the existing private-link signing secret for migration. Institution payment-provider configuration, encryption key, merchant approval and signed webhooks remain required for real payments; configure them through the existing Providers settings. No real provider credentials are included in the ZIP. The ZIP is source code, not a database or uploaded-file backup.

## Verification

`pnpm build`, `pnpm typecheck`, and `pnpm test:portal` validate the Worker and UI types. Portal integration tests run all migrations in isolated D1/R2, then exercise automatic credentials, forced password changes, one-student scope, sibling switching, content publication/archive/download, service requests, session revocation, hashing/audit redaction, rate limits, CSRF, tenant isolation and page serving. Existing SaaS, fee-collection and architecture regression suites are also run. Provider tests use fixtures; production bank transactions, browser/device rendering and accessibility interactions require follow-up testing with the configured school accounts.
