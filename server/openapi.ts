import { facilitiesPaths } from "./facilities-openapi";
import { advancedPaths } from "./advanced-openapi";
const error = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    message: { type: "string" },
    errorCode: { type: "string" },
    requestId: { type: "string" },
  },
};
const response = {
  description: "Successful operation",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object" },
          requestId: { type: "string" },
        },
      },
    },
  },
};
const op = (summary: string, tag: string, write = false) => ({
  summary,
  tags: [tag],
  security: [{ SmsSession: [] }],
  ...(write
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
      }
    : {}),
  responses: {
    "200": response,
    "401": { description: "Sign-in required" },
    "403": { description: "Role or tenant access denied" },
    "422": {
      description: "Validation failure",
      content: { "application/json": { schema: error } },
    },
  },
});
export const openApi = {
  openapi: "3.0.3",
  info: {
    title: "Sohan Soft Tech API",
    version: "3.0.0",
    description:
      "Authenticated, tenant-scoped APIs. Money is integer INR paise in responses and decimal strings in input. Browser identity is validated by the application session after SMS OTP verification. Institution routes are available under /api/campus/{slug}/ with the same fee endpoint suffixes. Legacy tenant APIs require X-Institution-ID and still enforce server authorization. Platform APIs require an independent platform-admin grant. SMS authentication is activated after the platform owner completes migration. Expiring signed guardian links use /parent-access/{token}; legacy parent-account routes remain retired. See docs/advanced-phase.md for webhook contracts and operational setup.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      SmsSession: {
        type: "apiKey",
        in: "cookie",
        name: "__Host-sohan_session",
        description:
          "Fast2SMS OTP verified server-side. Sessions use Secure HttpOnly cookies. Legacy identity headers are ignored after SMS activation.",
      },
    },
  },
  paths: {
    ...advancedPaths,
    ...facilitiesPaths,
    "/auth/send": {
      post: {
        ...op("Send a six-digit mobile OTP", "Authentication", true),
        security: [],
      },
    },
    "/auth/verify": {
      post: {
        ...op(
          "Verify challenge and issue secure session",
          "Authentication",
          true,
        ),
        security: [],
      },
    },
    "/auth/resend": {
      post: {
        ...op("Resend an active challenge", "Authentication", true),
        security: [],
      },
    },
    "/auth/logout": {
      post: op("Revoke current application session", "Authentication", true),
    },
    "/auth/configure": {
      post: op("Owner-only SMS setup and verification", "Authentication", true),
    },
    "/session": {
      get: op(
        "Resolve staff account, platform role and staff institutions",
        "Authentication",
      ),
    },
    "/portal/{slug}": {
      get: {
        ...op(
          "Public institution branding and default portal path",
          "Institutions",
        ),
        security: [],
      },
    },
    "/campus/{slug}/bootstrap": {
      get: op(
        "Resolve and authorize this institution portal; never fall back to another tenant",
        "Institutions",
      ),
    },
    "/platform/institutions/{id}": {
      get: op(
        "Institution details, usage, administrators and domain settings",
        "Platform",
      ),
      patch: op(
        "Edit institution, branding and lifecycle status",
        "Platform",
        true,
      ),
    },
    "/platform/institutions/{id}/support": {
      post: op(
        "Start an audited one-hour support session; secure cookie is user/tenant bound",
        "Platform",
        true,
      ),
    },
    "/platform/support": {
      post: op("End and invalidate support access", "Platform", true),
    },
    "/platform/plans": {
      get: op("List plan configuration", "Subscriptions"),
      post: op(
        "Create plan with exact INR price and module/seat limits",
        "Subscriptions",
        true,
      ),
    },
    "/platform/plans/{id}": {
      patch: op(
        "Edit plan without silently changing existing subscriptions",
        "Subscriptions",
        true,
      ),
    },
    "/platform/institutions/{id}/subscription": {
      patch: op(
        "Assign plan, dates, status, modules and limits; reject limits below usage",
        "Subscriptions",
        true,
      ),
    },
    "/platform/subscriptions": {
      get: op("Paginated institution subscriptions", "Subscriptions"),
    },
    "/platform/payments": {
      get: op("Subscription payment register", "Subscriptions"),
      post: op(
        "Idempotently record a confirmed subscription payment",
        "Subscriptions",
        true,
      ),
    },
    "/platform/domains": {
      get: op("Paginated custom-domain and SSL provisioning status", "Domains"),
    },
    "/platform/institutions/{id}/domain": {
      post: op(
        "Configure custom hostname and ownership token",
        "Domains",
        true,
      ),
    },
    "/platform/institutions/{id}/verify-domain": {
      post: op(
        "Verify TXT ownership and CNAME through public DNS; does not provision SSL",
        "Domains",
        true,
      ),
    },
    "/platform/usage": {
      get: op("Paginated tenant capacity and usage", "Platform"),
    },
    "/platform/audit": {
      get: op("Immutable platform and support access audit trail", "Audit"),
    },
    "/platform/settings": {
      get: op("Read platform settings", "Platform"),
      patch: op("Save platform settings", "Platform", true),
    },
    "/users/{id}": {
      patch: op(
        "Edit or disable institution staff; prevent self/last-admin changes",
        "Users",
        true,
      ),
    },
    "/users/{id}/reset-access": {
      post: op(
        "Reset institution access grant without changing SMS authentication",
        "Users",
        true,
      ),
    },
    "/invitations/{id}": {
      patch: op("Revoke pending staff access", "Users", true),
    },
    "/usage": {
      get: op(
        "Read this institution's seats, subscription and enabled modules",
        "Institutions",
      ),
    },

    "/platform/dashboard": {
      get: op("Platform institution, staff and subscription KPIs", "Platform"),
    },
    "/platform/institutions": {
      get: op("Search and paginate institutions (Super Admin)", "Platform"),
      post: op(
        "Create institution, academics and administrator mobile access grant atomically",
        "Platform",
        true,
      ),
    },
    "/platform/institutions/{id}/admins": {
      post: {
        ...op(
          "Grant an institution administrator access by registered staff email and mobile",
          "Platform",
          true,
        ),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    "/bootstrap": {
      get: op("Current user, membership and catalogs", "Authentication"),
    },
    "/students": {
      get: op("Search and paginate students", "Students"),
      post: op("Create student and parent association", "Students", true),
    },
    "/students/{id}": {
      get: {
        ...op("Student financial profile", "Students"),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
      patch: op("Update status or authorized clearance", "Students", true),
    },
    "/students/promote": {
      post: op("Promote without deleting prior enrollments", "Academic", true),
    },
    "/catalog/years": { post: op("Create academic year", "Academic", true) },
    "/catalog/classes": {
      post: op("Create class or program", "Academic", true),
    },
    "/catalog/sections": {
      post: op("Create section and stream mapping", "Academic", true),
    },
    "/catalog/parents": { post: op("Create guardian", "Parents", true) },
    "/catalog/structures": {
      post: op("Create fee structure and schedule", "Fees", true),
    },
    "/fees/assign": {
      post: op(
        "Assign fee structure and generate invoice atomically",
        "Fees",
        true,
      ),
    },
    "/fees/bulk": {
      post: op("Preview or commit class fee generation", "Fees", true),
    },
    "/fees/adjust": {
      post: op("Create immutable fee concession or adjustment", "Fees", true),
    },
    "/payments": {
      get: op("Payment register", "Payments"),
      post: op("Collect offline payment with idempotency", "Payments", true),
    },
    "/payments/gateways": {
      get: op("Available institution gateways without credentials", "Payments"),
    },
    "/payments/initiate": {
      post: op("Create server-side gateway order", "Payments", true),
    },
    "/payments/verify": {
      post: op(
        "Verify provider signature and captured status",
        "Payments",
        true,
      ),
    },
    "/payments/{id}/reconcile": {
      post: op(
        "Recheck a provider order without creating another charge",
        "Payments",
        true,
      ),
    },
    "/payments/webhook/cashfree": {
      post: {
        ...op(
          "Verify Cashfree raw-body HMAC and settle exactly once",
          "Payments",
          true,
        ),
        security: [],
      },
    },
    "/payments/webhook": {
      post: {
        ...op(
          "Validate raw Razorpay webhook and record once",
          "Payments",
          true,
        ),
        security: [],
        parameters: [
          {
            name: "X-Razorpay-Signature",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    "/refunds": {
      get: op("Refund requests", "Refunds"),
      post: op("Request authorized refund", "Refunds", true),
    },
    "/refunds/{id}/approve": {
      post: op(
        "Confirm money returned and post refund ledger",
        "Refunds",
        true,
      ),
    },
    "/reports/{report}": {
      get: op(
        "Collection, outstanding, defaulter and accounting reports",
        "Reports",
      ),
    },
    "/documents/{kind}/{id}": {
      get: op("Download PDF invoice or receipt", "Documents"),
    },
    "/notifications/process": {
      post: op(
        "Dispatch queued notifications through configured adapters",
        "Notifications",
        true,
      ),
    },
    "/users/invite": {
      post: op(
        "Grant staff access with role, granular permissions and optional teacher section",
        "Users",
        true,
      ),
    },
    "/settings": {
      patch: op("Update institution and financial policies", "Settings", true),
    },
    "/providers": {
      get: op("Configured provider status without secrets", "Settings"),
      post: op("Store encrypted provider credentials", "Settings", true),
    },
    "/imports": {
      post: op(
        "Validate, preview or atomically import spreadsheet data",
        "Imports",
        true,
      ),
    },
    "/audit": { get: op("Paginated immutable audit history", "Audit") },
  },
};

for (const [path, routes] of Object.entries(openApi.paths)) {
  const operation = (routes as any).post;
  if (
    operation &&
    /^\/(payments|refunds|fees|invoices|cash)(\/|$)/.test(path) &&
    !path.startsWith("/payments/webhook")
  ) {
    operation.parameters = [
      ...(operation.parameters || []),
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        description:
          "UUID for this operation. Reuse the same key and payload on retries. Changed payloads and incomplete concurrent requests return 409.",
        schema: { type: "string", format: "uuid" },
      },
    ];
    operation.responses["400"] = {
      description: "Missing or malformed Idempotency-Key",
    };
    operation.responses["409"] = {
      description:
        "Conflicting payload, financial conflict, or request awaiting completion",
    };
  }
}
(openApi.paths["/documents/{kind}/{id}"].get as any).parameters = [
  {
    name: "format",
    in: "query",
    schema: { type: "string", enum: ["a4", "thermal"], default: "a4" },
    description:
      "thermal produces an 80mm receipt. Unpaid A4 invoices include a UPI QR when the institution has configured its payee ID.",
  },
];
