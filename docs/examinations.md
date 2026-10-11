# Examinations and admit cards

Canonical application origin: https://erp.sohansoft.in. Signed verification QR codes always use this domain. Existing institution paths, authentication, fees and financial journals are retained.

## Workflow

Institution administrators open Exams, create an exam for an academic year and section, select the board and approve a named/versioned grading policy. Grade bands and qualitative labels are editable before creation. Add subjects, maximum/pass marks, dates, times, rooms and optional assigned graders. Register eligible students with their selected subjects. Scheduling freezes the subject timetable and candidate registrations. Record assessments, then publish after all registered assessments are complete. Published results are immutable; archive obsolete exams without deleting history.

Nursery uses qualitative assessment labels, assignment status and feedback rather than numeric grades. School exams support formative and summative assessments with the approved internal grade bands. Board exams retain officially awarded grades independently of internal cutoffs. PUC mock exams support KCET/JEE/NEET identifiers, configurable negative marking, and percentiles calculated only among candidates who completed all their selected subjects without absences. These are local mock cohort percentiles, not official examination percentiles. Institutions must approve the applicable grading policy; no fixed percentage bands are represented as official CBSE relative grading rules.

Only assigned-section teachers can view exams; only the teacher assigned to a subject can grade it. Institution administrators can manage and grade their institution's exams. The Users & Roles permission editor exposes Exams: view, manage and grade. Existing custom teacher permissions may need these permissions explicitly enabled. Results use version checks and database guards to reject stale/concurrent overwrites and invalid marks. Every assessment change, policy approval, status change and card issuance/revocation is audited.

Admit cards use real student records and private student photos, selected subjects and dates. Print / Save PDF uses A4 browser printing. QR codes contain signed, expiring, revocable links. Public verification discloses only institution, examination, card reference and validity; it does not disclose student names, admission numbers, photos or results. Cards expire after 90 days or become invalid on revocation or exam archival. Archive changes invalidate all cards for that exam.

## Database

Migration `drizzle/0010_flimsy_marvel_apes.sql` adds exams, exam_subjects, exam_registrations, exam_results and admit_cards. Each table has institution relationships, tenant indexes, timestamps and authorship. Database guards enforce registration scope, result limits, version changes and publication locks. Existing financial schema/data are unchanged.

## API

Tenant routes use `/api/campus/:slug` (or the existing authenticated institution context).

- GET/POST `/exams`; GET `/exams/:id`
- GET `/exams/:id/candidates` (50 per page)
- POST `/exams/:id/subjects`, `/register`, `/results`, `/status`
- POST `/exams/:id/admit`, `/revoke`; GET `/exams/:id/photo/:registrationId`
- Public GET `/api/exams/verify/:signedToken`
- Public verification page `/exam-verification/:signedToken`

Results and roster pages contain at most 25 candidates; changed grades are saved in atomic batches of at most 100. The existing signing key stays server-side. No new provider credentials are required.

## Validation

`node tests/exam-grading.mjs` checks decimal marks, thresholds, tied percentile ranks and overlapping schedules. `node tests/exams.mjs` uses disposable D1/R2 databases to verify school/nursery/PUC workflows, result locks, signed/revoked QR codes, tenant isolation and preservation of fee ledger balances. Production student data is never used by these tests.

Browser printing remains dependent on browser print settings; select A4 and disable browser headers/footers. Visual browser QA was unavailable in this environment.
