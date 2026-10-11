import { z } from "zod";
import { parseMoney } from "../lib/money";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  stamps,
  stmt,
  today,
  uuid,
} from "./db";
import {
  Actor,
  ApiError,
  constantEqual,
  hmac,
  permitPlatform,
  sha256,
} from "./security";
import { openPlatformConfig, sealPlatformConfig } from "./providers";
import { platformAudit, tenantSubscription, tenantUsage } from "./tenancy";
import { validateIdempotencyKey } from "./idempotency";
type Gateway = "Razorpay" | "Cashfree";
type Config = {
  enabled: boolean;
  mode: "test" | "production";
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  testInstitutionCodes: string[];
};
const configKey = (gateway: Gateway) => "billing:" + gateway;
export async function billingConfig(gateway: Gateway) {
  return openPlatformConfig<Config>(configKey(gateway));
}
export async function billingGatewaySettings(
  actor: Actor,
  method: string,
  body: unknown,
) {
  permitPlatform(actor, "payments.configure");
  if (method === "GET")
    return {
      providers: await Promise.all(
        (["Razorpay", "Cashfree"] as Gateway[]).map(async (provider) => {
          const c = await billingConfig(provider);
          return {
            provider,
            enabled: c?.enabled || false,
            mode: c?.mode || "test",
            keyId: c?.keyId || "",
            testInstitutionCodes: c?.testInstitutionCodes || [
              "CL-TEST",
              "GV-TEST",
            ],
            configured: !!c?.keySecret,
            webhookSecretConfigured: !!c?.webhookSecret,
          };
        }),
      ),
    };
  const d = z
    .object({
      provider: z.enum(["Razorpay", "Cashfree"]),
      enabled: z.boolean(),
      mode: z.enum(["test", "production"]),
      keyId: z.string().trim().min(1).max(200),
      keySecret: z.string().trim().min(8).max(500).optional(),
      webhookSecret: z.string().trim().min(8).max(500).optional(),
      testInstitutionCodes: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(40)
            .transform((v) => v.toUpperCase()),
        )
        .max(50)
        .optional(),
    })
    .parse(body);
  const old = await billingConfig(d.provider);
  const c: Config = {
    enabled: d.enabled,
    mode: d.mode,
    keyId: d.keyId,
    keySecret: d.keySecret || old?.keySecret || "",
    webhookSecret: d.webhookSecret || old?.webhookSecret,
    testInstitutionCodes: d.testInstitutionCodes ||
      old?.testInstitutionCodes || ["CL-TEST", "GV-TEST"],
  };
  if (
    !c.keySecret ||
    (c.enabled && d.provider === "Razorpay" && !c.webhookSecret)
  )
    throw new ApiError(
      422,
      "KEY_REQUIRED",
      "Enter the merchant secret and, for Razorpay, a webhook secret before enabling payments.",
    );
  await batch([
    stmt(
      "INSERT INTO platform(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [
        "secret:" + configKey(d.provider),
        await sealPlatformConfig(configKey(d.provider), c),
      ],
    ),
    platformAudit(
      actor,
      "Updated platform subscription gateway",
      "platform",
      d.provider,
      null,
      {
        enabled: c.enabled,
        mode: c.mode,
        keyId: c.keyId,
        testInstitutionCodes: c.testInstitutionCodes,
      },
    ),
  ]);
  return { saved: true };
}
function admin(actor: Actor) {
  if (actor.role !== "INSTITUTION_ADMIN" || actor.supportSessionId)
    throw new ApiError(
      403,
      "BILLING_ADMIN_REQUIRED",
      "Only the institution administrator can purchase subscriptions. Support access cannot make purchases.",
    );
}
async function config(g: Gateway, create = false) {
  const c = await billingConfig(g);
  if (!c || (create && !c.enabled))
    throw new ApiError(
      503,
      "BILLING_GATEWAY_UNAVAILABLE",
      "This subscription payment provider is not enabled.",
    );
  return c;
}
async function providerFetch(
  g: Gateway,
  c: Config,
  path: string,
  body?: unknown,
  id?: string,
): Promise<Row> {
  const origin =
    g === "Razorpay"
      ? "https://api.razorpay.com/v1"
      : c.mode === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";
  const headers: Record<string, string> =
    g === "Razorpay"
      ? { Authorization: "Basic " + btoa(c.keyId + ":" + c.keySecret) }
      : {
          "x-client-id": c.keyId,
          "x-client-secret": c.keySecret,
          "x-api-version": "2025-01-01",
          ...(id ? { "x-idempotency-key": id } : {}),
        };
  try {
    const r = await fetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: { ...headers, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    throw new ApiError(
      502,
      "BILLING_PROVIDER_UNAVAILABLE",
      "The provider could not confirm this request. Check the pending subscription order before retrying.",
    );
  }
}
async function owned(actor: Actor, id: string) {
  admin(actor);
  const row = await one(
    "SELECT * FROM billing_orders WHERE id=? AND institution_id=?",
    [id, actor.institutionId],
  );
  if (!row)
    throw new ApiError(404, "NOT_FOUND", "Subscription order not found.");
  return row;
}
export async function billingSummary(actor: Actor) {
  admin(actor);
  const institution = await one(
    "SELECT institution_code FROM institutions WHERE id=?",
    [actor.institutionId],
  );
  const settings = await Promise.all(
    (["Razorpay", "Cashfree"] as Gateway[]).map(async (g) => {
      const c = await billingConfig(g);
      return c?.enabled &&
        (c.mode === "production" ||
          c.testInstitutionCodes.includes(
            String(institution?.institution_code).toUpperCase(),
          ))
        ? { provider: g, mode: c.mode }
        : null;
    }),
  );
  return {
    subscription: await tenantSubscription(actor.institutionId),
    usage: await tenantUsage(actor.institutionId),
    plans: await all(
      "SELECT * FROM saas_plans WHERE status='Active' AND price_paise>0 ORDER BY price_paise",
    ),
    gateways: settings.filter(Boolean),
    orders: await all(
      "SELECT id,gateway,status,amount_paise,created_at,payment_id FROM billing_orders WHERE institution_id=? ORDER BY created_at DESC LIMIT 30",
      [actor.institutionId],
    ),
    payments: await all(
      "SELECT id,amount_paise,method,reference,paid_date FROM subscription_payments WHERE institution_id=? ORDER BY paid_date DESC LIMIT 30",
      [actor.institutionId],
    ),
    checkoutOrigin: "https://erp.sohansoft.in",
  };
}
function endDate(start: string, cycle: string) {
  const [y, m, d] = start.split("-").map(Number);
  const months = cycle === "Annual" ? 12 : cycle === "Quarterly" ? 3 : 1;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const max = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, max));
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}
export async function createBillingOrder(actor: Actor, body: unknown) {
  admin(actor);
  const d = z
    .object({
      planId: z.string(),
      gateway: z.enum(["Razorpay", "Cashfree"]),
      idempotencyKey: z.string().uuid(),
    })
    .parse(body);
  validateIdempotencyKey(actor.request.headers.get("Idempotency-Key"));
  if (actor.request.headers.get("Idempotency-Key") !== d.idempotencyKey)
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Header and request keys must match.",
    );
  const hash = await sha256(JSON.stringify([d.planId, d.gateway]));
  const old = await one(
    "SELECT * FROM billing_orders WHERE institution_id=? AND idempotency_key=?",
    [actor.institutionId, d.idempotencyKey],
  );
  if (old) {
    if (old.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This key was used for another subscription purchase.",
      );
    return resumeOrder(actor, old.id);
  }
  const pending = await one(
    "SELECT id FROM billing_orders WHERE institution_id=? AND status IN ('Initiated','Processing')",
    [actor.institutionId],
  );
  if (pending)
    throw new ApiError(
      409,
      "SUBSCRIPTION_PAYMENT_PENDING",
      "An existing order needs confirmation. Resume or check that order before another purchase.",
    );
  const plan = await one(
    "SELECT * FROM saas_plans WHERE id=? AND status='Active' AND price_paise>0",
    [d.planId],
  );
  if (!plan)
    throw new ApiError(
      422,
      "PLAN_UNAVAILABLE",
      "Select an active paid subscription plan.",
    );
  const sub = await tenantSubscription(actor.institutionId),
    usage = await tenantUsage(actor.institutionId);
  if (
    usage.students > plan.student_limit ||
    usage.users + usage.pendingUsers > plan.user_limit
  )
    throw new ApiError(
      409,
      "PLAN_USAGE_EXCEEDED",
      "Current usage exceeds this plan's limits.",
    );
  const c = await config(d.gateway, true),
    id = uuid();
  const institution = await one(
    "SELECT phone,email,name,status,institution_code FROM institutions WHERE id=?",
    [actor.institutionId],
  );
  if (institution?.status !== "Active")
    throw new ApiError(
      403,
      "INSTITUTION_INACTIVE",
      "Contact platform support to reactivate this institution.",
    );
  if (
    c.mode === "test" &&
    !c.testInstitutionCodes.includes(
      String(institution.institution_code).toUpperCase(),
    )
  )
    throw new ApiError(
      403,
      "TEST_PAYMENT_RESTRICTED",
      "Sandbox checkout is restricted to the test institution codes configured by the platform administrator.",
    );
  if (
    d.gateway === "Cashfree" &&
    !/^[6-9]\d{9}$/.test(String(institution.phone || "").replace(/^\+91/, ""))
  )
    throw new ApiError(
      422,
      "MOBILE_REQUIRED",
      "Save a valid institution mobile number in Settings for Cashfree checkout.",
    );
  const start =
    sub.plan_id === plan.id &&
    sub.effectiveStatus === "Active" &&
    sub.end_date >= today()
      ? new Date(Date.parse(sub.end_date) + 86400000).toISOString().slice(0, 10)
      : today();
  const snapshot = {
    ...plan,
    gatewayMode: c.mode,
    startDate: start,
    effectiveStartDate:
      sub.plan_id === plan.id && sub.effectiveStatus === "Active"
        ? sub.start_date
        : start,
    endDate: endDate(start, plan.billing_cycle),
  };
  try {
    await batch([
      insert("billing_orders", {
        id,
        institution_id: actor.institutionId,
        subscription_id: sub.id,
        plan_id: plan.id,
        plan_snapshot: JSON.stringify(snapshot),
        subscription_version: sub.updated_at,
        amount_paise: plan.price_paise,
        gateway: d.gateway,
        gateway_order_id: d.gateway === "Cashfree" ? id : null,
        status: "Initiated",
        idempotency_key: d.idempotencyKey,
        request_hash: hash,
        ...stamps(actor.userId),
      }),
      platformAudit(
        actor,
        "Started subscription checkout",
        "billing_orders",
        id,
        null,
        { gateway: d.gateway, planId: plan.id, amountPaise: plan.price_paise },
        actor.institutionId,
      ),
    ]);
  } catch (error) {
    const winner = await one(
      "SELECT * FROM billing_orders WHERE institution_id=? AND idempotency_key=?",
      [actor.institutionId, d.idempotencyKey],
    );
    if (winner && winner.request_hash === hash)
      return resumeOrder(actor, winner.id);
    const pending = await one(
      "SELECT id FROM billing_orders WHERE institution_id=? AND status IN ('Initiated','Processing')",
      [actor.institutionId],
    );
    if (pending)
      throw new ApiError(
        409,
        "SUBSCRIPTION_PAYMENT_PENDING",
        "An existing order needs confirmation before another purchase.",
      );
    throw error;
  }
  const result =
    d.gateway === "Razorpay"
      ? await providerFetch(d.gateway, c, "/orders", {
          amount: plan.price_paise,
          currency: "INR",
          receipt: id,
          notes: { billing_order_id: id, institution_id: actor.institutionId },
        })
      : await providerFetch(
          d.gateway,
          c,
          "/orders",
          {
            order_id: id,
            order_amount: plan.price_paise / 100,
            order_currency: "INR",
            customer_details: {
              customer_id: actor.institutionId,
              customer_phone: String(institution.phone).replace(/^\+91/, ""),
              customer_email: institution.email || actor.email,
            },
            order_meta: {
              return_url:
                "https://erp.sohansoft.in/campus/" +
                (await one("SELECT slug FROM institutions WHERE id=?", [
                  actor.institutionId,
                ]))!.slug +
                "/billing",
            },
          },
          id,
        );
  const checkout = {
    paymentId: id,
    gateway: d.gateway,
    id: d.gateway === "Razorpay" ? result.id : result.order_id,
    amount: plan.price_paise,
    keyId: d.gateway === "Razorpay" ? c.keyId : undefined,
    sessionId: result.payment_session_id,
    mode: c.mode === "production" ? "production" : "sandbox",
  };
  await batch([
    stmt(
      "UPDATE billing_orders SET gateway_order_id=?,checkout=?,updated_at=? WHERE id=? AND institution_id=?",
      [checkout.id, JSON.stringify(checkout), now(), id, actor.institutionId],
    ),
  ]);
  return checkout;
}
export async function resumeOrder(actor: Actor, id: string) {
  const o = await owned(actor, id);
  if (o.status === "Successful") return { paymentId: o.id, settled: true };
  if (o.checkout) return JSON.parse(o.checkout);
  if (o.gateway === "Cashfree" && o.gateway_order_id) {
    const c = await config("Cashfree");
    const p = await providerFetch(
      "Cashfree",
      c,
      "/orders/" + encodeURIComponent(o.gateway_order_id),
    );
    if (p.payment_session_id)
      return {
        paymentId: o.id,
        gateway: "Cashfree",
        id: o.gateway_order_id,
        amount: o.amount_paise,
        sessionId: p.payment_session_id,
        mode: c.mode === "production" ? "production" : "sandbox",
      };
  }
  throw new ApiError(
    409,
    "ORDER_NEEDS_REVIEW",
    "The provider response was interrupted. Review this order in the merchant dashboard before a new purchase.",
  );
}
async function settle(
  o: Row,
  transactionId: string,
  actor: Actor,
  event?: D1PreparedStatement,
) {
  const current = await one("SELECT * FROM billing_orders WHERE id=?", [o.id]);
  if (current?.status === "Successful") {
    if (current.gateway_transaction_id !== transactionId)
      throw new ApiError(
        409,
        "TRANSACTION_CONFLICT",
        "A different transaction settled this subscription order.",
      );
    return { settled: true, paymentId: current.payment_id, duplicate: true };
  }
  const p = JSON.parse(o.plan_snapshot),
    paymentId = uuid();
  try {
    await batch([
      insert("subscription_payments", {
        id: paymentId,
        institution_id: o.institution_id,
        subscription_id: o.subscription_id,
        amount_paise: o.amount_paise,
        method: o.gateway,
        reference: transactionId,
        paid_date: today(),
        notes: "Subscription plan: " + p.name,
        idempotency_key: "online:" + o.id,
        request_hash: o.request_hash,
        ...stamps(actor.userId),
      }),
      stmt(
        "UPDATE billing_orders SET status='Successful',gateway_transaction_id=?,payment_id=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=? AND status IN ('Initiated','Processing')",
        [transactionId, paymentId, now(), actor.userId, o.id, o.institution_id],
      ),
      ...[
        {
          account: "Gateway Clearing",
          debit_paise: o.amount_paise,
          credit_paise: 0,
        },
        {
          account: "Deferred Subscription Revenue",
          debit_paise: 0,
          credit_paise: o.amount_paise,
        },
      ].map((v) =>
        insert("billing_postings", {
          id: uuid(),
          institution_id: o.institution_id,
          order_id: o.id,
          ...v,
          created_at: now(),
        }),
      ),
      stmt(
        "UPDATE institution_subscriptions SET plan_id=?,status='Active',start_date=?,end_date=?,student_limit=?,user_limit=?,modules=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=? AND updated_at=?",
        [
          o.plan_id,
          p.effectiveStartDate,
          p.endDate,
          p.student_limit,
          p.user_limit,
          p.modules,
          now(),
          actor.userId,
          o.subscription_id,
          o.institution_id,
          o.subscription_version,
        ],
      ),
      // Database guard below verifies that the subscription update applied and both
      // ledger legs and receipt exist before the transaction can commit.
      stmt(
        "UPDATE institutions SET subscription='Active',updated_at=? WHERE id=? AND status='Active'",
        [now(), o.institution_id],
      ),
      ...(event ? [event] : []),
      platformAudit(
        actor,
        "Verified subscription payment and activated plan",
        "billing_orders",
        o.id,
        null,
        {
          planId: o.plan_id,
          paymentId,
          transactionId,
          amountPaise: o.amount_paise,
        },
        o.institution_id,
      ),
      stmt("UPDATE billing_orders SET status='Successful' WHERE id=?", [o.id]),
    ]);
  } catch (e) {
    const winner = await one(
      "SELECT * FROM billing_orders WHERE id=? AND status='Successful' AND gateway_transaction_id=?",
      [o.id, transactionId],
    );
    if (winner)
      return { settled: true, paymentId: winner.payment_id, duplicate: true };
    if (String(e).includes("BILLING_SETTLEMENT_CONFLICT"))
      throw new ApiError(
        409,
        "SUBSCRIPTION_CHANGED",
        "Subscription settings changed during checkout. Contact platform support to reconcile the received funds; no plan or financial history was overwritten.",
      );
    throw e;
  }
  return { settled: true, paymentId };
}
export async function verifyBillingOrder(
  actor: Actor,
  id: string,
  body: Row,
  recheck = false,
) {
  const o = await owned(actor, id);
  const g = o.gateway as Gateway,
    c = await config(g);
  if (o.status === "Successful")
    return { settled: true, paymentId: o.payment_id, duplicate: true };
  if (!o.gateway_order_id)
    throw new ApiError(
      409,
      "ORDER_NEEDS_REVIEW",
      "No provider order is available for automatic reconciliation.",
    );
  let txn: string | undefined;
  if (g === "Razorpay") {
    if (
      !recheck &&
      (!body.razorpay_payment_id ||
        body.razorpay_order_id !== o.gateway_order_id ||
        !constantEqual(
          await hmac(
            c.keySecret,
            o.gateway_order_id + "|" + body.razorpay_payment_id,
          ),
          body.razorpay_signature || "",
        ))
    )
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Checkout signature verification failed.",
      );
    const list = recheck
      ? (
          await providerFetch(
            g,
            c,
            "/orders/" + encodeURIComponent(o.gateway_order_id) + "/payments",
          )
        ).items
      : [
          await providerFetch(
            g,
            c,
            "/payments/" + encodeURIComponent(body.razorpay_payment_id),
          ),
        ];
    txn = list?.find(
      (p: Row) =>
        p.status === "captured" &&
        p.order_id === o.gateway_order_id &&
        p.amount === o.amount_paise &&
        p.currency === "INR",
    )?.id;
  } else {
    const list = await providerFetch(
      g,
      c,
      "/orders/" + encodeURIComponent(o.gateway_order_id) + "/payments",
    );
    txn = (list as unknown as Row[])
      .find(
        (p) =>
          p.payment_status === "SUCCESS" &&
          p.payment_currency === "INR" &&
          parseMoney(String(p.payment_amount)) === o.amount_paise,
      )
      ?.cf_payment_id?.toString();
  }
  if (!txn)
    throw new ApiError(
      409,
      "PAYMENT_NOT_CAPTURED",
      "The provider has not confirmed a matching payment. Your subscription remains unchanged.",
    );
  return settle(o, txn, actor);
}
export async function billingWebhook(request: Request, g: Gateway) {
  const raw = await request.text();
  if (raw.length > 128000)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Webhook is too large.");
  let e: Row;
  try {
    e = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Invalid webhook JSON.");
  }
  if (!e || typeof e !== "object")
    throw new ApiError(400, "INVALID_WEBHOOK", "Invalid event.");
  const c = await config(g);
  let expected: string, received: string;
  if (g === "Razorpay") {
    expected = await hmac(c.webhookSecret || "", raw);
    received = request.headers.get("x-razorpay-signature") || "";
    if (!c.webhookSecret)
      throw new ApiError(
        503,
        "WEBHOOK_NOT_CONFIGURED",
        "Webhook secret is missing.",
      );
  } else {
    const t = request.headers.get("x-webhook-timestamp") || "";
    if (!/^\d{13}$/.test(t))
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Invalid webhook timestamp.",
      );
    const hex = await hmac(c.keySecret, t + raw);
    expected = btoa(
      String.fromCharCode(...hex.match(/../g)!.map((v) => parseInt(v, 16))),
    );
    received = request.headers.get("x-webhook-signature") || "";
  }
  if (!constantEqual(expected, received))
    throw new ApiError(
      400,
      "INVALID_SIGNATURE",
      "Webhook signature verification failed.",
    );
  const entity =
      g === "Razorpay" ? e.payload?.payment?.entity : e.data?.payment,
    orderId = g === "Razorpay" ? entity?.order_id : e.data?.order?.order_id;
  if (typeof orderId !== "string")
    throw new ApiError(400, "INVALID_WEBHOOK", "Order ID is required.");
  const o = await one(
    "SELECT * FROM billing_orders WHERE gateway=? AND gateway_order_id=?",
    [g, orderId],
  );
  if (!o) return { received: true, ignored: true };
  if (
    g === "Razorpay"
      ? e.event !== "payment.captured"
      : e.type !== "PAYMENT_SUCCESS_WEBHOOK"
  )
    return { received: true, ignored: true };
  const txn = String(g === "Razorpay" ? entity.id : entity.cf_payment_id);
  if (
    !txn ||
    txn === "undefined" ||
    (g === "Razorpay"
      ? entity.status !== "captured" ||
        entity.amount !== o.amount_paise ||
        entity.currency !== "INR"
      : entity.payment_status !== "SUCCESS" ||
        parseMoney(String(entity.payment_amount)) !== o.amount_paise ||
        entity.payment_currency !== "INR" ||
        e.data.order.order_currency !== "INR" ||
        parseMoney(String(e.data.order.order_amount)) !== o.amount_paise)
  )
    throw new ApiError(
      422,
      "PAYMENT_MISMATCH",
      "Webhook payment does not match the subscription demand.",
    );
  const eventId =
      g === "Razorpay"
        ? request.headers.get("x-razorpay-event-id") || "captured:" + txn
        : "success:" + txn,
    hash = await sha256(raw);
  const seen = await one(
    "SELECT * FROM billing_events WHERE gateway=? AND event_id=?",
    [g, eventId],
  );
  if (seen) {
    if (seen.payload_hash !== hash || seen.order_id !== o.id)
      throw new ApiError(
        409,
        "EVENT_CONFLICT",
        "Webhook differs from the original event.",
      );
    return { received: true, duplicate: true };
  }
  const actor: Actor = {
    userId: "gateway:" + g,
    name: g + " subscription webhook",
    email: "",
    role: "INSTITUTION_ADMIN",
    institutionId: o.institution_id,
    feeVisibility: false,
    request,
  };
  const event = insert("billing_events", {
    id: uuid(),
    institution_id: o.institution_id,
    order_id: o.id,
    gateway: g,
    event_id: eventId,
    payload_hash: hash,
    created_at: now(),
  });
  const result = await settle(o, txn, actor, event);
  if (result.duplicate) {
    try {
      await batch([event]);
    } catch {
      const winner = await one(
        "SELECT payload_hash FROM billing_events WHERE gateway=? AND event_id=?",
        [g, eventId],
      );
      if (winner?.payload_hash !== hash)
        throw new ApiError(409, "EVENT_CONFLICT", "Webhook event conflict.");
    }
  }
  return { received: true, ...result };
}
