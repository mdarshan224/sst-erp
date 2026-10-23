# Additional ERP fixes — 23 October 2026

## Audited implementation and root causes

| Issue | Actual implementation and correction |
| --- | --- |
| Future DOB | `lib/form-validation.ts`, `features/students/StudentForm.tsx`, `server/catalog.ts` validated date format only. Shared timezone-aware date helpers now reject future dates; inline error and picker maximum use institution settings. No age restriction added. |
| Custom installments | `features/fees/StructureForm.tsx` appended the previous date. New dates are empty; independent immutable add/edit/remove/reorder helpers and required/duplicate validation preserve amounts and totals. |
| Future attendance | `server/attendance.ts` checked academic boundaries only. Server now checks institution-local today before writes; `features/students/Attendance.tsx` sets date maximum and prevents marking a future date. Past corrections and holiday/year guards remain. |
| Teacher dropdown | `server/timetable.ts` and database triggers required only TEACHER roles. Existing teachers remain eligible; explicitly approved active staff in `teaching_staff` are also eligible. Timetable setup exposes Enable/Remove teaching eligibility to users with users.manage. No automatic administrator eligibility or permission changes. Memberships are institution-wide in this product; teaching eligibility follows that existing campus scope. |
| Room case | Assignment and draft-slot writes lowercased rooms. They now trim only. Existing case-insensitive room-conflict comparisons remain, including database guards. Existing stored room names are not bulk-modified. |
| Duplicate sections | Catalog had no normalized uniqueness check. Frontend and backend preflight plus transactional database triggers enforce institution + academic year + campus + class + normalized name. Year is included because sections belong to an academic year. Stream alone does not allow duplicate names. New PU setup uses A · Science / A · Commerce instead of duplicate A names. Existing records are preserved. |
| Portal origin | `server/domains.ts` returned a literal production origin. Central `lib/portal-url.ts` validates deployment public configuration, preserves ports/base paths, uses loopback origin locally and supports explicit PORTAL_PUBLIC_URL override. Nonlocal deployments use PLATFORM_ORIGIN or request origin. DNS CNAME targets remain production infrastructure targets. |
| Missing logo | Institution detail always rendered the logo endpoint even with no logo_key. Shared `InstitutionLogo` renders initials with no image request for absent values and replaces a failed image without a retry loop. Applied to institution detail, workspace branding and access screens. |
| Friendly slug | Campus API already looked up slugs; platform institution routes used IDs only. Platform routes now resolve slugs after permission checks, retaining ID compatibility. Public/campus lookup accepts case variants; API reference decoding rejects malformed paths. Existing /campus/:slug and /admin/institutions/:slug routes remain canonical. Slug uniqueness is additionally guarded case-insensitively. |

## Migration and existing duplicates

`0018_additional_workflow_guards.sql` adds the normalized section view and insert/key-update guards, explicit teaching eligibility, updated assignment/publishing guards and case-insensitive slug guards. It does not drop or merge historical records. Existing stream-based duplicate sections were identified in source setup routines; setup is corrected for new institutions. The live database overview available in this session omitted the sections table from its bounded table listing, so a complete live duplicate inventory was not available through that connector.

Before manually remediating legacy duplicates, back up D1 and run this read-only query after migration:

```sql
SELECT institution_id, academic_year_id, campus_id, class_id, name_key,
       count(*) AS copies, group_concat(id) AS section_ids
FROM section_name_keys
GROUP BY institution_id, academic_year_id, campus_id, class_id, name_key
HAVING count(*) > 1;
```

Review each group with the institution. Rename distinct stream sections explicitly, or plan a transactional reference migration after reviewing enrollments, fee structures, timetable, attendance and academic history. Never delete a section merely to remove a duplicate name. Existing non-key edits remain possible; new duplicates and conflicting key edits are blocked atomically.

## Configuration

No new credentials are required. Institution settings.timezone is used, defaulting to Asia/Kolkata. Invalid legacy timezone settings fall back to that existing application default. For staging set PLATFORM_ORIGIN to the staging origin. Use PORTAL_PUBLIC_URL only for an explicit portal public base URL (including a reverse-proxy base path if configured). Loopback requests keep their actual protocol/port even if a production PLATFORM_ORIGIN was copied into local configuration; PORTAL_PUBLIC_URL is an intentional override.

## Verification

- Production build: passed (Vinext reports its existing unknown route classification warning).
- TypeScript: passed.
- ESLint: 86 errors / 109 warnings, compared with unchanged-source baseline 86 errors / 113 warnings. Existing errors remain; this is not a clean lint result. Consolidated logo component has an image optimization warning.
- New unit suite: all four groups passed (timezone/date validation, independent installment state, URL configuration, absent/valid logo rendering).
- New integration suite: all six groups passed (migration preservation, DOB, attendance, concurrent section conflicts, teaching eligibility/room case, slug routing and authorization).
- Regression suites passed: workflow unit/integration, OTP governance (17), student portal (rerun after final shared URL change), timetable/attendance/domain (30), SaaS (77), core (66).
- Browser: real StudentForm rejects a restored future DOB with inline error and error-tab focus; native maximum is today. Custom Add Installment creates an empty date while preserving the four existing dates.
- Release assets exclude the isolated browser QA fixture.

These checks use local D1/Worker test environments. Real SMS delivery, live payment transactions, production authenticated journeys and a full mobile visual sweep were not executed. Missing-logo rendering was tested automatically; remote-image error fallback was implemented but not browser fault-injected. No claim of complete live verification is made.

Custom installment reordering is independent in the form; the existing backend policy still persists schedules in chronological due-date order. Signed legacy parent-portal links also use the shared environment-aware URL helper.

## Manual checks still required

1. In each deployed timezone, check today and tomorrow around local midnight for DOB and attendance. Confirm permitted past corrections.
2. On staging, verify PLATFORM_ORIGIN and any deliberate PORTAL_PUBLIC_URL/base path; open staff and legacy parent links.
3. Enable an administrator under Timetable → Subjects & teaching assignments → Teaching eligibility, create/publish an assignment, then revoke eligibility and confirm rejection.
4. Check logo upload, removal and an inaccessible remote URL at desktop/tablet/mobile widths.
5. Review legacy duplicate groups using the read-only query above before any remediation.
6. With provider test credentials, exercise SMS delivery/resend/expiry and payment/receipt callbacks. Automated provider tests do not establish real delivery.

## Regression checklist

- [x] Future DOB rejected in UI and API; today/historical accepted in API.
- [x] Custom installment dates independently added/edited/removed/reordered and validated.
- [x] Future attendance rejected before writes; valid attendance edits preserved.
- [x] Explicit administrator-teacher eligibility and isolation tested.
- [x] Room display capitalization preserved through assignment/draft publishing.
- [x] Duplicate sections blocked, including concurrent submissions; other class/campus permitted.
- [x] Environment URL resolver tested for local/staging/production and base paths.
- [x] Absent logo renders no image request; valid logo renders image.
- [x] Slugs resolve on direct requests and refresh; malformed/unauthorized requests rejected.
- [x] Prior workflow/OTP/fee/holiday/portal regression suites pass.


## Changed files

The issue mapping above explains the implementation responsibilities. Full release file list:

- `cloudflare-env.d.ts`
- `components/campus/Access.tsx`
- `components/campus/App.tsx`
- `components/campus/CatalogDialog.tsx`
- `components/campus/InstitutionLogo.tsx`
- `db/schema.ts`
- `docs/additional-fixes-2026-10-23.md`
- `drizzle/0018_additional_workflow_guards.sql`
- `drizzle/meta/0018_snapshot.json`
- `drizzle/meta/_journal.json`
- `features/academics/Timetable.tsx`
- `features/fees/StructureForm.tsx`
- `features/platform/InstitutionDetail.tsx`
- `features/students/Attendance.tsx`
- `features/students/StudentForm.tsx`
- `lib/form-validation.ts`
- `lib/installment-dates.ts`
- `lib/local-date.ts`
- `lib/portal-url.ts`
- `lib/section-name.ts`
- `server/api.ts`
- `server/attendance.ts`
- `server/catalog.ts`
- `server/domains.ts`
- `server/institutions.ts`
- `server/local-date.ts`
- `server/parent-portal.ts`
- `server/platform.ts`
- `server/routes/academics.ts`
- `server/routes/shared.ts`
- `server/seed.ts`
- `server/tenancy.ts`
- `server/timetable.ts`
- `tests/additional-integration.mjs`
- `tests/additional-unit.mjs`
- `tests/ui-audit.tsx`
