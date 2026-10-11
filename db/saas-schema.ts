import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { institutions, users } from "./schema";
const stamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
};
export const platformRoles = sqliteTable("platform_roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  permissions: text("permissions").notNull(),
  active: integer("active").notNull().default(1),
  ...stamps,
});
export const platformAdmins = sqliteTable("platform_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  active: integer("active").notNull().default(1),
  roleId: text("role_id").references(() => platformRoles.id),
  ...stamps,
});
export const plans = sqliteTable("saas_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  pricePaise: integer("price_paise").notNull(),
  billingCycle: text("billing_cycle").notNull(),
  studentLimit: integer("student_limit").notNull(),
  userLimit: integer("user_limit").notNull(),
  modules: text("modules").notNull(),
  status: text("status").notNull().default("Active"),
  ...stamps,
});
export const subscriptions = sqliteTable(
  "institution_subscriptions",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .unique()
      .references(() => institutions.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    studentLimit: integer("student_limit").notNull(),
    userLimit: integer("user_limit").notNull(),
    modules: text("modules").notNull(),
    ...stamps,
  },
  (t) => [index("subscription_expiry").on(t.status, t.endDate)],
);
export const domains = sqliteTable("institution_domains", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id")
    .notNull()
    .unique()
    .references(() => institutions.id),
  hostname: text("hostname").notNull().unique(),
  verificationToken: text("verification_token").notNull(),
  status: text("status").notNull().default("Pending Verification"),
  verificationStatus: text("verification_status")
    .notNull()
    .default("Pending Verification"),
  sslStatus: text("ssl_status").notNull().default("Pending Provisioning"),
  lastCheckedAt: text("last_checked_at"),
  dnsMessage: text("dns_message"),
  hostingId: text("hosting_id"),
  hostingStatus: text("hosting_status"),
  hostingRecords: text("hosting_records").notNull().default("[]"),
  hostingCheckedAt: text("hosting_checked_at"),
  hostingError: text("hosting_error"),
  ...stamps,
});
export const supportSessions = sqliteTable(
  "support_sessions",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    reason: text("reason").notNull(),
    expiresAt: text("expires_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("support_session_user").on(t.userId, t.institutionId, t.expiresAt),
  ],
);
export const platformAudit = sqliteTable(
  "platform_audit_logs",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").references(() => institutions.id),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("platform_audit_date").on(t.createdAt)],
);
export const subscriptionPayments = sqliteTable(
  "subscription_payments",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method").notNull(),
    reference: text("reference").notNull(),
    paidDate: text("paid_date").notNull(),
    notes: text("notes").notNull().default(""),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("subscription_payment_idempotency").on(
      t.institutionId,
      t.idempotencyKey,
    ),
    index("subscription_payment_date").on(t.paidDate),
  ],
);

export const deletionChallenges = sqliteTable(
  "institution_deletion_challenges",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    userId: text("user_id").notNull(),
    sessionHash: text("session_hash").notNull(),
    action: text("action").notNull(),
    otpHash: text("otp_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
);
export const deletionJobs = sqliteTable(
  "institution_deletion_jobs",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    status: text("status").notNull(),
    previousStatus: text("previous_status").notNull(),
    institutionName: text("institution_name").notNull(),
    snapshotKey: text("snapshot_key"),
    snapshotHash: text("snapshot_hash"),
    inventory: text("inventory").notNull(),
    cursor: integer("cursor").notNull().default(0),
    recoveryUntil: text("recovery_until").notNull(),
    error: text("error"),
    ...stamps,
  },
  (t) => [index("deletion_jobs_tenant_status").on(t.institutionId, t.status)],
);

export const billingOrders = sqliteTable(
  "billing_orders",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    planSnapshot: text("plan_snapshot").notNull(),
    subscriptionVersion: text("subscription_version").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    gateway: text("gateway").notNull(),
    gatewayOrderId: text("gateway_order_id"),
    gatewayTransactionId: text("gateway_transaction_id"),
    checkout: text("checkout"),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    paymentId: text("payment_id").references(() => subscriptionPayments.id),
    ...stamps,
  },
  (t) => [
    uniqueIndex("billing_request_key").on(t.institutionId, t.idempotencyKey),
    uniqueIndex("billing_gateway_order").on(t.gateway, t.gatewayOrderId),
    uniqueIndex("billing_gateway_transaction").on(
      t.gateway,
      t.gatewayTransactionId,
    ),
    index("billing_tenant_history").on(t.institutionId, t.createdAt),
  ],
);
export const billingEvents = sqliteTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    orderId: text("order_id")
      .notNull()
      .references(() => billingOrders.id),
    gateway: text("gateway").notNull(),
    eventId: text("event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("billing_event_key").on(t.gateway, t.eventId)],
);
export const billingPostings = sqliteTable(
  "billing_postings",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    orderId: text("order_id")
      .notNull()
      .references(() => billingOrders.id),
    account: text("account").notNull(),
    debitPaise: integer("debit_paise").notNull(),
    creditPaise: integer("credit_paise").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("billing_posting_account").on(t.orderId, t.account)],
);
