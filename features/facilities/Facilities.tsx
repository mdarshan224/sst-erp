"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bus, Hotel, Plus } from "lucide-react";
import { useApp, useResource, Row } from "@/components/campus/context";
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
  Status,
  money,
} from "@/components/campus/ui";
import { parseMoney } from "@/lib/money";
import type { FacilityKind } from "@/lib/facilities";
type Catalog = "vehicles" | "routes" | "stops" | "blocks" | "rooms";
type Spec = {
  key: string;
  label: string;
  type?: "number" | "money";
  catalog?: Catalog | "components";
};
const specs: Record<Catalog, Spec[]> = {
  vehicles: [
    { key: "registration", label: "Vehicle registration" },
    { key: "driver_name", label: "Driver name" },
    { key: "driver_mobile", label: "Driver mobile (10 digits)" },
    { key: "capacity", label: "Seat capacity", type: "number" },
  ],
  routes: [
    { key: "name", label: "Route name" },
    { key: "vehicle_id", label: "Vehicle", catalog: "vehicles" },
  ],
  stops: [
    { key: "name", label: "Boarding stop" },
    { key: "route_id", label: "Route", catalog: "routes" },
    { key: "distance_km", label: "Distance (whole km)", type: "number" },
    { key: "monthly_paise", label: "Monthly transport fee (₹)", type: "money" },
    {
      key: "component_id",
      label: "Transport fee component",
      catalog: "components",
    },
  ],
  blocks: [{ key: "name", label: "Block name" }],
  rooms: [
    { key: "name", label: "Room number / name" },
    { key: "block_id", label: "Block", catalog: "blocks" },
    { key: "capacity", label: "Number of beds", type: "number" },
    { key: "boarding_paise", label: "Monthly boarding fee (₹)", type: "money" },
    { key: "mess_paise", label: "Monthly mess fee (₹)", type: "money" },
    {
      key: "boarding_component_id",
      label: "Boarding fee component",
      catalog: "components",
    },
    {
      key: "mess_component_id",
      label: "Mess fee component",
      catalog: "components",
    },
  ],
};
export default function Facilities({ kind }: { kind: FacilityKind }) {
  const { scope, request, refresh, can } = useApp(),
    [tab, setTab] = useState("allocations"),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [values, setValues] = useState<Record<string, string>>({});
  const catalogue = tab !== "allocations",
    path = catalogue
      ? `facilities?catalog=${tab}&page=${page}`
      : `facilities?kind=${kind}&year=${scope.year}&page=${page}`,
    r = useResource<Row>(path),
    manageable = can("facilities.manage");
  const tabs =
    kind === "Transport"
      ? ["allocations", "vehicles", "routes", "stops"]
      : ["allocations", "blocks", "rooms"];
  const [allocationOpen, setAllocationOpen] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const s of specs[tab as Catalog])
        body[s.key] =
          s.type === "money"
            ? parseMoney(values[s.key] || "0")
            : s.type === "number"
              ? Number(values[s.key])
              : values[s.key];
      await request(`facilities/${tab}`, { method: "POST", body });
      setOpen(false);
      refresh();
      toast.success("Facility saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="FACILITIES"
        title={
          kind === "Transport" ? "Transport management" : "Hostel management"
        }
        description={
          kind === "Transport"
            ? "Manage vehicles, drivers and boarding stops. Each student is invoiced at their stop’s monthly rate."
            : "Allocate numbered beds and generate recurring boarding and mess invoices."
        }
        actions={
          manageable && (
            <Button
              disabled={!catalogue && !can("fees.invoice")}
              onClick={() => {
                if (catalogue) {
                  setValues({});
                  setOpen(true);
                } else setAllocationOpen(true);
              }}
            >
              <Plus size={16} />
              {catalogue ? `Add ${tab.slice(0, -1)}` : "Allocate student"}
            </Button>
          )
        }
      />
      <div className="tabs mb-4">
        {tabs.map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {r.error ? (
        <Failure message={r.error} retry={r.retry} />
      ) : !r.data ? (
        <Loading />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="schedule-table">
              <thead>
                <tr>
                  {catalogue ? (
                    <>
                      <th>Name / registration</th>
                      <th>Details</th>
                      <th>Monthly fee</th>
                    </>
                  ) : (
                    <>
                      <th>Student</th>
                      <th>{kind === "Transport" ? "Stop" : "Room / bed"}</th>
                      <th>Dates & next invoice</th>
                      <th>Status</th>
                      <th>Action</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {r.data.rows.map((row: Row) => (
                  <tr key={row.id}>
                    {catalogue ? (
                      <>
                        <td>{row.name || row.registration}</td>
                        <td>
                          {row.driver_name
                            ? `${row.driver_name} · ${row.driver_mobile} · ${row.capacity} seats`
                            : row.capacity
                              ? `${row.capacity} beds`
                              : row.distance_km !== undefined
                                ? `${row.distance_km} km`
                                : "Configured"}
                        </td>
                        <td>
                          {row.monthly_paise !== undefined
                            ? money(row.monthly_paise)
                            : row.boarding_paise !== undefined
                              ? `${money(row.boarding_paise)} boarding + ${money(row.mess_paise)} mess`
                              : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{row.student_name}</strong>
                          <small className="block">
                            {row.admission_number}
                          </small>
                        </td>
                        <td>
                          {row.stop_name ||
                            `${row.block_name} · ${row.room_name} · Bed ${row.bed_number}`}
                        </td>
                        <td>
                          {row.start_date} – {row.end_date}
                          <small className="block">
                            Next:{" "}
                            {row.status === "Active" &&
                            row.next_bill_date <= row.end_date
                              ? row.next_bill_date
                              : "None"}
                          </small>
                        </td>
                        <td>
                          <Status value={row.status} />
                        </td>
                        <td>
                          {manageable && row.status === "Active" && (
                            <Button
                              variant="outline"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    "End this allocation? Existing invoices and payments will remain.",
                                  )
                                )
                                  return;
                                try {
                                  await request(
                                    `facilities/allocations/${row.id}/end`,
                                    { method: "POST" },
                                  );
                                  refresh();
                                  toast.success("Allocation ended.");
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              End allocation
                            </Button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.data.rows.length && (
            <div className="py-12 text-center text-slate-500">
              {kind === "Transport" ? (
                <Bus className="mx-auto mb-3" />
              ) : (
                <Hotel className="mx-auto mb-3" />
              )}
              No {tab} yet.{" "}
              {manageable
                ? "Add a record to get started."
                : "Your administrator can set up facilities."}
            </div>
          )}
          <div className="flex justify-between items-center mt-5">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>
              {r.data.total} records · Page {page}
            </span>
            <Button
              variant="outline"
              disabled={page * 50 >= (r.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
      {!catalogue &&
        manageable &&
        can("settings.manage") &&
        can("fees.invoice") && (
          <Card title="Recurring billing">
            <p className="text-sm text-slate-500 mb-3">
              Fees are charged per calendar month in full, including the first
              partial month. Existing invoices remain payable after an
              allocation ends. Daily maintenance creates subsequent monthly
              invoices automatically.
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const d = await request("facilities/bill", {
                    method: "POST",
                  });
                  refresh();
                  toast.success(
                    `${d.generated} invoices generated.${d.hasMore ? " More batches remain; run again or allow daily maintenance to continue." : ""}`,
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Generate due monthly invoices
            </Button>
          </Card>
        )}
      {catalogue && (
        <FormDialog
          open={open}
          onClose={() => setOpen(false)}
          title={`Add ${tab.slice(0, -1)}`}
          onSubmit={create}
          busy={busy}
        >
          {specs[tab as Catalog].map((s) => (
            <Field key={s.key} label={s.label}>
              {s.catalog ? (
                <ReferencePicker
                  catalog={s.catalog}
                  value={values[s.key] || ""}
                  onChange={(v) => setValues({ ...values, [s.key]: v })}
                />
              ) : (
                <Input
                  required
                  type={s.type ? "number" : "text"}
                  min={s.type === "money" ? 0 : s.key === "distance_km" ? 0 : 1}
                  step={s.type === "money" ? "0.01" : 1}
                  maxLength={100}
                  value={values[s.key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [s.key]: e.target.value })
                  }
                />
              )}
            </Field>
          ))}
          <p className="text-sm text-slate-500">
            Rates are in INR and applied server-side. Select fee components from
            Fees → Fee Components.
          </p>
        </FormDialog>
      )}
      {allocationOpen && (
        <AllocationDialog kind={kind} close={() => setAllocationOpen(false)} />
      )}
    </>
  );
}
function ReferencePicker({
  catalog,
  value,
  onChange,
}: {
  catalog: Catalog | "components";
  value: string;
  onChange: (v: string) => void;
}) {
  const { boot } = useApp(),
    [page, setPage] = useState(1),
    r = useResource<Row>(
      `facilities?catalog=${catalog === "components" ? "vehicles" : catalog}&page=${page}`,
    );
  if (catalog === "components")
    return (
      <Picker
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: "Select component" },
          ...(boot.components || [])
            .filter((c: Row) => c.active !== 0)
            .map((c: Row) => ({ value: c.id, label: c.name })),
        ]}
      />
    );
  return (
    <>
      <Picker
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: "Select record" },
          ...(r.data?.rows || []).map((c: Row) => ({
            value: c.id,
            label: c.name || c.registration,
          })),
        ]}
      />
      {r.error && <p className="text-sm text-red-600">{r.error}</p>}
      {(r.data?.total || 0) > 50 && (
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            disabled={page === 1}
            onClick={() => {
              setPage(page - 1);
              onChange("");
            }}
          >
            Previous choices
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page * 50 >= (r.data?.total || 0)}
            onClick={() => {
              setPage(page + 1);
              onChange("");
            }}
          >
            Next choices
          </Button>
        </div>
      )}
    </>
  );
}
function AllocationDialog({
  kind,
  close,
}: {
  kind: FacilityKind;
  close: () => void;
}) {
  const { scope, request, refresh } = useApp(),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    r = useResource<Row>(
      `students?year=${scope.year}&q=${encodeURIComponent(query)}&size=25`,
    ),
    [student, setStudent] = useState(""),
    [target, setTarget] = useState(""),
    [bed, setBed] = useState("1"),
    [start, setStart] = useState(() =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    ),
    [end, setEnd] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(timer);
  }, [q]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await request("facilities/allocations", {
        method: "POST",
        body: {
          kind,
          yearId: scope.year,
          studentId: student,
          ...(kind === "Transport"
            ? { stopId: target }
            : { roomId: target, bedNumber: Number(bed) }),
          startDate: start,
          endDate: end,
        },
      });
      refresh();
      toast.success("Allocation saved. The first due invoice was generated.");
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      open
      onClose={close}
      title={`Allocate ${kind.toLowerCase()}`}
      busy={busy}
      onSubmit={save}
    >
      <Field label="Find student">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setStudent("");
          }}
          placeholder="Search name or admission number"
        />
      </Field>
      <Field label="Student">
        <Picker
          value={student}
          onChange={setStudent}
          options={[
            { value: "", label: "Select enrolled student" },
            ...(r.data?.rows || []).map((s: Row) => ({
              value: s.id,
              label: `${s.name} · ${s.admission_number}`,
            })),
          ]}
        />
        {r.error && <p className="text-red-600 text-sm">{r.error}</p>}
      </Field>
      <Field label={kind === "Transport" ? "Boarding stop" : "Room"}>
        <ReferencePicker
          catalog={kind === "Transport" ? "stops" : "rooms"}
          value={target}
          onChange={setTarget}
        />
      </Field>
      {kind === "Hostel" && (
        <Field label="Bed number">
          <Input
            required
            type="number"
            min={1}
            max={100}
            value={bed}
            onChange={(e) => setBed(e.target.value)}
          />
        </Field>
      )}
      <div className="form-grid">
        <Field label="Start date">
          <Input
            required
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="End date">
          <Input
            required
            type="date"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      {kind === "Hostel" && target && end && (
        <BedGrid
          room={target}
          from={start}
          to={end}
          selected={bed}
          select={setBed}
        />
      )}
      <p className="notice">
        This creates the first monthly fee invoice when due. Full monthly fees
        apply; there is no automatic proration. Bed and vehicle capacity are
        checked before saving.
      </p>
    </FormDialog>
  );
}

function BedGrid({
  room,
  from,
  to,
  selected,
  select,
}: {
  room: string;
  from: string;
  to: string;
  selected: string;
  select: (v: string) => void;
}) {
  const r = useResource<{ beds: { number: number; occupied: boolean }[] }>(
    `facilities/rooms/${room}/beds?from=${from}&to=${to}`,
  );
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  return (
    <div>
      <p className="text-sm text-slate-500 mb-2">
        Choose a bed. Occupied beds are unavailable for these dates.
      </p>
      <div className="grid grid-cols-5 gap-2">
        {r.data.beds.map((b) => (
          <Button
            type="button"
            key={b.number}
            variant={selected === String(b.number) ? "default" : "outline"}
            disabled={b.occupied}
            onClick={() => select(String(b.number))}
            aria-label={`Bed ${b.number}${b.occupied ? ", occupied" : ""}`}
          >
            {b.number}
            {b.occupied ? " ×" : ""}
          </Button>
        ))}
      </div>
    </div>
  );
}
