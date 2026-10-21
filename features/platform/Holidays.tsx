"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppContext, Row } from "@/components/campus/context";
import { PlatformContext } from "./context";
import {
  Button,
  Card,
  Failure,
  Field,
  FormDialog,
  Input,
  Loading,
  PageHead,
  Picker,
} from "@/components/campus/ui";
export default function Holidays() {
  const campus = useContext(AppContext),
    platform = useContext(PlatformContext),
    global = !!platform;
  const request = global ? platform!.request : campus!.request,
    refresh = global ? platform!.refresh : campus!.refresh,
    revision = global ? platform!.revision : campus!.revision,
    canManage = global
      ? platform!.can("holidays.manage")
      : campus!.can("academics.manage");
  const [editing, setEditing] = useState<string | null>(null),
    [cancel, setCancel] = useState<Row | null>(null),
    [formError, setFormError] = useState("");
  const inFlight = useRef(false);
  const [month, setMonth] = useState(() =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date())
        .slice(0, 7),
    ),
    [page, setPage] = useState(1),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({
      name: "",
      kind: "National Holiday",
      startDate: "",
      endDate: "",
      institutionId: "",
    }),
    [search, setSearch] = useState(""),
    [institutions, setInstitutions] = useState<Row[]>([]);
  const [y, m] = month.split("-").map(Number),
    last = new Date(Date.UTC(y, m, 0)).getUTCDate(),
    from = month + "-01",
    to = month + "-" + String(last).padStart(2, "0");
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    request(`holidays?from=${from}&to=${to}&page=${page}`, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [from, to, page, revision, request]);
  useEffect(() => {
    if (!global || !open) return;
    const c = new AbortController(),
      timer = setTimeout(
        () =>
          request<Row>(`institutions?q=${encodeURIComponent(search)}&size=25`, {
            signal: c.signal,
          })
            .then((d) => setInstitutions(d.rows))
            .catch((e) => {
              if (e.name !== "AbortError") toast.error(e.message);
            }),
        250,
      );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [global, open, search, request]);
  function move(delta: number) {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
    setPage(1);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError("");
    try {
      await request(editing ? `holidays/${editing}/edit` : "holidays", {
        method: "POST",
        body: {
          ...form,
          institutionId: global ? form.institutionId || null : undefined,
        },
      });
      setOpen(false);
      setMonth(form.startDate.slice(0, 7));
      setPage(1);
      refresh();
      toast.success(
        "Holiday saved. Attendance and daily classes are not required on these dates.",
      );
    } catch (e) {
      setFormError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const rows = data?.rows || [],
    offset = (new Date(from + "T00:00:00Z").getUTCDay() + 6) % 7;
  return (
    <>
      <PageHead
        eyebrow={global ? "PLATFORM / CALENDAR" : "ACADEMICS / CALENDAR"}
        title="Holidays & term breaks"
        description={
          global
            ? "Set national holidays for every institution or choose a campus for a local event."
            : "Global holidays and your institution’s local events appear together."
        }
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormError("");
                setForm({
                  name: "",
                  kind: global ? "National Holiday" : "Local Event",
                  startDate: from,
                  endDate: from,
                  institutionId: "",
                });
                setOpen(true);
              }}
            >
              <Plus size={16} />
              Add holiday
            </Button>
          )
        }
      />
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <h2 className="font-semibold">
            {new Date(from + "T00:00:00Z").toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h2>
          <Button
            variant="outline"
            aria-label="Next month"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
        {error ? (
          <Failure message={error} retry={refresh} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <div className="holiday-calendar">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <strong className="holiday-weekday" key={d}>
                  {d}
                </strong>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <div key={`blank${i}`} aria-hidden="true" />
              ))}
              {Array.from({ length: last }, (_, i) => {
                const date = month + "-" + String(i + 1).padStart(2, "0"),
                  events = rows.filter(
                    (h: Row) => h.start_date <= date && h.end_date >= date,
                  );
                return (
                  <button
                    type="button"
                    key={date}
                    className={
                      "holiday-day " + (events.length ? "has-holiday" : "")
                    }
                    onClick={() => {
                      if (canManage) {
                        setEditing(null);
                        setFormError("");
                        setForm({
                          name: "",
                          kind: global ? "National Holiday" : "Local Event",
                          startDate: date,
                          endDate: date,
                          institutionId: "",
                        });
                        setOpen(true);
                      }
                    }}
                    aria-label={`${date}: ${events.map((h: Row) => h.name).join(", ") || "Regular day"}`}
                  >
                    <span>{i + 1}</span>
                    {events.slice(0, 3).map((h: Row) => (
                      <small key={h.id} title={h.name}>
                        {h.name}
                      </small>
                    ))}
                    {events.length > 3 && (
                      <small>+{events.length - 3} more</small>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-slate-500 mt-3">
              Holiday dates carry zero attendance and timetable expectations.
              Historical attendance and weekly timetable templates remain
              intact.
            </p>
            {data.total > 100 && (
              <p className="notice">
                Showing a page of holidays. Use the controls below to see
                remaining events in this month.
              </p>
            )}
            <div className="mt-5 space-y-3">
              {rows.map((h: Row) => (
                <div
                  key={h.id}
                  className="flex flex-wrap justify-between gap-3 border-b pb-3"
                >
                  <div>
                    <strong>{h.name}</strong>
                    <p className="text-sm text-slate-500">
                      {h.start_date} – {h.end_date} · {h.kind} ·{" "}
                      {h.institution_id
                        ? h.institution_name || "This institution"
                        : "All institutions"}
                    </p>
                  </div>
                  {canManage &&
                    (global || h.institution_id === campus?.institutionId) && (
                      <div className="row-actions">
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEditing(h.id);
                            setFormError("");
                            setForm({
                              name: h.name,
                              kind: h.kind,
                              startDate: h.start_date,
                              endDate: h.end_date,
                              institutionId: h.institution_id || "",
                            });
                            setOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => setCancel(h)}
                        >
                          Cancel holiday
                        </Button>
                      </div>
                    )}
                </div>
              ))}
              {!rows.length && (
                <p className="py-6 text-center text-slate-500">
                  <CalendarDays className="mx-auto mb-2" />
                  No holidays this month.
                </p>
              )}
            </div>
            <div className="flex justify-between mt-4">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                {data.total} events · Page {page}
              </span>
              <Button
                variant="outline"
                disabled={page * 100 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </Card>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit holiday" : "Add holiday"}
        onSubmit={save}
        busy={busy}
      >
        {formError && (
          <p role="alert" className="text-red-700">
            {formError}
          </p>
        )}
        <Field label="Name">
          <Input
            required
            minLength={2}
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Category">
          <Picker
            value={form.kind}
            onChange={(v) => setForm({ ...form, kind: v })}
            options={["National Holiday", "Term Break", "Local Event"].map(
              (v) => ({ value: v, label: v }),
            )}
          />
        </Field>
        <div className="form-grid">
          <Field label="Start date">
            <Input
              required
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm({
                  ...form,
                  startDate: e.target.value,
                  endDate: e.target.value,
                })
              }
            />
          </Field>
          <Field label="End date">
            <Input
              required
              type="date"
              min={form.startDate}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
        </div>
        {global && !editing && (
          <>
            <Field label="Find institution (optional)">
              <Input
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <Field label="Scope">
              <Picker
                value={form.institutionId}
                onChange={(v) => setForm({ ...form, institutionId: v })}
                options={[
                  { value: "", label: "All institutions" },
                  ...institutions.map((i) => ({ value: i.id, label: i.name })),
                ]}
              />
            </Field>
          </>
        )}
      </FormDialog>
      <FormDialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        title="Cancel holiday?"
        description={`Cancel ${cancel?.name || "this holiday"} and restore attendance expectations for its dates. Historical records are retained.`}
        busy={busy}
        submitLabel="Cancel holiday"
        onSubmit={async (e) => {
          e.preventDefault();
          if (inFlight.current || !cancel) return;
          inFlight.current = true;
          setBusy(true);
          try {
            await request(`holidays/${cancel.id}/cancel`, {
              method: "POST",
              body: {},
            });
            setCancel(null);
            refresh();
            toast.success("Holiday cancelled.");
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        <p>This affects attendance and published daily schedules.</p>
      </FormDialog>
    </>
  );
}
