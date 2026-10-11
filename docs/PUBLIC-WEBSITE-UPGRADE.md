# Standalone ERP website upgrade

## Scope
The existing application is preserved. The public root now serves a standalone ERP product website, with no public admin/institution sign-in links and no dependencies or links to the company website. Existing authenticated ERP and verified institution-host routes remain intact.

Pages: `/`, `/features`, `/communication`, `/pricing`, `/about`, `/contact`, `/policies/privacy`, `/policies/terms`, `/policies/refunds`, `/policies/delivery`. Sitemap and robots metadata include public pages and discourage indexing of private application paths (robots is not access control).

## Design and implementation
React 19 / the existing Next-compatible Vinext runtime, Next Link navigation, Lucide icons, CSS modules and GPU-composited CSS 3D transforms. No new frontend dependency, external font or WebGL engine. Reduced-motion support, mobile navigation, touch-size actions, labelled inputs, live feedback, error boundaries and loading skeletons. The 3D campus is an illustration, not a fictitious live dashboard. Communication examples explicitly identify custom workflows requiring configuration.

## Admin operation
Open `/admin/settings` directly. Under **Public website & enquiry inbox**, edit the name, headline, introduction, accent colour, legal entity, public email/phone/address/hours, pricing introduction and four policy texts. Website content is server-rendered from the saved settings. No HTML or scripts are accepted as executable content.

Enquiries are stored in the existing platform database and paginated in the same screen. Statuses: New, In progress, Closed. Read access requires `settings.view`; writes require `settings.manage`, enforced by the existing server permission layer. Writes are audited. The inbox does not automatically send email, SMS or WhatsApp.

The contact endpoint validates fields and consent, limits request bodies through the shared parser, checks origin/content type, applies rate limits and a honeypot, and atomically inserts a request reference plus enquiry. Same-content retries return the same reference; conflicting reuse is rejected. No secrets, tenant records or platform settings are exposed through the public form.

## Required merchant configuration
The supplied policy copy describes the implemented service; it does not guarantee merchant approval. Before gateway review, complete the registered business address, operational support phone/email/hours and confirm the legal entity against your merchant KYC. Review and publish your actual refund eligibility, cancellation/request deadlines, refund decision and processing timelines, activation schedule, subscription prices/taxes and implementation commitments. These details are not fabricated. The admin panel flags missing contact fields. Configure final policy text and written order terms to match your business.

Razorpay and Cashfree merchant activation, live credentials and gateway approval remain separate. Policy links appear beside the existing subscription checkout. Student-fee refunds remain the institution's responsibility. Public marketing pages do not create charges or user accounts.

References checked 2026-10-11:
- https://razorpay.com/terms/
- https://razorpay.com/blog/payment-gateway-compliance/
- https://www.cashfree.com/tnc
- https://www.cashfree.com/payment-pages/

## Verification
- TypeScript: passed.
- Production build: passed.
- New Worker-runtime website integration: 20 checks passed.
- Existing SaaS suite: 77 checks passed, including client navigation and custom-host root preservation. Homepage assertions updated for the explicitly requested removal of login/company links.
- Financial integration: 66 checks passed.
- Platform governance, OTP deletion and recovery: 16 checks passed.
- Subscription billing and infrastructure: 15 checks passed.
- Additional authentication and navigation/resource/body/money test results are recorded in RELEASE-VERIFICATION.txt.
- Targeted new-file lint: no errors; two Next image optimization warnings for the retained local logo.

Browser automation was unavailable in this managed environment. Mobile/device rendering, 3D visual appearance and real pointer interaction have not been visually verified. No claim of zero bugs or measured production performance improvement is made. Public route HTML and backend behavior were verified in the Worker runtime. No live messages or charges were sent; no production institution or financial data was changed.

No database migration is required. Website configuration and enquiry records use separate namespaced keys in the existing `platform` table. Deploying the previous source version restores the prior public UI without deleting enquiry records.

## Source archive
The complete ZIP contains tracked application source, migrations, public assets, tests and documentation. Credentials, local environments, production records, Git internals, build caches and installed dependencies are excluded. Install using the lockfile; follow README and the existing setup guides. `RELEASE-VERIFICATION.txt` identifies the release checks. This is the source package, not a live database backup.
