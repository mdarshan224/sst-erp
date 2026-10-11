# Workspace navigation and performance

This is an incremental update of the existing ERP. URLs, authentication, fee
operations, database schema, tenant authorization and permissions are retained.

## Navigation

- `lib/browser-navigation.ts` uses Next-compatible native history for the retained
  workspace layout, with reactive pathname/search subscriptions and back/forward
  support. Dedicated server routes use the Next router. Destinations are validated
  as same-origin HTTP(S) URLs before push/replace.
- `app/(workspace)/layout.tsx` mounts `Entry` once for `/`, `/admin/...`, and
  `/campus/...`. The leaf pages are empty; `usePathname` drives the existing
  section registry inside the persistent workspace. Dedicated parent, trust and
  exam-verification routes retain their existing independent pages.
- `CampusLink` uses `next/link` for application sections, including keyboard and
  modified-click behavior. Downloads, API documents and external links retain
  native anchors. Sidebar links disable speculative RSC prefetching to avoid
  requesting every section before one is used.
- The campus path resolver avoids double-prefixing absolute campus routes and
  preserves platform, API and public portal destinations.
- Institution changes remount `CampusApp` by slug, replacing its private cache
  and restoring only that institution/user's stored academic filters.
- Authentication handoffs and sign-out still perform document navigation so
  authenticated state and cookies cannot survive an account change incorrectly.

## Data

- Campus and platform providers own independent memory-only GET caches (15-second
  TTL, maximum 80 entries). The exact endpoint and sorted query parameters form
  each key. No authenticated responses are cached at the CDN or in localStorage.
- Concurrent equivalent reads share an in-flight promise. Consumer cancellation
  does not abort another consumer. Bootstrap only deduplicates pending reads;
  successful bootstraps are not retained as a reusable permissions cache.
- Mutations and explicit refresh invalidate cached data. Late reads cannot
  repopulate invalidated entries; errors are never cached, and 401/403 clears the
  provider's complete cache. Financial POST idempotency remains in `api-client`.
- `useRequestResource` discards results after cleanup and never exposes rows from
  a different path, filter, revision or student during a pending read.
- Domain resolution runs once per workspace mount/retry, independently of
  section redirection. A session already obtained by Entry is reused during the
  initial platform redirect.
- Bootstrap, dashboard and student-profile independent SQL reads run concurrently.
  Ordinary student counts omit the financial aggregate view unless a balance
  predicate requires it. Existing tenant/year/student indexes remain in use;
  this update does not add duplicate indexes or alter financial calculations.

## Rendering

Platform and institution shells and platform section modules load lazily.
Skeletons remain inside the shared shell during section loads, with accessible
loading labels. Section transitions last 160ms and honor reduced-motion settings.
Mobile sidebars close after navigation. Virtual tables retain server pagination,
re-measure when the page/data changes, expose row counts and use bounded mobile
scroll containers. No page fetches all institution students or payment records.

## Verification

`pnpm test:navigation` tests query/hash destinations, blocked unsafe URLs, tenant
path scoping, retained academic filters, mounted workspace-history transitions and framework handoffs,
framework links versus document downloads, cache coalescing, cancellation,
expiry/eviction, mutation invalidation, error retry and separate workspace caches.

Run the existing financial, SaaS, OTP, architecture, advanced, examinations,
timetable and facilities suites against a current build for regression coverage.
Browser timing measurements require the supported browser QA environment; test
success is not a measured production latency guarantee.
