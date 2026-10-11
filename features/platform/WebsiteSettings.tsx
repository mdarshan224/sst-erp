"use client";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatform, usePlatformResource } from "./context";
import { policyNames, WebsiteConfig } from "@/lib/website";
export function WebsiteSettings() {
  const { request, can, refresh } = usePlatform(),
    r = usePlatformResource<{ config: WebsiteConfig }>("settings/website"),
    [draft, setDraft] = useState<WebsiteConfig | null>(null),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    inbox = usePlatformResource<{
      rows: Array<Record<string, string>>;
      total: number;
    }>("settings/enquiries?page=" + page),
    [updating, setUpdating] = useState("");
  const config = draft || r.data?.config;
  if (r.error)
    return (
      <section className="card">
        <h2>Public website</h2>
        <p role="alert">{r.error}</p>
        <button onClick={r.retry}>Retry</button>
      </section>
    );
  if (!config)
    return (
      <section className="card" aria-busy="true">
        Loading website settings…
      </section>
    );
  const missing = [
    !config.email && "support email",
    !config.phone && "phone",
    !config.address && "business address",
    !config.hours && "support hours",
  ].filter(Boolean);
  return (
    <section className="card" style={{ padding: 24, marginBlock: 24 }}>
      <h2>Public website & enquiry inbox</h2>
      <p>
        Changes publish immediately to the public ERP website. No login links or
        company-site redirects are included.
      </p>
      {missing.length > 0 && (
        <p
          role="status"
          style={{
            padding: 14,
            background: "#fff4da",
            color: "#6c4a00",
            borderRadius: 8,
          }}
        >
          Merchant website setup incomplete: add {missing.join(", ")}. Review
          the legal name, pricing, refund eligibility, cancellation deadlines,
          refund processing timelines and activation schedule before gateway
          review. Policy pages alone do not guarantee approval.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await request("settings/website", {
              method: "PATCH",
              body: config,
            });
            setDraft(null);
            refresh();
            toast.success("Website changes saved.");
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset
          disabled={!can("settings.manage") || busy}
          style={{ border: 0, padding: 0 }}
        >
          <div className="form-grid">
            {[
              ["brand", "Website name"],
              ["headline", "Homepage headline"],
              ["description", "Homepage description"],
              ["accent", "Accent colour (#hex)"],
              ["legalName", "Legal business name"],
              ["email", "Public support email"],
              ["phone", "Public support phone"],
              ["address", "Registered / business address"],
              ["hours", "Support hours"],
              ["pricingNote", "Pricing introduction"],
            ].map(([key, label]) => (
              <label
                key={key}
                style={{ display: "grid", gap: 6, marginTop: 14 }}
              >
                {label}
                {["description", "address", "pricingNote"].includes(key) ? (
                  <textarea
                    rows={3}
                    className="input"
                    value={String(config[key as keyof WebsiteConfig])}
                    onChange={(e) =>
                      setDraft({ ...config, [key]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    className="input"
                    type={key === "email" ? "email" : "text"}
                    value={String(config[key as keyof WebsiteConfig])}
                    onChange={(e) =>
                      setDraft({ ...config, [key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <h3 style={{ marginTop: 24 }}>Public policy pages</h3>
          <p>
            Use a heading followed by a newline, then the paragraph. Separate
            sections with a blank line. Plain text only; HTML is never executed.
          </p>
          {Object.entries(policyNames).map(([key, label]) => (
            <details key={key} style={{ marginBlock: 16 }}>
              <summary>{label}</summary>
              <label style={{ display: "grid", gap: 8 }}>
                {label} content
                <textarea
                  rows={14}
                  minLength={100}
                  maxLength={16000}
                  className="input"
                  value={config.policies[key as keyof typeof policyNames]}
                  onChange={(e) =>
                    setDraft({
                      ...config,
                      policies: { ...config.policies, [key]: e.target.value },
                    })
                  }
                />
              </label>
            </details>
          ))}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save public website"}
          </button>
        </fieldset>
      </form>
      <hr style={{ marginBlock: 28 }} />
      <h3>Website enquiries</h3>
      <p>
        Requests are stored here; no automatic email or SMS is sent. Enquiry
        access uses your Platform Settings permissions.
      </p>
      {inbox.error ? (
        <p role="alert">
          {inbox.error}
          <button onClick={inbox.retry}>Retry</button>
        </p>
      ) : !inbox.data ? (
        <p>Loading enquiries…</p>
      ) : (
        <>
          {inbox.data.rows.length === 0 ? (
            <p>No enquiries on this page.</p>
          ) : (
            inbox.data.rows.map((row) => (
              <details
                key={row.key}
                style={{ borderTop: "1px solid #ddd", paddingBlock: 16 }}
              >
                <summary>
                  {row.institution} · {row.topic} · {row.status} ·{" "}
                  {new Date(row.createdAt).toLocaleString()}
                </summary>
                <dl>
                  <dt>Name</dt>
                  <dd>{row.name}</dd>
                  <dt>Email</dt>
                  <dd>{row.email}</dd>
                  <dt>Phone</dt>
                  <dd>{row.phone || "Not supplied"}</dd>
                  <dt>Message</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{row.message}</dd>
                  <dt>Reference</dt>
                  <dd>{row.id}</dd>
                </dl>
                <label>
                  Status{" "}
                  <select
                    value={row.status}
                    disabled={!can("settings.manage") || !!updating}
                    onChange={async (e) => {
                      setUpdating(row.key);
                      try {
                        await request("settings/enquiries", {
                          method: "PATCH",
                          body: { key: row.key, status: e.target.value },
                        });
                        refresh();
                        toast.success("Enquiry updated.");
                      } catch (err) {
                        toast.error((err as Error).message);
                      } finally {
                        setUpdating("");
                      }
                    }}
                  >
                    {["New", "In progress", "Closed"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </details>
            ))
          )}
          <div
            style={{
              display: "flex",
              gap: 18,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} · {inbox.data.total} enquiries
            </span>
            <button
              disabled={page * 25 >= inbox.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
