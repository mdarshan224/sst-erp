"use client";
import { useEffect, useState } from "react";
import { hostedCheckout } from "@/lib/hosted-checkout";
import "./portal.css";
type Row = Record<string, any>;
async function api(path: string, body?: Row) {
  const r = await fetch("/api/student-portal/" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: Row = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(
        j.error?.message || j.message || "Request failed. Please try again.",
      ),
      { status: r.status },
    );
  return j.data ?? j;
}
const money = (v: number = 0) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    v / 100,
  );
const title = (v: string) =>
  v.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
function Table({ rows, columns }: { rows: Row[]; columns: string[] }) {
  return rows?.length ? (
    <div className="sp-table">
      <table>
        <thead>
          <tr>
            {columns.map((k) => (
              <th key={k}>{title(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map((k) => (
                <td key={k}>
                  {k.endsWith("_paise") ? money(r[k]) : String(r[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="sp-muted">No records published for this selection yet.</p>
  );
}
export default function Portal() {
  const [session, setSession] = useState<Row | null>(null),
    [ready, setReady] = useState(false),
    [data, setData] = useState<Row | null>(null),
    [student, setStudent] = useState(""),
    [year, setYear] = useState(""),
    [page, setPage] = useState(1),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    api("session")
      .then(setSession)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!session || session.mustChange) return;
    let active = true;
    setData(null);
    api(
      "overview?" +
        new URLSearchParams({
          ...(student ? { student } : {}),
          ...(year ? { year } : {}),
          page: String(page),
        }),
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (e.status === 401) {
            setSession(null);
            setData(null);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [session, student, year, page, revision]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) {
        setSession(null);
        setData(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function download(kind: string, id: string) {
    await run(async () => {
      const r = await fetch(
        "/api/student-portal/" + kind + "/" + encodeURIComponent(id),
        { cache: "no-store" },
      );
      if (r.status === 202) {
        setNotice("Your receipt is being prepared. Please try again shortly.");
        return;
      }
      if (!r.ok)
        throw new Error(
          "Download unavailable. Please sign in again or contact your institution.",
        );
      const u = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = u;
      a.download =
        kind === "receipt"
          ? "receipt.pdf"
          : "student-document." +
            (r.headers.get("content-type")?.includes("pdf")
              ? "pdf"
              : r.headers.get("content-type")?.includes("png")
                ? "png"
                : "jpg");
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    });
  }
  const alert = (
    <>
      {error && (
        <div role="alert" className="sp-alert">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="sp-notice">
          {notice}
        </div>
      )}
    </>
  );
  if (!ready)
    return (
      <main className="sp">
        <p>Opening your portal…</p>
      </main>
    );
  if (!session)
    return (
      <main className="sp sp-login">
        <section className="sp-intro">
          <div className="sp-brand">
            SOHAN ERP <span>STUDENT & PARENT</span>
          </div>
          <h1>
            One place for
            <br />
            every school day.
          </h1>
          <p>
            Stay connected to attendance, learning, school updates and fee
            payments.
          </p>
          <div className="sp-orbit">
            Learning
            <br />
            <strong>Connected.</strong>
          </div>
        </section>
        <section className="sp-card">
          <span className="sp-eyebrow">WELCOME BACK</span>
          <h2>Sign in to your portal</h2>
          <p className="sp-muted">
            Use the username and password issued by your institution.
          </p>
          {alert}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                setSession(
                  await api("login", {
                    username: f.get("username"),
                    password: f.get("password"),
                  }),
                );
                setStudent("");
                setYear("");
                setPage(1);
              });
            }}
          >
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={48}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <button disabled={busy}>
              {busy ? "Signing in…" : "Sign in securely"}
            </button>
          </form>
          <details>
            <summary>Forgot your password?</summary>
            <p>
              Contact your school’s authorised administrator or teacher. After
              verifying your identity, they can issue a temporary password. You
              will choose a new password at your next sign-in.
            </p>
          </details>
        </section>
      </main>
    );
  const passwordForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("confirm")) {
          setError("New passwords do not match.");
          return;
        }
        run(async () => {
          await api("password", {
            currentPassword: f.get("current"),
            password: f.get("password"),
          });
          setSession(null);
          setData(null);
          setNotice("Password changed. Sign in with your new password.");
        });
      }}
    >
      <label>
        Current password
        <input
          type="password"
          name="current"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password • at least 12 characters
        <input
          type="password"
          name="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          name="confirm"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <button disabled={busy}>Change password & sign out</button>
    </form>
  );
  return (
    <main className="sp">
      <header className="sp-header">
        <div className="sp-brand">
          {data?.institution?.name || "SOHAN ERP"}
          <span>STUDENT & PARENT PORTAL</span>
        </div>
        <div>
          {session.username}{" "}
          <button
            className="sp-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("logout", {});
                setSession(null);
                setData(null);
              })
            }
          >
            Sign out
          </button>
        </div>
      </header>
      {alert}
      {session.mustChange ? (
        <section className="sp-card sp-narrow">
          <h1>Make this account yours</h1>
          <p>Change your temporary password before accessing school records.</p>
          {passwordForm}
        </section>
      ) : (
        <>
          <div className="sp-heading">
            <div>
              <span className="sp-eyebrow">YOUR SCHOOL, CONNECTED</span>
              <h1>
                {data?.profile
                  ? `Hello, ${data.profile.name.split(" ")[0]}.`
                  : "Your student portal"}
              </h1>
              <p className="sp-muted">
                A clear view of learning, school life and payments.
              </p>
            </div>
            {data && (
              <div className="sp-selects">
                <label>
                  Student
                  <select
                    value={data.studentId || ""}
                    onChange={(e) => {
                      setStudent(e.target.value);
                      setYear("");
                      setPage(1);
                    }}
                  >
                    {data.children.map((c: Row) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.admission_number}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Academic year
                  <select
                    value={data.yearId || ""}
                    onChange={(e) => {
                      setYear(e.target.value);
                      setPage(1);
                    }}
                  >
                    {data.years.map((y: Row) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          <nav className="sp-tabs" aria-label="Portal sections">
            {[
              "Overview",
              "Profile",
              "Attendance",
              "Results",
              "Timetable",
              "Announcements",
              "Documents",
              "Fees & payments",
              "Transport & hostel",
              "Account",
            ].map((t) => (
              <button
                key={t}
                aria-current={tab === t ? "page" : undefined}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(t);
                  setPage(1);
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          {!data ? (
            <p>Loading school records…</p>
          ) : !data.profile ? (
            <section className="sp-card">
              No student is linked to this account. Please contact your
              institution.
            </section>
          ) : (
            <section
              className="sp-content"
              key={data.studentId + data.yearId + tab}
            >
              {tab === "Overview" && (
                <>
                  <div className="sp-stats">
                    <article>
                      <span>Class & section</span>
                      <strong>
                        {data.profile.class_name || "—"} ·{" "}
                        {data.profile.section_name || "—"}
                      </strong>
                    </article>
                    <article>
                      <span>Fees outstanding</span>
                      <strong>{money(data.balance?.outstanding_paise)}</strong>
                    </article>
                    <article>
                      <span>Next fee due</span>
                      <strong>
                        {data.balance?.next_due_date || "No upcoming due"}
                      </strong>
                    </article>
                  </div>
                  <div className="sp-grid">
                    <article className="sp-card">
                      <h2>Your school day</h2>
                      <p>
                        Review your published timetable, attendance and exam
                        results using the tabs above.
                      </p>
                      <button onClick={() => setTab("Timetable")}>
                        View timetable
                      </button>
                    </article>
                    <article className="sp-card">
                      <h2>Latest announcements</h2>
                      {data.announcements.slice(0, 3).map((a: Row) => (
                        <div className="sp-item" key={a.id}>
                          <strong>{a.title}</strong>
                          <p>{a.body}</p>
                        </div>
                      ))}
                      {!data.announcements.length && (
                        <p>No announcements published yet.</p>
                      )}
                    </article>
                  </div>
                </>
              )}
              {tab === "Profile" && (
                <div className="sp-grid">
                  <article className="sp-card">
                    <h2>Student details</h2>
                    {data.profile.hasPhoto && (
                      <img
                        className="sp-photo"
                        alt="Student photograph"
                        src={
                          "/api/student-portal/photo?student=" +
                          encodeURIComponent(data.studentId)
                        }
                      />
                    )}
                    <dl>
                      {Object.entries(data.profile)
                        .filter(([k]) => !["id", "hasPhoto"].includes(k))
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{title(k)}</dt>
                            <dd>{String(v || "—")}</dd>
                          </div>
                        ))}
                    </dl>
                  </article>
                  <article className="sp-card">
                    <h2>Parents & guardians</h2>
                    {data.guardians.map((g: Row) => (
                      <dl key={g.id}>
                        {Object.entries(g)
                          .filter(([k]) => k !== "id")
                          .map(([k, v]) => (
                            <div key={k}>
                              <dt>{title(k)}</dt>
                              <dd>{String(v || "—")}</dd>
                            </div>
                          ))}
                      </dl>
                    ))}
                  </article>
                </div>
              )}
              {tab === "Attendance" && (
                <article className="sp-card">
                  <h2>Attendance register</h2>
                  <Table
                    rows={data.attendance}
                    columns={["local_date", "morning", "afternoon", "half_day"]}
                  />
                </article>
              )}
              {tab === "Results" && (
                <article className="sp-card">
                  <h2>Published exam results</h2>
                  <Table
                    rows={data.results.map((r: Row) => ({
                      ...r,
                      marks: r.absent
                        ? "Absent"
                        : r.score_units == null
                          ? "—"
                          : `${r.score_units / 100} / ${r.max_units / 100}`,
                    }))}
                    columns={[
                      "exam_name",
                      "subject_name",
                      "marks",
                      "grade",
                      "assignment_status",
                    ]}
                  />
                </article>
              )}
              {tab === "Timetable" && (
                <article className="sp-card">
                  <h2>Published timetable</h2>
                  <Table
                    rows={data.timetable.map((r: Row) => ({
                      ...r,
                      weekday: [
                        "",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                      ][r.weekday],
                      start_time:
                        String(Math.floor(r.start_minute / 60)).padStart(
                          2,
                          "0",
                        ) +
                        ":" +
                        String(r.start_minute % 60).padStart(2, "0"),
                      end_time:
                        String(Math.floor(r.end_minute / 60)).padStart(2, "0") +
                        ":" +
                        String(r.end_minute % 60).padStart(2, "0"),
                    }))}
                    columns={[
                      "weekday",
                      "start_time",
                      "end_time",
                      "subject_name",
                      "teacher_name",
                      "room",
                    ]}
                  />
                </article>
              )}
              {tab === "Announcements" && (
                <article className="sp-card">
                  <h2>School announcements</h2>
                  {data.announcements.map((a: Row) => (
                    <div className="sp-item" key={a.id}>
                      <small>{a.created_at.slice(0, 10)}</small>
                      <h3>{a.title}</h3>
                      <p className="sp-pre">{a.body}</p>
                    </div>
                  ))}
                  {!data.announcements.length && (
                    <p>No published announcements.</p>
                  )}
                </article>
              )}
              {tab === "Documents" && (
                <article className="sp-card">
                  <h2>Your documents</h2>
                  {data.documents.map((d: Row) => (
                    <div className="sp-item sp-row" key={d.id}>
                      <div>
                        <strong>{d.title}</strong>
                        <p>
                          {d.created_at.slice(0, 10)} ·{" "}
                          {Math.ceil(d.size / 1024)} KB
                        </p>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() => download("document", d.id)}
                      >
                        Download
                      </button>
                    </div>
                  ))}
                  {!data.documents.length && <p>No documents published yet.</p>}
                </article>
              )}
              {tab === "Fees & payments" && (
                <>
                  <article className="sp-card">
                    <h2>Fees & online payments</h2>
                    <p>
                      Outstanding:{" "}
                      <strong>{money(data.balance?.outstanding_paise)}</strong>{" "}
                      · Overdue: {money(data.balance?.overdue_paise)}
                    </p>
                    {data.gateways.length &&
                    data.balance?.outstanding_paise > 0 ? (
                      <form
                        className="sp-inline"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          run(async () => {
                            const intent = await api("checkout", {
                              studentId: data.studentId,
                              yearId: data.yearId,
                              amount: f.get("amount"),
                              gateway: f.get("gateway"),
                              idempotencyKey: crypto.randomUUID(),
                            });
                            try {
                              await hostedCheckout(
                                intent,
                                (response) =>
                                  intent.gateway === "Razorpay"
                                    ? api("verify", {
                                        ...response,
                                        paymentId: intent.paymentId,
                                      })
                                    : api("reconcile", {
                                        paymentId: intent.paymentId,
                                      }),
                                data.institution.name,
                              );
                              setNotice(
                                "Checkout finished. Review the verified status in payment history.",
                              );
                            } finally {
                              setRevision((v) => v + 1);
                            }
                          });
                        }}
                      >
                        <label>
                          Amount (INR)
                          <input
                            name="amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={data.balance.outstanding_paise / 100}
                            defaultValue={data.balance.outstanding_paise / 100}
                            required
                          />
                        </label>
                        <label>
                          Payment provider
                          <select name="gateway">
                            {data.gateways.map((g: Row) => (
                              <option key={g.provider} value={g.provider}>
                                {g.provider}
                                {g.mode === "sandbox" ? " · test mode" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button disabled={busy}>Pay securely</button>
                      </form>
                    ) : (
                      <p>
                        {data.balance?.outstanding_paise > 0
                          ? "Online payments are not configured. Contact your school for payment options."
                          : "No outstanding fee balance."}
                      </p>
                    )}
                    <h3>Invoices (including transport and hostel charges)</h3>
                    <Table
                      rows={data.invoices}
                      columns={[
                        "number",
                        "due_date",
                        "total_paise",
                        "paid_paise",
                        "outstanding_paise",
                        "status",
                      ]}
                    />
                    <h3>Scheduled instalments</h3>
                    <Table
                      rows={data.installments}
                      columns={[
                        "title",
                        "due_date",
                        "total_paise",
                        "outstanding_paise",
                        "status",
                      ]}
                    />
                  </article>
                  <article className="sp-card">
                    <h2>Payment history & receipts</h2>
                    {data.payments.map((p: Row) => (
                      <div className="sp-item sp-row" key={p.id}>
                        <div>
                          <strong>
                            {money(p.amount_paise)} · {p.status}
                          </strong>
                          <p>
                            {p.paid_at || "Awaiting confirmation"} ·{" "}
                            {p.gateway || p.method} ·{" "}
                            {p.receipt_number || p.reference || p.id}
                          </p>
                        </div>
                        {p.receipt_id ? (
                          <button
                            disabled={busy}
                            onClick={() => download("receipt", p.receipt_id)}
                          >
                            Receipt PDF
                          </button>
                        ) : (
                          p.gateway && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await api("reconcile", { paymentId: p.id });
                                  setRevision((v) => v + 1);
                                  setNotice(
                                    "Payment status refreshed from the provider.",
                                  );
                                })
                              }
                            >
                              Check status
                            </button>
                          )
                        )}
                      </div>
                    ))}
                    {!data.payments.length && <p>No payments recorded.</p>}
                  </article>
                </>
              )}
              {tab === "Transport & hostel" && (
                <>
                  <article className="sp-card">
                    <h2>Assigned services</h2>
                    <Table
                      rows={data.services}
                      columns={[
                        "kind",
                        "stop_name",
                        "room_name",
                        "bed_number",
                        "start_date",
                        "end_date",
                        "status",
                      ]}
                    />
                    <p>
                      Service charges are included in your existing fee ledger.
                      Open Fees & payments to review dues and pay online.
                    </p>
                  </article>
                  <article className="sp-card">
                    <h2>Request enrolment</h2>
                    <p>
                      Your school will review availability, allocate the service
                      and add applicable fees.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          f = new FormData(form);
                        run(async () => {
                          await api("services", {
                            studentId: data.studentId,
                            yearId: data.yearId,
                            kind: f.get("kind"),
                            notes: f.get("notes"),
                          });
                          form.reset();
                          setRevision((v) => v + 1);
                          setNotice("Request submitted to your school.");
                        });
                      }}
                    >
                      <label>
                        Service
                        <select name="kind">
                          <option value="Transport">
                            School bus / transport
                          </option>
                          <option>Hostel</option>
                        </select>
                      </label>
                      <label>
                        Requirements
                        <textarea
                          name="notes"
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder="Preferred stop or room, start date and any requirements"
                        />
                      </label>
                      <button disabled={busy || !data.yearId}>
                        Submit request
                      </button>
                    </form>
                    <h3>Your requests</h3>
                    <Table
                      rows={data.requests}
                      columns={["kind", "notes", "status", "resolution"]}
                    />
                  </article>
                </>
              )}
              {tab === "Account" && (
                <article className="sp-card sp-narrow">
                  <h2>Account security</h2>
                  <p>
                    Signed in as {session.username}. Changing your password
                    signs out all sessions. Contact authorised school staff to
                    change your username or recover access.
                  </p>
                  {passwordForm}
                </article>
              )}
              {!["Overview", "Profile", "Timetable", "Account"].includes(
                tab,
              ) && (
                <div className="sp-row">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {page}</span>
                  <button
                    disabled={
                      ![
                        "attendance",
                        "results",
                        "announcements",
                        "documents",
                        "payments",
                        "services",
                        "requests",
                      ].some((k) => data[k]?.length === 30)
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      <footer className="sp-footer">
        Your records are available only to your linked account. Always sign out
        on shared devices.
      </footer>
    </main>
  );
}
