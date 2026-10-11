"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePlatform, usePlatformResource } from "./context";
import {
  Button,
  Card,
  Field,
  Input,
  Picker,
  Failure,
  Loading,
  Status,
} from "@/components/campus/ui";
export function CloudflareSetup() {
  const { request, refresh, can } = usePlatform(),
    r = usePlatformResource(can("domains.view") ? "cloudflare" : null),
    [zone, setZone] = useState(""),
    [token, setToken] = useState(""),
    [proxy, setProxy] = useState(""),
    [busy, setBusy] = useState(false),
    [check, setCheck] = useState<any>(null);
  if (!can("domains.view")) return null;
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  return (
    <Card title="Custom domains · Cloudflare for SaaS">
      <p className="text-sm text-slate-600 mb-4">
        One-time platform setup. Customers point their CNAME to{" "}
        <strong>erp.sohansoft.in</strong>; Cloudflare generates each customer's
        ownership/SSL TXT tokens.
      </p>
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("cloudflare", {
              method: "POST",
              body: {
                zoneId: zone || r.data.zoneId,
                apiToken: token || undefined,
                proxySecret: proxy || undefined,
              },
            });
            setToken("");
            setProxy("");
            setCheck(null);
            refresh();
            toast.success("Cloudflare configuration encrypted and saved.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="sohansoft.in Zone ID">
          <Input
            value={zone || r.data.zoneId}
            onChange={(e) => setZone(e.target.value)}
            pattern="[a-f0-9]{32}"
            required
          />
        </Field>
        <Field
          label="Scoped API token"
          hint={
            r.data.tokenConfigured
              ? "Saved. Leave blank to retain the token."
              : "Zone → SSL and Certificates → Edit; restrict to sohansoft.in."
          }
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required={!r.data.tokenConfigured}
          />
        </Field>
        <Field
          label="Domain proxy shared secret"
          hint={
            r.data.proxyConfigured
              ? "Saved. Leave blank to retain."
              : "Use a random 32+ character secret; save the same value as DOMAIN_PROXY_SECRET in your domain proxy Worker."
          }
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
            minLength={32}
          />
        </Field>
        <div className="flex gap-3 flex-wrap">
          <Button disabled={busy || !can("domains.manage")}>
            Save connection
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !r.data.configured || !can("domains.manage")}
            onClick={async () => {
              setBusy(true);
              try {
                setCheck(
                  await request("cloudflare/check", {
                    method: "POST",
                    body: {},
                  }),
                );
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Check Cloudflare connection
          </Button>
        </div>
      </form>
      {check && (
        <p className="mt-4 text-sm">
          API connected · Fallback: {check.fallbackOrigin || "Not configured"} ·{" "}
          <Status value={check.fallbackStatus} />
        </p>
      )}
      <div className="flex gap-4 mt-4 text-sm underline">
        <a href="/setup/sohan-domain-proxy.zip" download>
          Download domain proxy Worker
        </a>
        <a
          href="/setup/domain-billing-guide.md"
          target="_blank"
          rel="noreferrer"
        >
          Complete setup guide ↗
        </a>
      </div>
      <ol className="list-decimal ml-5 mt-5 text-sm space-y-2">
        <li>
          Cloudflare → sohansoft.in → SSL/TLS → Custom Hostnames: enable
          Cloudflare for SaaS.
        </li>
        <li>
          Copy the Zone ID from the zone overview. Create a scoped API token
          with SSL and Certificates Edit for this zone only.
        </li>
        <li>
          Deploy the domain proxy Worker from the setup guide, set its shared
          secret, then configure an originless fallback hostname and SaaS Worker
          routes. Keep existing ERP DNS unchanged.
        </li>
        <li>
          Open Institution → Domain, save the customer's hostname, then click
          Provision / Check Cloudflare. Refresh to retrieve TXT records if SSL
          issuance is still pending.
        </li>
      </ol>
      <a
        className="block text-sm underline mt-3"
        href="https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/"
        target="_blank"
        rel="noreferrer"
      >
        Cloudflare Worker fallback setup ↗
      </a>
      <p className="text-xs text-slate-500 mt-3">
        TXT names and values are issued by Cloudflare; they cannot all be
        erp.sohansoft.in. No verification record is invented.
      </p>
    </Card>
  );
}
export function SubscriptionGateways() {
  const { request, refresh, can } = usePlatform(),
    r = usePlatformResource(
      can("payments.configure") ? "billing-gateways" : null,
    ),
    [provider, setProvider] = useState("Razorpay"),
    [mode, setMode] = useState("test"),
    [enabled, setEnabled] = useState(false),
    [keyId, setKeyId] = useState(""),
    [testCodes, setTestCodes] = useState("CL-TEST, GV-TEST"),
    [secret, setSecret] = useState(""),
    [webhook, setWebhook] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const saved = r.data?.providers.find((p: any) => p.provider === provider);
    if (saved) {
      setKeyId(saved.keyId);
      setTestCodes(saved.testInstitutionCodes.join(", "));
      setMode(saved.mode);
      setEnabled(saved.enabled);
    }
  }, [provider, r.data]);
  if (!can("payments.configure")) return null;
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const saved = r.data.providers.find((p: any) => p.provider === provider);
  return (
    <Card title="Subscription payment gateways">
      <p className="text-sm text-slate-600 mb-4">
        Sohan Soft Tech merchant accounts for institution subscriptions. These
        keys are separate from each institution's school-fee gateways. Enable
        either provider or both.
      </p>
      <a
        className="block underline text-sm mb-4"
        href="/setup/domain-billing-guide.md"
        target="_blank"
        rel="noreferrer"
      >
        Merchant approval, API keys and webhook setup guide ↗
      </a>
      <div className="flex gap-3 mb-4">
        {r.data.providers.map((p: any) => (
          <Button
            key={p.provider}
            variant="outline"
            onClick={() => {
              setProvider(p.provider);
              setKeyId(p.keyId);
              setMode(p.mode);
              setEnabled(p.enabled);
              setSecret("");
              setWebhook("");
            }}
          >
            {p.provider} · {p.enabled ? "Enabled" : "Disabled"}
          </Button>
        ))}
      </div>
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("billing-gateways", {
              method: "POST",
              body: {
                provider,
                mode,
                enabled,
                keyId: keyId || saved.keyId,
                keySecret: secret || undefined,
                webhookSecret: webhook || undefined,
                testInstitutionCodes: testCodes
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              },
            });
            setSecret("");
            setWebhook("");
            refresh();
            toast.success("Subscription gateway saved securely.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Provider">
          <Input value={provider} readOnly />
        </Field>
        <Field label="Environment">
          <Picker
            value={mode}
            onChange={setMode}
            options={[
              { value: "test", label: "Test / Sandbox" },
              { value: "production", label: "Live" },
            ]}
          />
        </Field>
        {mode === "test" && (
          <Field
            label="Allowed test institution codes"
            hint="Comma-separated codes. Sandbox payments are hidden and blocked for every other institution."
          >
            <Input
              value={testCodes}
              onChange={(e) => setTestCodes(e.target.value)}
              placeholder="CL-TEST, GV-TEST"
            />
          </Field>
        )}
        <Field label={provider === "Cashfree" ? "App ID" : "Key ID"}>
          <Input
            required
            value={keyId || saved.keyId}
            onChange={(e) => setKeyId(e.target.value)}
          />
        </Field>
        <Field
          label="Merchant secret"
          hint={
            saved.configured
              ? "Saved; leave blank to retain."
              : "Stored encrypted; never returned to clients."
          }
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required={!saved.configured}
          />
        </Field>
        {provider === "Razorpay" && (
          <Field
            label="Webhook secret"
            hint="Set this same secret in Razorpay's webhook configuration."
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              required={enabled && !saved.webhookSecretConfigured}
            />
          </Field>
        )}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable this provider for institution subscriptions
        </label>
        <Button disabled={busy}>Save {provider}</Button>
      </form>
      <div className="mt-5 space-y-2 text-sm">
        <p>
          Razorpay event: <code>payment.captured</code>
        </p>
        <code className="block break-all select-all">
          https://erp.sohansoft.in/api/billing/webhook/razorpay
        </code>
        <p>
          Cashfree event: <code>PAYMENT_SUCCESS_WEBHOOK</code>
        </p>
        <code className="block break-all select-all">
          https://erp.sohansoft.in/api/billing/webhook/cashfree
        </code>
        <p className="text-xs text-slate-500">
          These callbacks are for platform subscriptions. Student fee callbacks
          remain separate. Renewals are paid manually; automatic debits are not
          enabled.
        </p>
      </div>
    </Card>
  );
}
