# Fee collection upgrade

This is an incremental update of the existing ERP. Existing fee structure/assignment, concessions, scholarships, installment schedules, late-fee policy, payment allocation, refunds, immutable journal, receipt PDFs, daily collection reports and defaulter queries are retained.

## Staff workflow

1. Choose institution and academic year. Configure/assign fees using the existing Fees module.
2. Open Collect Fees. Search by student name, admission number or guardian mobile. Review total/paid/outstanding/overdue amounts. Enter a partial amount and select an installment or oldest unpaid dues first.
3. Offline collections require confirmed funds; cheque receipts are issued only after authorized clearance. Configured Razorpay/Cashfree checkout is available for oldest-dues allocation. Secrets never reach the browser.
4. Payments → Check provider queries the existing provider order with institution credentials. It never creates or retries a charge. Pending/failed intents with a provider order can settle only after an exact INR amount match and confirmed capture/success. Unknown orders need supervisor review in the merchant dashboard.
5. Outstanding/Defaulters → select at most 50 rows → Remind selected. The selected academic year is used. Same-day identical reminders are deduplicated; settled accounts are skipped. SMS needs registered DLT template/consent. Delivery runs through configured providers/background processing; unconfigured providers leave messages queued.

## Gateway callbacks

- Razorpay: `https://erp.sohansoft.in/api/payments/webhook` (`payment.captured`, raw-body HMAC with institution webhook secret).
- Cashfree: `https://erp.sohansoft.in/api/payments/webhook/cashfree` (`PAYMENT_SUCCESS_WEBHOOK`, Base64 HMAC-SHA256 of timestamp + exact raw body with institution merchant secret).

Subscribe to matching events in each institution's merchant dashboard. Callback accessibility, merchant credentials and provider approval are deployment prerequisites. No production charge or real SMS is used in automated tests.

Cashfree unsuccessful attempt events are acknowledged without crediting the ledger or closing the entire order: a later attempt can succeed. Signed timestamps are validated structurally; durable event and transaction IDs handle delayed retries rather than rejecting delayed provider deliveries. Currency/order/payment amount must match the original intent. Gateway transaction/receipt uniqueness and atomic D1 batches prevent duplicate postings during concurrent callbacks and reconciliation. A different provider transaction on an already-settled order requires review instead of silent acceptance. Successful financial history is never rewritten.

## Database/API

Additive Drizzle migration `0014_conscious_domino.sql` adds `payment_status_scope(institution_id,academic_year_id,status,paid_at)`. It does not modify financial rows, ledger triggers or fee balances.

- `GET /api/payments/gateways`: permitted institution providers/mode only.
- `POST /api/payments/:id/reconcile`: `payments.manage`, UUID `Idempotency-Key`, server provider verification.
- Existing payment/refund mutation idempotency and tenant middleware remain in force.
- Bulk reminders accept optional `yearId` for compatibility. Without it the latest year is selected by start date, not UUID order.

Run `npm run test:fees` after the production bundle is built. It uses disposable D1/R2 and mocked providers to test forged/mismatched callbacks, concurrent callbacks/rechecks, exact paise balances, delayed settlement, auditor/tenant rejection, reminder retries and immutable journals. Existing integration, SaaS, refactor, advanced, navigation and module suites cover the retained workflows.
