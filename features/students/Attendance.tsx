"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  Failure,
  Field,
  Input,
  Loading,
  PageHead,
  Picker,
} from "@/components/campus/ui";
export default function Attendance() {
  const { scope, request, refresh, can } = useApp(),
    setup = useResource<Row>(`attendance/setup?year=${scope.year}`),
    [section, setSection] = useState(""),
    [date, setDate] = useState(() =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    );
  useEffect(() => {
    setSection("");
  }, [scope.year]);
  return (
    <>
      <PageHead
        eyebrow="ACADEMICS / ATTENDANCE"
        title="Day-wise attendance"
        description="Morning attendance carries through to the afternoon. Record an early departure only when needed."
      />
      <Card>
        <div className="form-grid">
          <Field label="Section">
            <Picker
              value={section}
              onChange={setSection}
              options={(setup.data?.sections || []).map((s: Row) => ({
                value: s.id,
                label: `${s.class_name} ${s.name}`,
              }))}
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
      </Card>
      {setup.error ? (
        <Failure message={setup.error} retry={setup.retry} />
      ) : !section ? (
        <Empty title="Choose your assigned section" />
      ) : (
        <AttendanceGrid
          key={`${scope.year}:${section}:${date}`}
          year={scope.year}
          section={section}
          date={date}
          canMark={can("attendance.mark")}
          request={request}
          refresh={refresh}
        />
      )}
    </>
  );
}
function AttendanceGrid({
  year,
  section,
  date,
  canMark,
  request,
  refresh,
}: {
  year: string;
  section: string;
  date: string;
  canMark: boolean;
  request: ReturnType<typeof useApp>["request"];
  refresh: () => void;
}) {
  const [page, setPage] = useState(1),
    r = useResource<Row>(
      `attendance?year=${year}&section=${section}&date=${date}&page=${page}`,
    ),
    [edits, setEdits] = useState<Record<string, Row>>({}),
    [busy, setBusy] = useState(false);
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const data = r.data;
  canMark = canMark && data.required !== false;
  function set(row: Row, key: string, value: unknown) {
    setEdits((previous) => ({
      ...previous,
      [row.enrollment_id]: {
        morning: row.morning || "Present",
        halfDay: !!row.half_day,
        reason: row.reason || "",
        ...previous[row.enrollment_id],
        [key]: value,
      },
    }));
  }
  async function save() {
    setBusy(true);
    try {
      await request("attendance", {
        method: "POST",
        body: {
          yearId: year,
          sectionId: section,
          date,
          rows: Object.entries(edits).map(([enrollmentId, row]) => ({
            enrollmentId,
            ...row,
            version: data.rows.find(
              (s: Row) => s.enrollment_id === enrollmentId,
            ).version,
          })),
        },
      });
      setEdits({});
      refresh();
      toast.success("Day attendance saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Attendance register">
      {data.required === false && (
        <p className="notice">
          {data.holidays.map((h: Row) => h.name).join(" · ")} — attendance is
          not required. Existing records remain visible.
        </p>
      )}
      <div className="schedule-actions">
        <span>
          {data.total} students · {Object.keys(edits).length} unsaved changes
        </span>
        {canMark && (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const updated: Record<string, Row> = { ...edits };
                for (const s of data.rows)
                  if (!s.morning && !updated[s.enrollment_id])
                    updated[s.enrollment_id] = {
                      morning: "Present",
                      halfDay: false,
                      reason: "",
                    };
                setEdits(updated);
              }}
            >
              Mark unmarked students present
            </Button>
            <Button
              disabled={busy || !Object.keys(edits).length}
              onClick={save}
            >
              <Save size={15} />
              Save attendance
            </Button>
          </>
        )}
      </div>
      <div className="table-wrap">
        <table className="schedule-table attendance-grid">
          <thead>
            <tr>
              <th>Student</th>
              <th>Morning</th>
              <th>Afternoon</th>
              <th>Left early</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((s: Row) => {
              const v = edits[s.enrollment_id] || {
                morning: s.morning,
                halfDay: !!s.half_day,
                reason: s.reason || "",
              };
              return (
                <tr key={s.enrollment_id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small>
                      {s.admission_number} · Roll {s.roll_number || "—"}
                    </small>
                  </td>
                  <td>
                    <select
                      aria-label={`Morning attendance for ${s.name}`}
                      disabled={!canMark || busy}
                      value={v.morning || ""}
                      onChange={(e) => {
                        set(s, "morning", e.target.value);
                        if (!["Present", "Late"].includes(e.target.value))
                          set(s, "halfDay", false);
                      }}
                    >
                      <option value="" disabled>
                        Unmarked
                      </option>
                      {["Present", "Absent", "Late", "Excused"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={v.halfDay ? "attendance-half" : ""}>
                      {v.halfDay
                        ? "Absent · Half day"
                        : v.morning || "Unmarked"}
                    </span>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Early departure for ${s.name}`}
                      disabled={
                        !canMark ||
                        busy ||
                        !["Present", "Late"].includes(v.morning)
                      }
                      checked={v.halfDay}
                      onChange={(e) => set(s, "halfDay", e.target.checked)}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Attendance reason for ${s.name}`}
                      disabled={!canMark || busy}
                      maxLength={300}
                      required={v.halfDay}
                      placeholder={
                        v.halfDay
                          ? "Required for early departure"
                          : "Optional note"
                      }
                      value={v.reason}
                      onChange={(e) => set(s, "reason", e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="schedule-actions">
        <Button
          variant="outline"
          disabled={page === 1 || busy || !!Object.keys(edits).length}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={
            page * 50 >= data.total || busy || !!Object.keys(edits).length
          }
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </Card>
  );
}

function Empty({ title }: { title: string }) {
  return <div className="p-10 text-center text-sm text-slate-500">{title}</div>;
}
