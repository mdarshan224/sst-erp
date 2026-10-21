# ERP functional and UI audit — 21 October 2026

## Pre-change issue map

The repository is the existing React 19 / TypeScript / Vinext application, Cloudflare Worker API, D1 SQLite with Drizzle migrations, private R2 files, SMS staff authentication and separate student/parent credential sessions. No separate HRMS or faculty application is present: faculty are institution staff with the TEACHER role.

| Issue | Actual implementation | Finding before modification |
| --- | --- | --- |
| Deletion OTP disappears | features/platform/Governance.tsx, InstitutionDetail.tsx, hooks/use-resource.ts | Challenge POST refreshes all platform resources; InstitutionDetail loses data and unmounts the deletion component, discarding its freshly returned challenge. OTP entry is inline, not a dialog. |
| OTP mismatch / stale code | server/institution-deletion.ts, server/sms-auth.ts | One server code is already passed to the documented custom OTP parameter; duplicate generation is not reproduced. Whole Cookie header is hashed for session binding, so unrelated cookie changes invalidate a challenge. Resends replace earlier codes; concurrent issuance has no atomic cooldown guard. Need explicit delivery contract and regression tests rather than claim an unobserved hash bug. |
| Quarterly count | features/fees/StructureForm.tsx | Both reset and changeFrequency hardcode offsets 0,3,6; monthly always assumes twelve, independent of year boundaries. Server accepts explicit schedules. |
| Empty structure | features/fees/AssignDialog.tsx, server/fees.ts | Required marker only; no field validation before own() lookup. Existing unique assignment constraint and financial idempotency must remain. |
| Student errors on hidden tab | features/students/StudentForm.tsx, components/campus/ui.tsx, lib/api-client.ts | Uncontrolled tabs, no field-to-tab map, native validation can prevent submit handler, API field errors are dropped by client. |
| Holiday cancellation | features/platform/Holidays.tsx, lib/api-client.ts, server/holidays.ts | Cancel POST has no body/content-type, rejected by CSRF JSON requirement. Add exists; Edit does not. No duplicate holiday prevention; platform manage UI assumes any platform user may mutate. |
| Institution layout | features/platform/InstitutionDetail.tsx, components/campus/ui.tsx, app/globals.css | Shared title/action row has no wrap at desktop/tablet; tabs and administrator rows have narrow fixed layouts. |
| Faculty display | features/auth/Users.tsx, server/staff.ts, server/routes/resources.ts | Faculty are staff memberships, not students; must keep tenant membership identifiers and optional values. No employee-ID/designation/department schema exists to render. |
| Role confusion | components/campus/App.tsx, Entry.tsx, server/security.ts, server/student-portal.ts | Teacher landing defaults to student roster; separate student cookie API exists. Add explicit faculty landing and clarify staff navigation; verify API separation. |
| Misplaced portal management | features/students/StudentProfile.tsx, PortalManagement.tsx | Account-management button is in the fee-profile action bar. Move it to student-details context without deleting portal APIs/pages. |

Production logs inspected contain unrelated root-route 404s and an unauthenticated institution bootstrap 401; they do not establish a live OTP-delivery failure. Real SMS delivery requires a controlled manual check. Automated tests use isolated databases and provider fixtures only.

## Implemented changes and modified files

| Files | Implementation |
| --- | --- |
| `features/platform/Governance.tsx` | Challenge issuance no longer refreshes/unmounts the form. Added OTP dialog, countdown, resend, expiry, busy and error states. Corrected initial deletion action selection. |
| `server/institution-deletion.ts`, `server/sms-auth.ts` | Bind challenge to the authenticated session cookie instead of unrelated cookies; constant-time hash comparison; explicit resend time; send the same generated OTP through Fast2SMS's custom-OTP/template contract. Existing independent authorization, attempts, expiry, retention and recovery are preserved. |
| `drizzle/0017_workflow_guards.sql`, `drizzle/meta/0017_snapshot.json`, `drizzle/meta/_journal.json`, `server/routes/shared.ts` | Atomic OTP issuance cooldown and active-holiday duplicate guards. Safe 429/409 responses. No historical records deleted or financial tables rewritten. |
| `lib/fee-schedule.ts`, `features/fees/StructureForm.tsx`, `server/catalog.ts` | Date-bound recurring schedules, four quarterly installments for a twelve-month year, month-end clamping, supported-frequency preservation and duplicate due-date rejection. Existing maximum twelve-installment contract retained. |
| `features/fees/AssignDialog.tsx`, `server/fees.ts` | Explicit selector placeholder, required inline validation, loading/error feedback, in-flight guard and server ID validation before lookup. Existing database uniqueness and invoice idempotency retained. |
| `lib/api-client.ts` | Body-less mutations send JSON to satisfy existing CSRF policy; backend field errors survive transport. |
| `features/students/StudentForm.tsx`, `lib/student-form-tabs.ts`, `components/campus/ui.tsx` | Controlled error-aware tabs, first invalid field focus/scroll, inline errors, backend field-error mapping, accessible invalid indicators, draft preservation, busy-dialog protection. This version has Student, Guardian and Additional tabs; fees are assigned separately. |
| `features/platform/Holidays.tsx`, `server/holidays.ts`, `server/platform.ts`, `server/routes/facilities.ts` | Permission-aware add/edit/cancel UI, cancellation confirmation, scoped edit endpoints, date validation, audit records, duplicate prevention and list refresh. Global and institution scopes remain separate. Existing holidays are date ranges; no artificial academic-year column was added. |
| `components/campus/App.tsx`, `features/auth/Users.tsx` | Explicit faculty workspace landing with permission-filtered actions; staff directory class/section mapping, contact fallbacks and wrapping. Backend staff/portal isolation preserved and regression-tested. |
| `features/students/StudentProfile.tsx` | Removed portal account management from fee-page actions and retained it in student details. Shared student/parent portal and legacy private links remain intact. |
| `app/globals.css` | Scoped workspace title/action wrapping, institution tabs, staff rows, accessible validation and mobile spacing. Existing gold branding retained. |
| `tests/workflow-unit.mjs`, `tests/workflow-integration.mjs`, `tests/platform-governance.mjs` | Added schedule, validation transport/tab mapping, assignment replay/rounding, holiday CRUD/scope, faculty isolation and OTP contract/cooldown/resend tests. |
| `tests/ui-audit.tsx`, `tests/prepare-ui-audit.mjs` | Reproducible isolated real-component visual fixtures. Generated public QA assets are excluded from the release. |

## Verification results

- Production build: passed. TypeScript `tsc --noEmit`: passed.
- Lint: NOT green. Baseline and updated tree each have 86 errors and 113 warnings. Comparing file/rule/message excluding location changes found no new findings. Existing debt includes broad `any` usage and React hook rules; rules were not disabled to hide it.
- New workflow unit checks: passed for academic/calendar years, partial periods, month-end dates, supported frequencies, student-tab mapping and body-less JSON mutation / field-error transport.
- New workflow integration: passed missing/malformed/nonexistent/valid fee structures; four installments, exact paise conservation, idempotent invoice replay and duplicate rejection; holiday add/edit/cancel and duplicate/date/scope checks; faculty membership and unauthorized portal/holiday access.
- Platform governance: 17 checks passed, including incorrect, expired and resent OTPs; outgoing OTP hash consistency; issuance cooldown; cookie-change resilience; recovery and protected financial retention.
- Existing fee collection: 12 checks passed, including balanced immutable journals and retained records.
- Existing core integration: 66 checks passed.
- Existing SaaS: 77 checks passed, including role/tenant boundaries and server/client routes.
- Existing facilities: 40 checks passed.
- Existing student/parent portal workflow: passed, including multi-child scope, teacher access limits and portal page response.
- Navigation/resource unit tests: 10 passed.
- Browser: real-component isolated fixtures verified the student form switching to Guardian and focusing the invalid parent-name field while preserving entered data; persistent deletion OTP dialog with cooldown and disabled empty verification; desktop institution controls and faculty detail rendering; phone institution action wrapping and wrapped tabs. Phone document width stayed within the viewport. A 768px embedded fixture exercised the student modal; full tablet workflow interaction was limited by intermittent browser-control timeouts.
- Fixture failures from initially incomplete test data were corrected. No live institution deletion or live payment was attempted. Automated suites use isolated D1/R2 environments; SMS and payment provider integrations are mocked.

## Configuration and migration

Apply migration `0017_workflow_guards.sql` through the existing Drizzle/D1 migration workflow before relying on the new atomic guards. Hosted deployment uses the project's existing migration mechanism. Self-hosted ZIP users must apply all migrations in journal order to their own D1 database, not create a new empty database over existing data.

No new provider credential is required by these fixes. Existing Fast2SMS configuration, registered administrator phone, provider balance/template approval, `PROVIDER_ENCRYPTION_KEY` and recovery R2 binding must remain configured. Existing payment gateway keys/webhook secrets remain unchanged. No secrets or production database export are included in the ZIP.

## Remaining manual checks

1. On a designated disposable institution, use an authorized administrator to request deletion OTP. Confirm the modal persists, the actual SMS arrives, and the exact received digits succeed. Never record the code or credentials in logs/screenshots.
2. On separate challenges, check wrong digits, expiry, resend after cooldown, old-code rejection, repeated clicks, and interrupted network responses. Stop before irreversible purge unless intentional; use the retained recovery window to restore the test institution.
3. Check the configured Fast2SMS account's custom-OTP template renders `{otp}`. Provider contract tests are mocked; real carrier delivery has NOT been verified.
4. In real role sessions, check teacher landing, assigned students, attendance/timetable/exams permissions; verify student/parent credentials cannot open staff APIs and a sibling switch only exposes linked children.
5. At desktop/tablet/phone widths, review institution administrators/domain tabs, faculty edit/disable/reset dialogs, student validation in each actual tab and keyboard focus. Full device/browser coverage is not claimed.
6. Create a quarterly June–May structure: confirm June/September/December/March and exact total. Try blank, nonexistent and valid structures and repeat the invoice request; confirm no duplicate assignment or ledger entry.
7. Add, edit and cancel institution/global holidays using permitted accounts; check read-only staff cannot mutate. No import/export control existed in this holiday UI.
8. Perform a gateway sandbox payment and downloadable receipt check using the configured provider before conducting an intentional live payment. No live charge was made by this audit.

## Regression checklist

- [x] Existing React/TypeScript, Worker, D1/Drizzle and authentication architecture preserved.
- [x] Institution scoping, staff permissions and student/parent linkage regression suites passed.
- [x] Existing financial ledger, invoice idempotency, receipts and recovery retention tests passed.
- [x] Quarterly and other supported schedule frequencies covered by unit tests.
- [x] Holiday writes validated and permission-checked on the server.
- [x] Portal account UI relocated without deleting standalone or legacy portal functionality.
- [x] Public marketing branding and unrelated styles left intact.
- [x] No test fixtures, provider secrets or production data included as runtime substitutes.
- [ ] Live SMS carrier delivery and real gateway transactions: manual verification required.
- [ ] Full lint cleanup and exhaustive browser/device coverage: not completed; baseline debt and limits disclosed above.
