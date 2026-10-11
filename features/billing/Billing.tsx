"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useApp, useResource, Row } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Loading,
  PageHead,
  Picker,
  Status,
  money,
} from "@/components/campus/ui";
import { hostedCheckout, CheckoutIntent } from "@/lib/hosted-checkout";
export default function Billing() {
  const { boot, request, refresh, reload } = useApp(),
    r = useResource(
      boot.user.role === "INSTITUTION_ADMIN" && !boot.support
        ? "billing"
        : null,
    ),
    [gateway, setGateway] = useState(""),
    [busy, setBusy] = useState(false),
    [keys, setKeys] = useState<Record<string, string>>({});
  if (boot.user.role !== "INSTITUTION_ADMIN" || boot.support)
    return (
      <Card title="Institution administrator access required">
        Support sessions cannot purchase subscriptions.
      </Card>
    );
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const d = r.data,
    provider = gateway || d.gateways[0]?.provider;
  const checkout = async (intent: CheckoutIntent) => {
    try {
      await hostedCheckout(
        intent,
        (body) =>
          request("billing/orders/" + intent.paymentId + "/verify", {
            method: "POST",
            body,
          }),
        "Sohan Soft Tech · ERP subscription",
      );
      toast.success("Subscription payment verified.");
      await reload();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  };
  const canonical =
    typeof window !== "undefined" &&
    window.location.hostname !== "erp.sohansoft.in";
  return (
    <>
      <PageHead
        eyebrow="INSTITUTION / SUBSCRIPTION"
        title="Subscription & billing"
        description="Manage your institution's ERP plan and payment history."
      />
      <Card title={d.subscription.plan_name}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <Status value={d.subscription.effectiveStatus} />
          </div>
          <div>
            <p className="text-xs text-slate-500">Valid through</p>
            <strong>{d.subscription.end_date}</strong>
          </div>
          <div>
            <p className="text-xs text-slate-500">Students</p>
            <strong>
              {d.usage.students} / {d.subscription.student_limit}
            </strong>
          </div>
          <div>
            <p className="text-xs text-slate-500">Users</p>
            <strong>
              {d.usage.users} / {d.subscription.user_limit}
            </strong>
          </div>
        </div>
      </Card>
      {canonical ? (
        <Card title="Pay on the official portal">
          <p className="text-sm mb-3">
            Subscription checkout uses erp.sohansoft.in, the merchant-approved
            domain.
          </p>
          <a
            className="underline"
            href={
              "https://erp.sohansoft.in/campus/" +
              boot.institution.slug +
              "/billing"
            }
          >
            Open secure billing portal ↗
          </a>
        </Card>
      ) : (
        <Card title="Choose a subscription">
          <p className="text-sm mb-4">
            Before payment, review the{" "}
            <a
              className="underline"
              href="https://erp.sohansoft.in/policies/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              terms
            </a>
            ,{" "}
            <a
              className="underline"
              href="https://erp.sohansoft.in/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacy policy
            </a>
            ,{" "}
            <a
              className="underline"
              href="https://erp.sohansoft.in/policies/refunds"
              target="_blank"
              rel="noopener noreferrer"
            >
              cancellation &amp; refunds
            </a>{" "}
            and{" "}
            <a
              className="underline"
              href="https://erp.sohansoft.in/policies/delivery"
              target="_blank"
              rel="noopener noreferrer"
            >
              digital delivery policy
            </a>
            .
          </p>
          <p className="text-sm text-slate-500 mb-4">
            Manual renewal, with no automatic debit. Same-plan renewal extends
            your current term. A different plan starts a new full-price term
            today; unused time is not prorated.
          </p>
          {d.gateways.length ? (
            <Picker
              value={provider}
              onChange={setGateway}
              options={d.gateways.map((g: Row) => ({
                value: g.provider,
                label: g.provider + " · " + g.mode,
              }))}
            />
          ) : (
            <p>No online provider is enabled. Contact platform support.</p>
          )}
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {d.plans.map((p: Row) => (
              <div key={p.id} className="rounded-xl border p-4">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-2xl font-semibold my-2">
                  {money(p.price_paise)}
                  <span className="text-xs font-normal">
                    {" "}
                    / {p.billing_cycle}
                  </span>
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  {p.student_limit} students · {p.user_limit} users
                </p>
                <Button
                  disabled={busy || !provider}
                  onClick={async () => {
                    setBusy(true);
                    const fingerprint = p.id + ":" + provider,
                      key = keys[fingerprint] || crypto.randomUUID();
                    setKeys((k) => ({ ...k, [fingerprint]: key }));
                    try {
                      await checkout(
                        await request("billing/checkout", {
                          method: "POST",
                          body: {
                            planId: p.id,
                            gateway: provider,
                            idempotencyKey: key,
                          },
                        }),
                      );
                      setKeys((k) => {
                        const next = { ...k };
                        delete next[fingerprint];
                        return next;
                      });
                    } catch (e) {
                      toast.error((e as Error).message);
                      refresh();
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? "Please wait…"
                    : d.subscription.plan_id === p.id
                      ? "Renew plan"
                      : "Purchase plan"}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title="Subscription orders">
        <DataTable
          rows={d.orders}
          columns={[
            {
              key: "created_at",
              label: "Date",
              render: (r: Row) => r.created_at.slice(0, 10),
            },
            { key: "gateway", label: "Provider" },
            {
              key: "amount_paise",
              label: "Amount",
              render: (r: Row) => money(r.amount_paise),
            },
            {
              key: "status",
              label: "Status",
              render: (r: Row) => <Status value={r.status} />,
            },
            {
              key: "action",
              label: "",
              render: (r: Row) =>
                r.status !== "Successful" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await request(
                            "billing/orders/" + r.id + "/reconcile",
                            { method: "POST", body: {} },
                          );
                          toast.success("Subscription confirmed.");
                          await reload();
                          refresh();
                        } catch (e) {
                          toast.error((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Check payment
                    </Button>
                    {!canonical && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await checkout(
                              await request("billing/orders/" + r.id),
                            );
                          } catch (e) {
                            toast.error((e as Error).message);
                            setBusy(false);
                          }
                        }}
                      >
                        Resume checkout
                      </Button>
                    )}
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>
      <Card title="Payment history">
        <DataTable
          rows={d.payments}
          columns={[
            { key: "paid_date", label: "Date" },
            { key: "method", label: "Method" },
            {
              key: "amount_paise",
              label: "Amount",
              render: (r: Row) => money(r.amount_paise),
            },
            { key: "reference", label: "Transaction reference" },
          ]}
        />
      </Card>
    </>
  );
}
