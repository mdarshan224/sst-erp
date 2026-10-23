"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Plus, Send, GripVertical } from "lucide-react";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  Field,
  Input,
  PageHead,
  Picker,
  Loading,
  Failure,
  FormDialog,
  Status,
} from "@/components/campus/ui";
import { clock } from "@/lib/timetable";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export default function Timetable() {
  const { scope, request, refresh, can } = useApp(),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState(1),
    r = useResource<Row>(`timetables?year=${scope.year}&page=${page}`),
    setup = useResource<Row>(`teaching?year=${scope.year}`),
    [busy, setBusy] = useState(false);
  async function action(path: string, body: unknown) {
    setBusy(true);
    try {
      const result = await request<Row>(path, { method: "POST", body });
      refresh();
      return result;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (!scope.year) return <Empty title="Create an academic year first" />;
  return (
    <>
      <PageHead
        eyebrow="ACADEMICS / TIMETABLE"
        title="Timetable"
        description="Plan teaching loads, resolve clashes and publish one approved timetable per academic year."
      />
      {selected ? (
        <TimetableGrid
          id={selected}
          onBack={() => setSelected("")}
          action={action}
          busy={busy}
        />
      ) : (
        <>
          {can("timetable.manage") && setup.data && (
            <TeachingSetup data={setup.data} action={action} busy={busy} />
          )}
          {can("timetable.manage") && (
            <Generator action={action} onCreated={setSelected} busy={busy} />
          )}
          <Card title="Timetables">
            {r.error ? (
              <Failure message={r.error} retry={r.retry} />
            ) : !r.data ? (
              <Loading />
            ) : !r.data.rows.length ? (
              <Empty title="No timetables yet" />
            ) : (
              <>
                <div className="schedule-list">
                  {r.data.rows.map((t: Row) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                    >
                      <CalendarDays size={22} />
                      <span>
                        <strong>{t.name}</strong>
                        <small>
                          Version {t.version} ·{" "}
                          {new Date(t.created_at).toLocaleDateString("en-IN")}
                        </small>
                      </span>
                      <Status value={t.status} />
                    </button>
                  ))}
                </div>
                <div className="schedule-actions">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span>Page {page}</span>
                  <Button
                    variant="outline"
                    disabled={page * 20 >= r.data.total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
function TeachingSetup({
  data,
  action,
  busy,
}: {
  data: Row;
  action: (p: string, b: unknown) => Promise<Row | null>;
  busy: boolean;
}) {
  const { scope, can } = useApp(),
    [staff, setStaff] = useState(""),
    [subject, setSubject] = useState({ name: "", code: "" }),
    [a, setA] = useState({
      sectionId: "",
      subjectId: "",
      teacherId: "",
      periods: 5,
      room: "",
    });
  return (
    <details className="schedule-setup">
      <summary>
        Subjects & teaching assignments{" "}
        <span>{data.assignments.length} assignments</span>
      </summary>
      {can("users.manage") && (
        <Card title="Teaching eligibility">
          <p>
            Explicitly enable teaching for staff who also hold another role.
            This applies across this institution’s campuses and does not change
            their access permissions.
          </p>
          <Field label="Staff member">
            <Picker
              value={staff}
              onChange={setStaff}
              options={(data.teachingStaff || []).map((s: Row) => ({
                value: s.id,
                label: s.name + (s.eligible ? " · Teaching enabled" : ""),
              }))}
            />
          </Field>
          <div className="row-actions">
            <Button
              disabled={busy || !staff}
              onClick={() =>
                action("teaching/eligibility", {
                  userId: staff,
                  eligible: true,
                })
              }
            >
              Enable teaching
            </Button>
            <Button
              variant="outline"
              disabled={busy || !staff}
              onClick={() =>
                action("teaching/eligibility", {
                  userId: staff,
                  eligible: false,
                })
              }
            >
              Remove teaching eligibility
            </Button>
          </div>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Add subject">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await action("teaching/subjects", subject))
                setSubject({ name: "", code: "" });
            }}
          >
            <div className="form-grid">
              <Field label="Subject name">
                <Input
                  required
                  value={subject.name}
                  onChange={(e) =>
                    setSubject({ ...subject, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Subject code">
                <Input
                  required
                  value={subject.code}
                  onChange={(e) =>
                    setSubject({ ...subject, code: e.target.value })
                  }
                />
              </Field>
            </div>
            <Button disabled={busy} type="submit">
              <Plus size={15} />
              Add subject
            </Button>
          </form>
        </Card>
        <Card title="Assign teacher to subject">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action("teaching/assignments", {
                  ...a,
                  yearId: scope.year,
                })
              )
                setA({ ...a, subjectId: "" });
            }}
          >
            <div className="form-grid">
              <Field label="Section">
                <Picker
                  value={a.sectionId}
                  onChange={(v) => setA({ ...a, sectionId: v })}
                  options={data.sections.map((s: Row) => ({
                    value: s.id,
                    label: `${s.class_name} ${s.name}`,
                  }))}
                />
              </Field>
              <Field label="Subject">
                <Picker
                  value={a.subjectId}
                  onChange={(v) => setA({ ...a, subjectId: v })}
                  options={data.subjects.map((s: Row) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
              </Field>
              <Field label="Teacher">
                <Picker
                  value={a.teacherId}
                  onChange={(v) => setA({ ...a, teacherId: v })}
                  options={data.teachers.map((s: Row) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
              </Field>
              <Field label="Periods per week">
                <Input
                  type="number"
                  required
                  min={1}
                  max={20}
                  value={a.periods}
                  onChange={(e) =>
                    setA({ ...a, periods: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Room">
                <Input
                  required
                  value={a.room}
                  onChange={(e) => setA({ ...a, room: e.target.value })}
                />
              </Field>
            </div>
            {!data.teachers.length && (
              <p className="schedule-help">
                No eligible teaching staff. Add a Teacher in Users & Roles or
                ask an authorized administrator to enable teaching eligibility
                above.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                !data.teachers.some((t: Row) => t.id === a.teacherId) ||
                !a.subjectId ||
                !a.sectionId ||
                !a.room.trim()
              }
            >
              Add assignment
            </Button>
          </form>
        </Card>
      </div>
      <div className="table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Weekly periods</th>
              <th>Room</th>
            </tr>
          </thead>
          <tbody>
            {data.assignments.map((a: Row) => (
              <tr key={a.id}>
                <td>
                  {a.class_name} {a.section_name}
                </td>
                <td>{a.subject_name}</td>
                <td>{a.teacher_name}</td>
                <td>{a.periods_per_week}</td>
                <td>{a.room}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function Generator({
  action,
  onCreated,
  busy,
}: {
  action: (p: string, b: unknown) => Promise<Row | null>;
  onCreated: (id: string) => void;
  busy: boolean;
}) {
  const { scope } = useApp(),
    [name, setName] = useState("Weekly class timetable"),
    [week, setWeek] = useState([1, 2, 3, 4, 5]),
    [periods, setPeriods] = useState([
      { start: "09:00", end: "09:45" },
      { start: "09:45", end: "10:30" },
      { start: "10:45", end: "11:30" },
      { start: "11:30", end: "12:15" },
      { start: "13:00", end: "13:45" },
      { start: "13:45", end: "14:30" },
    ]);
  return (
    <Card title="Generate a draft">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await action("timetables/generate", {
            yearId: scope.year,
            name,
            days: week,
            periods,
          });
          if (result) {
            onCreated(result.id);
            toast.success(
              `${result.lessons} lessons scheduled without clashes.`,
            );
          }
        }}
      >
        <Field label="Timetable name">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="schedule-days">
          {days.map((day, i) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={week.includes(i + 1)}
                onChange={(e) =>
                  setWeek(
                    e.target.checked
                      ? [...week, i + 1].sort()
                      : week.filter((d) => d !== i + 1),
                  )
                }
              />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
        <div className="schedule-periods">
          {periods.map((p, i) => (
            <div key={i}>
              <Field label={`Period ${i + 1} start`}>
                <Input
                  type="time"
                  required
                  value={p.start}
                  onChange={(e) =>
                    setPeriods(
                      periods.map((v, j) =>
                        j === i ? { ...v, start: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="End">
                <Input
                  type="time"
                  required
                  value={p.end}
                  onChange={(e) =>
                    setPeriods(
                      periods.map((v, j) =>
                        j === i ? { ...v, end: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setPeriods(periods.filter((_, j) => j !== i))}
                disabled={periods.length === 1}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="schedule-actions">
          <Button
            type="button"
            variant="outline"
            disabled={periods.length >= 12}
            onClick={() =>
              setPeriods([...periods, { start: "14:45", end: "15:30" }])
            }
          >
            Add period
          </Button>
          <Button disabled={busy || !week.length} type="submit">
            Generate conflict-free draft
          </Button>
        </div>
      </form>
    </Card>
  );
}
function TimetableGrid({
  id,
  onBack,
  action,
  busy,
}: {
  id: string;
  onBack: () => void;
  action: (p: string, b: unknown) => Promise<Row | null>;
  busy: boolean;
}) {
  const { can } = useApp(),
    [date, setDate] = useState(() =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    ),
    r = useResource<Row>(`timetables/${id}?date=${date}`),
    [edit, setEdit] = useState<Row | null>(null);
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const { timetable, slots } = r.data,
    editable = can("timetable.manage") && timetable.status === "Draft",
    periods = [
      ...new Set<string>(
        slots.map((s: Row) => `${s.start_minute}:${s.end_minute}`),
      ),
    ]
      .map((v) => v.split(":").map(Number))
      .sort((a, b) => a[0] - b[0]);
  async function change(index: number, values: Row) {
    const changed = slots.map((s: Row, i: number) => {
      const v = i === index ? { ...s, ...values } : s;
      return {
        assignmentId: v.assignment_id,
        weekday: v.weekday,
        start: clock(v.start_minute),
        end: clock(v.end_minute),
        room: v.room,
      };
    });
    if (
      await action(`timetables/${id}/slots`, {
        version: timetable.version,
        slots: changed,
      })
    ) {
      toast.success("Draft saved. No clashes detected.");
      setEdit(null);
    }
  }
  return (
    <>
      <div className="schedule-actions">
        <Button variant="outline" onClick={onBack}>
          Back to timetables
        </Button>
        <Status value={timetable.status} />
        {editable && (
          <Button
            disabled={busy}
            onClick={async () => {
              if (
                window.confirm(
                  "Publish this timetable? It replaces the current published timetable for this academic year, updates linked portals and queues configured email announcements.",
                )
              ) {
                if (
                  await action(`timetables/${id}/publish`, {
                    version: timetable.version,
                  })
                )
                  toast.success("Timetable published.");
              }
            }}
          >
            <Send size={15} />
            Publish timetable
          </Button>
        )}
      </div>
      <Card title={timetable.name}>
        <Field label="Daily class expectations">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        {timetable.status === "Published" && (
          <div className="my-4">
            <p className="text-sm font-medium">
              {r.data.expectedSlots.length} lessons expected on {date}
            </p>
            {r.data.expectedSlots.map((s: Row) => (
              <p key={s.id} className="text-sm text-slate-500">
                {clock(s.start_minute)}–{clock(s.end_minute)} · {s.class_name}{" "}
                {s.section_name} · {s.subject_name}
              </p>
            ))}
          </div>
        )}
        {r.data?.required === false && (
          <p className="notice">
            {r.data.holidays.map((h: Row) => h.name).join(" · ")} — no classes
            required on {r.data.localDate}. This is the weekly template.
          </p>
        )}
        <p className="schedule-help">
          {editable
            ? "Drag a lesson to another day or period. Select a lesson to edit its time or room. The server rejects conflicting changes."
            : "Approved timetable. Published lessons cannot be edited."}
        </p>
        <div className="schedule-grid-scroll">
          <div className="schedule-grid">
            <div className="schedule-axis">Period</div>
            {days.map((d) => (
              <div className="schedule-axis" key={d}>
                {d.slice(0, 3)}
              </div>
            ))}
            {periods.map(([start, end]) => (
              <div className="contents" key={`${start}:${end}`}>
                <div className="schedule-time">
                  {clock(start)}
                  <small>{clock(end)}</small>
                </div>
                {days.map((d, i) => (
                  <div
                    key={d}
                    className="schedule-cell"
                    onDragOver={(e) => {
                      if (editable) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!editable) return;
                      const index = Number(
                        e.dataTransfer.getData("text/plain"),
                      );
                      if (Number.isInteger(index) && slots[index])
                        void change(index, {
                          weekday: i + 1,
                          start_minute: start,
                          end_minute: end,
                        });
                    }}
                  >
                    {slots.map((s: Row, index: number) =>
                      s.weekday === i + 1 &&
                      s.start_minute === start &&
                      s.end_minute === end ? (
                        <button
                          type="button"
                          key={s.id}
                          className="lesson-card"
                          draggable={editable && !busy}
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", String(index))
                          }
                          onClick={() =>
                            editable &&
                            setEdit({
                              ...s,
                              index,
                              start: clock(s.start_minute),
                              end: clock(s.end_minute),
                            })
                          }
                        >
                          <strong>
                            {editable && <GripVertical size={12} />}{" "}
                            {s.subject_name}
                          </strong>
                          <span>
                            {s.class_name} {s.section_name}
                          </span>
                          <small>
                            {s.teacher_name} · {s.room}
                          </small>
                        </button>
                      ) : null,
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
      <FormDialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Adjust lesson"
        busy={busy}
        submitLabel="Save adjustment"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!edit) return;
          const toMinute = (v: string) => {
            const [h, m] = v.split(":").map(Number);
            return h * 60 + m;
          };
          await change(edit.index, {
            weekday: Number(edit.weekday),
            start_minute: toMinute(edit.start),
            end_minute: toMinute(edit.end),
            room: edit.room,
          });
        }}
      >
        {edit && (
          <div className="form-grid">
            <Field label="Weekday">
              <Picker
                value={String(edit.weekday)}
                onChange={(v) => setEdit({ ...edit, weekday: Number(v) })}
                options={days.map((d, i) => ({
                  value: String(i + 1),
                  label: d,
                }))}
              />
            </Field>
            <Field label="Room">
              <Input
                required
                value={edit.room}
                onChange={(e) => setEdit({ ...edit, room: e.target.value })}
              />
            </Field>
            <Field label="Starts">
              <Input
                type="time"
                required
                value={edit.start}
                onChange={(e) => setEdit({ ...edit, start: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="time"
                required
                value={edit.end}
                onChange={(e) => setEdit({ ...edit, end: e.target.value })}
              />
            </Field>
          </div>
        )}
      </FormDialog>
    </>
  );
}

function Empty({ title }: { title: string }) {
  return <div className="p-10 text-center text-sm text-slate-500">{title}</div>;
}
