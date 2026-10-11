# Platform governance and institution deletion

This incremental migration retains existing institutions, tenant permissions,
SMS login, fee calculations, immutable ledgers and receipts. Migration 0013 adds
platform_roles, platform_admins.role_id, institution_deletion_challenges and
institution_deletion_jobs. Existing platform administrators receive an explicit
legacy role; the primary owner always has full platform access. New administrators
receive only their selected role. Disabled roles immediately lose server access.
Only the primary owner can configure roles or administrator credentials.

Routes: `/admin/roles`, `/admin/cleanup`, `/admin/institutions/:id` (deletion card).
APIs: `/api/platform/roles`, `/administrators`, `/cleanup`, and
`/institutions/:id/deletion/{challenge,request,restore,finalize,resume}` under
`/api/platform`. Every platform route is permission checked; support cookies are
rechecked against the current support permission. Deleted/quarantined tenants are
blocked before support access and at the database write layer.

Cleanup preview does not delete anything. Test provenance is a review aid, never
permission to delete production records. The name, second-warning checkbox and
fresh OTP must be provided for each request, restore and finalization. Security
codes are separate from login OTPs, cryptographically generated, hashed, bound to
user/session/tenant/action, five-minute expiry, five attempts, sixty-second resend
cooldown and three requests/minute. OTPs and provider credentials are never logged.

Deletion first quarantines a tenant for seven days, preserving all data. Restoration
during quarantine requires another fresh OTP and restores the previous status.
Permanent cleanup requires the complete window and another fresh OTP. It performs
bounded child-first batches with a compare-and-swap lease and transactional D1
batch/audit/checkpoint writes. Each batch is AES-GCM encrypted and verified in R2
before deletion. Interrupted jobs resume after the ten-minute abandoned-lease
window; the resume endpoint never starts an unauthorized purge.

Immutable financial, academic and audit history and their FK ancestor tables are
retained conservatively, including referenced student identities. The preview
lists exact retained table counts. This is permanent **operational** cleanup, not
an assertion that every row has been erased. The institution becomes a scrubbed,
inaccessible tombstone; global accounts shared with other campuses remain intact.
Receipts and donation certificates remain protected. Other tenant objects are
archived then removed. Merchant credentials, settings, contacts and branding are
scrubbed; Cloudflare domains are removed. Legacy externally managed domains block
completion until the hosting operator disconnects them. Statutory history and
recovery archives have no automatic purge until a reviewed retention policy exists.

Recovery after a partial purge is an operator procedure: keep the tenant locked,
verify recovery manifests and decrypt them with the original encryption key and
job ID as AES-GCM additional data; restore parent rows before child rows into an
isolated database first. Validate financial invariants, FK checks and tenant scope
before any production restore. Automatic reopening of partially purged tenants is
intentionally rejected. Never drop immutable triggers or destroy the encryption
key while recovery data exists. Original institution details, deleted row batches
and deleted object payloads are stored in the protected recovery prefix. Recovery
objects are not served by any public API.

Run `node tests/platform-governance.mjs` against a fresh build for migration,
permission revocation, lockout, expiry, confirmation, quarantine restoration,
interrupted lease recovery, archived deletion, immutable history and tenant tests.
Run the existing integration suites for financial and ERP regressions. Browser QA
was unavailable in the managed environment; no measured browser-latency claim is made.
