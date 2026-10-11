# Timetables, attendance and branding

Canonical platform origin: `https://erp.sohansoft.in`.

The supplied Sohan Soft Tech logo is bundled at `public/brand/sohan-logo.png`. The platform uses gold, charcoal and warm white. Institution settings retain independent name, logo and primary colour. Settings → Institution can upload a logo and save a colour. Platform → Institution → Edit retains the same branding controls. Navigation and dashboard chart accents inherit that institution's colour. Text contrast is selected automatically for light/dark brand colours. No institution is assigned another institution's branding.

## Academic workflow

1. Users & Roles: invite active Teachers. Grant the new Timetable/Attendance permissions to any existing custom staff profiles that should use them.
2. Timetable → Subjects & teaching assignments: add subjects and map each subject/section to an active teacher, room and required weekly period count.
3. Generate a draft: select weekdays and period start/end times. Generation uses bounded constraint search (maximum 300 lessons, 100 assignments, 50,000 search nodes). Impossible/incomplete schedules are rejected, never silently saved.
4. Drag lessons between days/periods or click a lesson to adjust its room/time. Keyboard users can select a lesson and use its edit dialog. Saves validate teacher, room and section overlap on the backend and database. Version checks prevent concurrent overwrites.
5. Publish: replaces the previously published timetable for that academic year atomically. Previous versions remain archived. Linked student/parent token portals can immediately fetch the published timetable; drafts never appear there. Configured email providers receive deduplicated guardian announcements through the existing durable notification queue. SMS/WhatsApp broadcasts are not sent using unregistered templates. Existing private links remain the parent access method; no new parent authentication is added.
6. Attendance → Section + Date: mark a student's morning status. Afternoon mirrors morning automatically. "Left early" requires a present/late morning plus a reason, records an absent afternoon and half-day flag. Saving is authoritative, atomic and version checked. This applies to Nursery and PUC as well as other sections. Closed academic years cannot be changed. Existing RFID event history and fee deductions are untouched.

Teachers can see only published schedules for their own teaching assignments/class section and mark attendance in those assigned sections. Administrators can manage their institution. Existing examinations remain available; the frontend plan mapping now maps examinations, timetable and attendance to the existing Academics plan module.

## Routes and tables

UI: `/campus/:slug/timetable`, `/campus/:slug/attendance`.

Tenant API prefix `/api/campus/:slug`:

- GET `/teaching?year=...`, POST `/teaching/subjects`, POST `/teaching/assignments`
- GET `/timetables?year=...&page=...`, POST `/timetables/generate`
- GET `/timetables/:id`, POST `/timetables/:id/slots`, POST `/timetables/:id/publish`
- GET `/attendance/setup?year=...`, GET `/attendance?year=...&section=...&date=...&page=...`, POST `/attendance`

Migration `0011_nifty_celestials.sql` adds teaching_subjects, teaching_assignments, timetables, timetable_slots and attendance_days. It adds tenant indexes, overlap/scope guards, publication locks, a unique published timetable per institution/year, linked attendance constraints and optimistic version guards. All financial data stays unchanged.

## Custom domains

`erp.sohansoft.in` remains the platform origin. Hosting reports its domain and SSL active. Institution default portals remain `/campus/:slug` on that origin.

Institution custom domains have two independent requirements:

1. Set the institution CNAME to **erp.sohansoft.in**.
2. Configure Cloudflare for SaaS in your own zone, a working fallback origin, and the server-only `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN` (zone-scoped SSL and Certificates edit permissions for Custom Hostnames).
3. In Domain Settings choose **Provision / Check Cloudflare**. This calls the Custom Hostnames API, records the real hostname ID, and shows Cloudflare's ownership/SSL TXT tokens. TXT names/values are provider-issued; they cannot all be the portal domain.
4. Add these records and recheck. Active requires Cloudflare hostname active, SSL active, and public CNAME resolving to erp.sohansoft.in. DNS alone never marks a domain active.
5. Keep the existing primary portal connection in place. A CNAME does not install an edge route or a certificate. Do not replace its hosting binding until a working Cloudflare fallback origin has been tested.
6. Legacy hosting-sync jobs cannot override Cloudflare-managed hostnames. Domain replacement deletes the old Cloudflare hostname before replacing the local binding. Permanent cleanup blocks until non-Cloudflare legacy bindings are disconnected by the hosting operator.

## Checks

`pnpm test:timetable` covers generation, conflicts, stale edits, publish visibility, linked half-day attendance, authenticated hosting synchronization, host tenant boundaries and brand contrast. SaaS, SMS authentication, examination, financial and advanced integration suites verify existing behaviour. Tests use disposable D1 databases and mocked DNS/provider/hosting data; no production student records are created or modified by tests.

Browser visual/drag-and-drop QA was unavailable in this environment; production build, API workflows and server/database protections were verified.
