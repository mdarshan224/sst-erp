"use client";
import { useState } from "react";
import { useApp, Row } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
export function PortalManagement({ studentId }: { studentId: string }) {
  const { request, can } = useApp(),
    [open, setOpen] = useState(false),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [credentials, setCredentials] = useState<Row | null>(null);
  const root = "portal-staff/" + studentId;
  async function load() {
    setData(await request(root));
  }
  async function save(path: string, body: Row) {
    setBusy(true);
    setError("");
    setCredentials(null);
    try {
      const d = await request(root + "/" + path, { method: "POST", body });
      if (d.password) setCredentials(d);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = "w-full rounded-md border p-2 bg-background";
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setCredentials(null);
          setError("");
          load().catch((e) => setError(e.message));
        }}
      >
        Student & parent portal
      </Button>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setCredentials(null);
            setData(null);
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-2xl p-6">
          <SheetHeader>
            <SheetTitle>Student & parent portal</SheetTitle>
            <SheetDescription>
              Manage linked accounts and published content. Portal:
              /student-portal. Private links remain available.
            </SheetDescription>
          </SheetHeader>
          {error && (
            <p role="alert" className="my-4 text-red-700">
              {error}
            </p>
          )}
          {credentials && (
            <section className="my-4 rounded-lg border border-amber-500 bg-amber-50 p-4 text-slate-900">
              <h3 className="font-bold">Copy these credentials now</h3>
              <p>
                Username: <strong>{credentials.username}</strong>
              </p>
              <p>
                Temporary password:{" "}
                <strong className="break-all">{credentials.password}</strong>
              </p>
              <p>
                Expires: {credentials.expiresAt}. Shown once. Verify identity
                and share privately. Password change is required at first
                sign-in.
              </p>
              <Button onClick={() => setCredentials(null)}>
                Dismiss credentials
              </Button>
            </section>
          )}
          {!data ? (
            <p className="my-5">Loading…</p>
          ) : (
            <div className="space-y-8 py-5">
              <section>
                <h3 className="font-bold">Accounts</h3>
                {data.accounts.map((a: Row) => (
                  <div
                    key={a.id}
                    className="border rounded-lg p-4 my-3 space-y-3"
                  >
                    <p>
                      <strong>
                        {a.kind}: {a.username}
                      </strong>{" "}
                      · {a.active ? "Enabled" : "Disabled"}
                      {a.must_change ? " · Password change required" : ""}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          save("account", {
                            kind: a.kind,
                            parentId: a.parent_id || undefined,
                            action: "reset",
                          })
                        }
                      >
                        Reset password
                      </Button>
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          save("account", {
                            kind: a.kind,
                            parentId: a.parent_id || undefined,
                            action: a.active ? "disable" : "enable",
                          })
                        }
                      >
                        {a.active ? "Disable account" : "Enable account"}
                      </Button>
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save("account", {
                          kind: a.kind,
                          parentId: a.parent_id || undefined,
                          action: "rename",
                          username: new FormData(e.currentTarget).get(
                            "username",
                          ),
                        });
                      }}
                    >
                      <input
                        className={field}
                        name="username"
                        aria-label="New username"
                        placeholder="New username"
                        required
                        minLength={4}
                        maxLength={48}
                      />
                      <Button disabled={busy}>Rename</Button>
                    </form>
                  </div>
                ))}
                {!data.accounts.some((a: Row) => a.kind === "Student") && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      save("account", { kind: "Student", action: "create" })
                    }
                  >
                    Issue student account
                  </Button>
                )}
                {data.guardians
                  .filter(
                    (g: Row) =>
                      !data.accounts.some((a: Row) => a.parent_id === g.id),
                  )
                  .map((g: Row) => (
                    <div key={g.id} className="my-3">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          save("account", {
                            kind: "Parent",
                            parentId: g.id,
                            action: "create",
                          })
                        }
                      >
                        Issue parent account: {g.guardian_name}
                      </Button>
                    </div>
                  ))}
                <p className="text-sm text-muted-foreground mt-3">
                  A parent account can switch between children linked to the
                  same guardian record. Manage guardian links in Student
                  details. Staff need permission for every linked child to
                  manage the parent account.
                </p>
              </section>
              <section>
                <h3 className="font-bold">Publish announcement</h3>
                <form
                  className="space-y-3 mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    save("announcement", {
                      title: f.get("title"),
                      body: f.get("body"),
                      institutionWide: f.get("global") === "on",
                    });
                  }}
                >
                  <input
                    className={field}
                    name="title"
                    aria-label="Announcement title"
                    placeholder="Title"
                    minLength={2}
                    maxLength={160}
                    required
                  />
                  <textarea
                    className={field}
                    name="body"
                    aria-label="Announcement text"
                    placeholder="School update"
                    minLength={2}
                    maxLength={5000}
                    required
                  />
                  {can("academics.manage") && (
                    <label className="block">
                      <input type="checkbox" name="global" /> Publish to entire
                      institution (administrators only)
                    </label>
                  )}
                  <Button disabled={busy}>Publish announcement</Button>
                </form>
                {data.announcements.map((a: Row) => (
                  <div className="flex justify-between gap-3 my-3" key={a.id}>
                    <span>
                      {a.title} · {a.status}
                    </span>
                    {a.status === "Published" && (
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          save("archive", { kind: "announcement", id: a.id })
                        }
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                ))}
              </section>
              <section>
                <h3 className="font-bold">Publish document</h3>
                <form
                  className="space-y-3 mt-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget),
                      file = f.get("file") as File;
                    if (!file || file.size > 1000000) {
                      setError("Choose a PDF, PNG or JPEG under 1 MB.");
                      return;
                    }
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    let binary = "";
                    for (const b of bytes) binary += String.fromCharCode(b);
                    await save("document", {
                      title: f.get("title"),
                      mime: file.type,
                      content: btoa(binary),
                    });
                  }}
                >
                  <input
                    className={field}
                    name="title"
                    aria-label="Document title"
                    placeholder="Document title"
                    minLength={2}
                    maxLength={160}
                    required
                  />
                  <input
                    className={field}
                    type="file"
                    name="file"
                    accept="application/pdf,image/png,image/jpeg"
                    required
                    aria-label="Document file"
                  />
                  <Button disabled={busy}>Publish document</Button>
                </form>
                {data.documents.map((d: Row) => (
                  <div className="flex justify-between gap-3 my-3" key={d.id}>
                    <span>
                      {d.title} · {d.status}
                    </span>
                    {d.status === "Published" && (
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          save("archive", { kind: "document", id: d.id })
                        }
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                ))}
              </section>
              <section>
                <h3 className="font-bold">Transport & hostel requests</h3>
                <p className="text-sm">
                  Allocate services through the existing Transport/Hostel module
                  first. Its normal fee invoices are reused.
                </p>
                {data.requests.map((r: Row) => (
                  <div key={r.id} className="border rounded-lg p-4 my-3">
                    <strong>
                      {r.kind} · {r.status}
                    </strong>
                    <p>{r.notes}</p>
                    <p>{r.resolution}</p>
                    {r.status === "Pending" && can("facilities.manage") && (
                      <form
                        className="space-y-3 mt-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          save("service", {
                            id: r.id,
                            status: f.get("status"),
                            resolution: f.get("resolution"),
                            allocationId: f.get("allocationId") || undefined,
                          });
                        }}
                      >
                        <select
                          name="status"
                          aria-label="Resolution status"
                          className={field}
                        >
                          <option>Fulfilled</option>
                          <option>Declined</option>
                        </select>
                        <select
                          name="allocationId"
                          aria-label="Assigned service"
                          className={field}
                        >
                          <option value="">
                            Select existing allocation (required to fulfil)
                          </option>
                          {data.allocations
                            .filter(
                              (a: Row) =>
                                a.kind === r.kind &&
                                a.academic_year_id === r.academic_year_id,
                            )
                            .map((a: Row) => (
                              <option key={a.id} value={a.id}>
                                {a.kind} · {a.label} · {a.start_date}
                              </option>
                            ))}
                        </select>
                        <textarea
                          className={field}
                          name="resolution"
                          minLength={3}
                          maxLength={1000}
                          required
                          placeholder="Message for student / parent"
                          aria-label="Resolution message"
                        />
                        <Button disabled={busy}>Resolve request</Button>
                      </form>
                    )}
                  </div>
                ))}
                {!data.requests.length && <p>No requests yet.</p>}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
