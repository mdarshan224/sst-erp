# Facilities, merchant accounts and holidays

This updates the existing Sohan Soft Tech application at https://erp.sohansoft.in. Existing students, guardian contacts, fees, receipts, signed portal links, SMS authentication, merchant adapters and historical double-entry records are preserved. No production demo allocation or holiday is created by deployment.

## Setup and use

1. Institution Settings → Payment gateways: connect that institution's Razorpay key ID/secret/webhook secret or Cashfree app ID/secret. Pick the correct environment. Credentials are never displayed after saving. Gateway orders and capture verification continue to use the existing server-side adapter and idempotency rules.
2. Fees → Fee components: create/select Transport, Boarding and Mess components.
3. Transport → Vehicles: add registration, driver name/mobile and seat capacity. Create a route assigned to a vehicle, then boarding stops with distance and exact monthly rates. Allocate an enrolled student to a stop for dates inside an open academic year.
4. Hostel → Blocks → Rooms: enter bed capacity and boarding/mess component rates. Allocate a student to a numbered bed. The visual bed picker shows occupied beds for the selected dates; the database remains authoritative if availability changes before saving.
5. Saving an allocation generates the first invoice if its start date is due. Future allocations wait until their start date. Fees are full calendar-month charges, including the first partial month; no automatic daily proration. Existing invoices remain payable after an allocation ends. To change rates or locations, end the old allocation and create a new one with the agreed rates. Financial corrections use the existing adjustment/reversal workflow.
6. The existing daily financial writer generates subsequent monthly invoices in bounded batches, returning `facilityInvoices` and `hasMore`. Administrators can also use Generate due monthly invoices. Each allocation/calendar-month pair is unique; retries and concurrent runs cannot double-charge.
7. Platform → Holidays creates all-institution national holidays or events scoped to a selected institution. Institution → Holidays creates local events and term breaks. Date ranges are inclusive, interpreted as Asia/Kolkata local calendar dates.
8. On holidays the attendance grid says "not required" and disables editing. The backend and database reject new routine attendance writes for those dates. Existing attendance is still readable. Timetable → Daily class expectations shows zero lessons for a holiday while retaining the weekly published template. Existing signed student/guardian links also show today's holiday notice. Cancellation restores normal daily expectations and is audited.

Fixed monthly facility charges are not prorated for holidays. Existing hardware punch history is preserved; the separately configured RFID per-punch fee policy is unchanged. No funds are automatically deducted by a facility allocation; it creates a receivable collected through the existing payment and receipt flow.

## Storage and security

Migration `drizzle/0012_black_vulcan.sql` adds `institutions.razorpay_credentials` and `institutions.cashfree_credentials`: AES-256-GCM encrypted configuration envelopes containing merchant ID, secret and (where relevant) webhook secret. Encryption AAD includes the institution ID and provider. The existing `PROVIDER_ENCRYPTION_KEY` remains the server-only master encryption key, not a merchant credential.

The migration copies existing encrypted gateway envelopes from `provider_configs` without decrypting or changing their tenant binding, then clears the legacy merchant ciphertext. Provider metadata and notification-provider encrypted configuration remain in `provider_configs`. All institution API projections exclude the credential columns. Global merchant environment-variable fallbacks are removed; an unconfigured school fails closed rather than using another account.

New normalized tables: `transport_vehicles`, `transport_routes`, `transport_stops`, `hostel_blocks`, `hostel_rooms`, `facility_allocations`, `facility_billings`, and `holidays`. Tenant entities have institution relationships and tenant indexes. Global holidays deliberately have a nullable institution ID and are manageable only by platform administrators. Scoped joins and database triggers enforce relationship tenancy, enrollment/year boundaries, immutable agreed charges, vehicle capacity, bed exclusivity, overlapping student allocations and unique billing periods. Invoices, fee assignments, installments, invoice items, ledger entries, journal legs and monthly billing records are committed atomically.

New operational permissions are `facilities.view` and `facilities.manage`; neither is granted to teachers, cashiers or accountants by default. Institution administrators receive both; custom staff can receive explicit grants. Allocation creation additionally requires `fees.invoice`. Manual recurrence requires administration and invoice authority. Institution facility pages are included in the existing Academics subscription module; fee collection permissions remain separate.

## Routes

Institution UI: `/campus/{slug}/transport`, `/hostel`, `/holidays` under the same campus prefix. Platform UI: `/admin/holidays`. Existing Settings → Payment gateways is reused.

Institution API suffixes (also available under `/api/campus/{slug}/`):

- `GET /api/facilities?catalog=vehicles|routes|stops|blocks|rooms&page=1`: 50 catalogue records per page.
- `GET /api/facilities?kind=Transport|Hostel&year={yearId}&page=1`: 50 allocations per page.
- `POST /api/facilities/{catalog}`: validated catalogue creation.
- `POST /api/facilities/allocations`: `{kind,studentId,yearId,stopId? ,roomId?,bedNumber?,startDate,endDate}`.
- `POST /api/facilities/allocations/{id}/end`: ends future billing; retains all historical records.
- `GET /api/facilities/rooms/{id}/beds?from=YYYY-MM-DD&to=YYYY-MM-DD`: bounded numbered-bed availability.
- `POST /api/facilities/bill`: one bounded due-invoice batch.
- `GET /api/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1`: 100 holidays per page.
- `POST /api/holidays`: `{name,kind,startDate,endDate}`; own institution only.
- `POST /api/holidays/{id}/cancel`: institution-local event cancellation.
- `GET/POST /api/platform/holidays`: platform calendar/create; `institutionId:null` means all institutions.
- `POST /api/platform/holidays/{id}/cancel`: audited platform cancellation.
- Existing timetable detail accepts `?date=YYYY-MM-DD` and returns `holidays`, `required`, and `expectedSlots` in addition to the unchanged weekly `slots`.

All facility POST requests require a UUID `Idempotency-Key` header. Money is integer paise; UI accepts INR decimal amounts. No new payment gateway account is created or provisioned. Schools must configure their own merchant dashboard webhook using the existing institution webhook route and matching secret.

## Validation

Run a production build first, then `pnpm test:facilities`. All tests use isolated Miniflare D1 storage, mocked third parties and fixture identities. This covers encrypted credential migration/redaction, tenant-bound decryption, monthly billing, concurrency, capacity conflicts, immutable history, holidays and tenant/RBAC boundaries. Existing fee, advanced payment/webhook, SMS, SaaS and timetable suites remain available. These tests never send real SMS or collect real money.

The existing hosting, HTTPS domain and daily maintenance mechanism are reused. Recurrence requires the deployed financial maintenance writer to keep running. Additional custom domain provisioning follows the already documented hosting-control-plane workflow and is not altered here.
