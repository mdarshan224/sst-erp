"use client";
import { useEffect, useState } from "react";
import { useApp, useResource, Row } from "@/components/campus/context";
import {
  Button,
  Card,
  Field,
  Input,
  PageHead,
  Loading,
  Failure,
} from "@/components/campus/ui";
import { toast } from "sonner";
import { AdmitCard } from "./AdmitCard";
import { formatMarks } from "@/lib/exam-grading";
const defaultPolicy = {
  bands: [
    { minimum: 90, grade: "A" },
    { minimum: 75, grade: "B" },
    { minimum: 60, grade: "C" },
    { minimum: 40, grade: "D" },
    { minimum: 0, grade: "E" },
  ],
  qualitative: ["Emerging", "Developing", "Secure", "Advanced"],
};
const selectClass = "h-10 w-full rounded-md border bg-white px-3 text-sm";
export default function Exams() {
  const { scope, boot, request, can, refresh } = useApp(),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("Setup"),
    [card, setCard] = useState<Row | null>(null),
    [creating, setCreating] = useState(false);
  const list = useResource<Row>(`exams?year=${scope.year}&page=${page}`);
  useEffect(() => {
    setSelected("");
    setCard(null);
    setPage(1);
  }, [scope.year]);
  if (!scope.year)
    return (
      <PageHead
        title="Examinations"
        description="Choose an academic year to manage exams."
      />
    );
  async function action(path: string, body: unknown) {
    try {
      const r = await request(path, { method: "POST", body });
      refresh();
      toast.success("Saved successfully.");
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }
  if (card) return <AdmitCard card={card} onClose={() => setCard(null)} />;
  return (
    <>
      <PageHead
        title="Examinations"
        description="Assessments, grading, competitive mocks and verified admit cards."
        actions={
          can("exams.manage") ? (
            <Button onClick={() => setCreating((v) => !v)}>Create exam</Button>
          ) : undefined
        }
      />
      {creating && (
        <CreateExam
          onSave={async (d) => {
            const r = await action("exams", d);
            if (r) {
              setCreating(false);
              setSelected(r.id);
            }
          }}
        />
      )}
      {selected ? (
        <ExamWorkspace
          id={selected}
          tab={tab}
          setTab={setTab}
          onBack={() => setSelected("")}
          onCard={setCard}
          action={action}
        />
      ) : list.error ? (
        <Failure message={list.error} retry={list.retry} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Card>
          <div className="exam-list">
            {list.data.rows.map((e: Row) => (
              <button
                className="exam-list-item"
                key={e.id}
                onClick={() => setSelected(e.id)}
              >
                <div>
                  <strong>{e.name}</strong>
                  <p>
                    {e.class_name} {e.section_name} · {e.board} · {e.tier} ·{" "}
                    {e.kind}
                  </p>
                </div>
                <div>
                  <span className="exam-badge">{e.status}</span>
                  <p>{e.registered} candidates</p>
                </div>
              </button>
            ))}
            {!list.data.rows.length && (
              <p>
                No examinations yet. Create an exam for a class and section.
              </p>
            )}
          </div>
          <div className="admit-actions">
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
              disabled={page * 25 >= list.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
function CreateExam({ onSave }: { onSave: (d: Row) => Promise<void> }) {
  const { boot, scope } = useApp(),
    [d, setD] = useState<Row>({
      name: "",
      sectionId: "",
      board: "State Board",
      tier: "School",
      kind: "Summative",
      competitiveExam: "JEE",
      policy: JSON.stringify(defaultPolicy, null, 2),
      policyReference: "Institution-approved internal assessment policy",
      approved: false,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k: string, v: unknown) => setD({ ...d, [k]: v });
  return (
    <Card title="New examination">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave({
              ...d,
              yearId: scope.year,
              policy: JSON.parse(d.policy),
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Exam name">
            <Input
              required
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Section">
            <select
              required
              className={selectClass}
              value={d.sectionId}
              onChange={(e) => {
                const section = boot.sections.find(
                    (s: Row) => s.id === e.target.value,
                  ),
                  cls = boot.classes.find(
                    (c: Row) => c.id === section?.class_id,
                  ),
                  tier =
                    cls?.level === "Pre-Primary"
                      ? "Nursery"
                      : ["PU College", "Senior Secondary"].includes(cls?.level)
                        ? "PUC"
                        : "School";
                setD({
                  ...d,
                  sectionId: e.target.value,
                  tier,
                  kind: tier === "Nursery" ? "Activity" : "Summative",
                });
              }}
            >
              <option value="">Select section</option>
              {boot.sections
                .filter((s: Row) => s.academic_year_id === scope.year)
                .map((s: Row) => (
                  <option key={s.id} value={s.id}>
                    {s.class_name} {s.name} {s.stream_name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Board">
            <select
              className={selectClass}
              value={d.board}
              onChange={(e) => set("board", e.target.value)}
            >
              {["CBSE", "ICSE", "State Board", "PUC", "Other"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Assessment type">
            <select
              className={selectClass}
              value={d.kind}
              onChange={(e) => set("kind", e.target.value)}
            >
              {(d.tier === "Nursery"
                ? ["Activity"]
                : d.tier === "PUC"
                  ? ["Formative", "Summative", "Board", "Mock"]
                  : ["Formative", "Summative", "Board"]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          {d.kind === "Mock" && (
            <Field label="Competitive exam">
              <select
                className={selectClass}
                value={d.competitiveExam}
                onChange={(e) => set("competitiveExam", e.target.value)}
              >
                {["KCET", "JEE", "NEET"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Policy reference / version">
            <Input
              required
              value={d.policyReference}
              onChange={(e) => set("policyReference", e.target.value)}
            />
          </Field>
        </div>
        <details className="exam-policy">
          <summary>Review grading policy</summary>
          <p>
            Internal grade bands are editable. Official board grades are entered
            as awarded; mock percentiles refer only to this cohort.
          </p>
          {JSON.parse(d.policy).bands.map((band: Row, i: number) => (
            <div className="form-grid" key={i}>
              <Field label="Minimum percentage">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={band.minimum}
                  onChange={(e) => {
                    const p = JSON.parse(d.policy);
                    p.bands[i].minimum = Number(e.target.value);
                    set("policy", JSON.stringify(p));
                  }}
                />
              </Field>
              <Field label="Grade">
                <Input
                  required
                  maxLength={12}
                  value={band.grade}
                  onChange={(e) => {
                    const p = JSON.parse(d.policy);
                    p.bands[i].grade = e.target.value;
                    set("policy", JSON.stringify(p));
                  }}
                />
              </Field>
            </div>
          ))}
          <Field label="Qualitative levels (one per line)">
            <textarea
              className="exam-policy-input"
              value={JSON.parse(d.policy).qualitative.join("\n")}
              onChange={(e) => {
                const p = JSON.parse(d.policy);
                p.qualitative = e.target.value.split("\n");
                set("policy", JSON.stringify(p));
              }}
            />
          </Field>
        </details>
        <label className="exam-approval">
          <input
            type="checkbox"
            required
            checked={d.approved}
            onChange={(e) => set("approved", e.target.checked)}
          />{" "}
          I approve this policy for the selected board and class.
        </label>
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy} type="submit">
          Create draft exam
        </Button>
      </form>
    </Card>
  );
}
function ExamWorkspace({
  id,
  tab,
  setTab,
  onBack,
  onCard,
  action,
}: {
  id: string;
  tab: string;
  setTab: (v: string) => void;
  onBack: () => void;
  onCard: (v: Row) => void;
  action: (p: string, b: unknown) => Promise<any>;
}) {
  const { can, boot } = useApp(),
    [page, setPage] = useState(1),
    [subject, setSubject] = useState(""),
    [edits, setEdits] = useState<Record<string, Row>>({}),
    [saving, setSaving] = useState(false),
    r = useResource<Row>(`exams/${id}?page=${page}`);
  useEffect(() => {
    setEdits({});
    setPage(1);
    setSubject("");
  }, [id]);
  useEffect(() => setEdits({}), [subject, page]);
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const data = r.data;
  const { exam, subjects, roster, results } = data,
    current = subjects.find((s: Row) => s.id === subject) || subjects[0];
  async function save() {
    setSaving(true);
    const result = await action(`exams/${id}/results`, {
      rows: Object.entries(edits).map(([registrationId, row]) => ({
        registrationId,
        subjectId: current.id,
        version:
          results.find(
            (v: Row) =>
              v.registration_id === registrationId &&
              v.subject_id === current.id,
          )?.version || 0,
        ...row,
      })),
    });
    if (result) setEdits({});
    setSaving(false);
  }
  return (
    <>
      <div className="admit-actions">
        <Button variant="outline" onClick={onBack}>
          All exams
        </Button>
        <h2>{exam.name}</h2>
        <span className="exam-badge">{exam.status}</span>
        {can("exams.manage") && exam.status === "Draft" && (
          <Button
            onClick={() => {
              if (confirm("Freeze subjects, candidates and timetable?"))
                void action(`exams/${id}/status`, { status: "Scheduled" });
            }}
          >
            Schedule & freeze
          </Button>
        )}
        {can("exams.manage") && exam.status === "Scheduled" && (
          <Button
            onClick={() => {
              if (confirm("Publish and lock all results?"))
                void action(`exams/${id}/status`, { status: "Published" });
            }}
          >
            Publish results
          </Button>
        )}
        {can("exams.manage") && exam.status !== "Archived" && (
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Archive this exam and invalidate admit cards?"))
                void action(`exams/${id}/status`, { status: "Archived" });
            }}
          >
            Archive
          </Button>
        )}
      </div>
      <div className="exam-tabs" role="tablist">
        {["Setup", "Grading", "Results", "Admit cards"].map((v) => (
          <Button
            key={v}
            role="tab"
            aria-selected={tab === v}
            variant={tab === v ? "default" : "outline"}
            onClick={() => setTab(v)}
          >
            {v}
          </Button>
        ))}
      </div>
      {tab === "Setup" && (
        <>
          {can("exams.manage") && exam.status === "Draft" && (
            <>
              <SubjectForm
                exam={exam}
                teachers={r.data.teachers}
                onSave={(d) => action(`exams/${id}/subjects`, d)}
              />
              <RegistrationForm
                exam={exam}
                subjects={subjects}
                onSave={(d) => action(`exams/${id}/register`, d)}
              />
            </>
          )}
          <Card title="Subjects & timetable">
            <div className="exam-table-scroll">
              <table className="exam-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Subject</th>
                    <th>Assessment</th>
                    <th>Max / pass</th>
                    <th>Timetable (IST)</th>
                    <th>Room</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s: Row) => (
                    <tr key={s.id}>
                      <td>{s.code}</td>
                      <td>{s.name}</td>
                      <td>{s.assessment}</td>
                      <td>
                        {formatMarks(s.max_units)} / {formatMarks(s.pass_units)}
                      </td>
                      <td>
                        {s.exam_date} {s.start_time}–{s.end_time}
                      </td>
                      <td>{s.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Policy: {exam.policy_reference} · {exam.board}
            </p>
          </Card>
        </>
      )}
      {tab === "Grading" && (
        <Card title="Assessment register">
          <select
            aria-label="Subject"
            className={selectClass}
            value={current?.id || ""}
            onChange={(e) => {
              if (
                !Object.keys(edits).length ||
                window.confirm("Discard unsaved assessments?")
              )
                setSubject(e.target.value);
            }}
          >
            {subjects.map((s: Row) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.assessment}
              </option>
            ))}
          </select>
          <div className="exam-table-scroll">
            <table className="exam-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>
                    {exam.tier === "Nursery"
                      ? "Qualitative assessment"
                      : "Marks"}
                  </th>
                  <th>Assignment</th>
                  <th>Absent</th>
                  <th>Feedback / official grade</th>
                </tr>
              </thead>
              <tbody>
                {current &&
                  roster
                    .filter((r: Row) =>
                      JSON.parse(r.subjects).includes(current.id),
                    )
                    .map((student: Row) => {
                      const result = results.find(
                          (v: Row) =>
                            v.registration_id === student.id &&
                            v.subject_id === current.id,
                        ),
                        value = edits[student.id] || {
                          score:
                            result?.score_units == null
                              ? ""
                              : formatMarks(result.score_units),
                          qualitative:
                            result?.qualitative || exam.policy.qualitative[0],
                          assignmentStatus:
                            result?.assignment_status || "Not applicable",
                          absent: !!result?.absent,
                          notes: result?.notes || "",
                          officialGrade: result?.official_grade || "",
                        },
                        editable =
                          can("exams.grade") &&
                          exam.status === "Scheduled" &&
                          (boot.user.role !== "TEACHER" ||
                            current.grader_user_id === boot.user.userId);
                      const set = (k: string, v: unknown) =>
                        setEdits({
                          ...edits,
                          [student.id]: { ...value, [k]: v },
                        });
                      return (
                        <tr key={student.id}>
                          <td>
                            <strong>{student.name}</strong>
                            <small>{student.admission_number}</small>
                          </td>
                          <td>
                            {exam.tier === "Nursery" ? (
                              <select
                                disabled={!editable}
                                className={selectClass}
                                value={value.qualitative}
                                onChange={(e) =>
                                  set("qualitative", e.target.value)
                                }
                              >
                                {exam.policy.qualitative.map((v: string) => (
                                  <option key={v}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                disabled={!editable || value.absent}
                                aria-label={`${student.name} marks`}
                                inputMode="decimal"
                                value={value.score}
                                onChange={(e) => set("score", e.target.value)}
                              />
                            )}
                          </td>
                          <td>
                            <select
                              disabled={!editable}
                              className={selectClass}
                              value={value.assignmentStatus}
                              onChange={(e) =>
                                set("assignmentStatus", e.target.value)
                              }
                            >
                              {[
                                "Not applicable",
                                "Pending",
                                "Submitted",
                                "Reviewed",
                                "Missing",
                              ].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              disabled={!editable}
                              aria-label={`${student.name} absent`}
                              checked={value.absent}
                              onChange={(e) => set("absent", e.target.checked)}
                            />
                          </td>
                          <td>
                            <Input
                              disabled={!editable}
                              aria-label="Assessment feedback"
                              value={value.notes}
                              onChange={(e) => set("notes", e.target.value)}
                            />
                            {exam.kind === "Board" && (
                              <Input
                                disabled={!editable}
                                placeholder="Officially awarded grade"
                                value={value.officialGrade}
                                onChange={(e) =>
                                  set("officialGrade", e.target.value)
                                }
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          <Button
            disabled={saving || !Object.keys(edits).length}
            onClick={() => void save()}
          >
            Save changed assessments
          </Button>
          <p>
            Changes are audited. Teachers can save only their assigned subjects.
          </p>
        </Card>
      )}
      {(tab === "Results" || tab === "Admit cards") && (
        <Card title={tab}>
          <div className="exam-table-scroll">
            <table className="exam-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Admission no.</th>
                  <th>{tab === "Admit cards" ? "Admit card" : "Results"}</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((student: Row) => (
                  <tr key={student.id}>
                    <td>{student.name}</td>
                    <td>{student.admission_number}</td>
                    <td>
                      {tab === "Admit cards" ? (
                        <Button
                          disabled={
                            !["Scheduled", "Published"].includes(exam.status)
                          }
                          onClick={async () => {
                            const c = await action(`exams/${id}/admit`, {
                              registrationId: student.id,
                            });
                            if (c) onCard(c);
                          }}
                        >
                          Generate admit card
                        </Button>
                      ) : (
                        <>
                          {results
                            .filter(
                              (v: Row) => v.registration_id === student.id,
                            )
                            .map((v: Row) => (
                              <div key={v.id}>
                                {
                                  subjects.find(
                                    (s: Row) => s.id === v.subject_id,
                                  )?.name
                                }
                                : {v.grade}{" "}
                                {v.score_units !== null
                                  ? `(${formatMarks(v.score_units)})`
                                  : ""}
                                {v.assignment_status !== "Not applicable"
                                  ? ` · ${v.assignment_status}`
                                  : ""}
                              </div>
                            ))}
                          {exam.kind === "Mock" && (
                            <strong>
                              Mock cohort percentile:{" "}
                              {student.cohortPercentile ||
                                "Awaiting complete scores"}{" "}
                              · n={data.cohortSize}
                            </strong>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="admit-actions">
        <Button
          disabled={page === 1 || Object.keys(edits).length > 0}
          variant="outline"
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          {r.data.total} candidates · Page {page}
        </span>
        <Button
          disabled={page * 25 >= r.data.total || Object.keys(edits).length > 0}
          variant="outline"
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
function SubjectForm({
  exam,
  teachers,
  onSave,
}: {
  exam: Row;
  teachers: Row[];
  onSave: (d: Row) => Promise<any>;
}) {
  const [d, setD] = useState<Row>({
      name: "",
      code: "",
      assessment:
        exam.tier === "Nursery"
          ? "Activity"
          : exam.kind === "Mock"
            ? "Mock"
            : "Theory",
      min: "0",
      max: "100",
      pass: "40",
      date: "",
      start: "09:00",
      end: "12:00",
      room: "",
      graderUserId: "",
    }),
    [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setD({ ...d, [k]: v });
  return (
    <Card title="Add subject / activity">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await onSave({
              ...d,
              date: d.date || undefined,
              start: d.date ? d.start : undefined,
              end: d.date ? d.end : undefined,
              graderUserId: d.graderUserId || undefined,
            });
            if (r) setD({ ...d, name: "", code: "" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          {[
            ["name", "Subject / activity", "text"],
            ["code", "Code", "text"],
            ["min", "Minimum marks", "text"],
            ["max", "Maximum marks", "text"],
            ["pass", "Pass marks", "text"],
            ["date", "Date", "date"],
            ["start", "Start", "time"],
            ["end", "End", "time"],
            ["room", "Room", "text"],
          ].map(([k, label, type]) => (
            <Field key={k} label={label}>
              <Input
                type={type}
                required={["name", "code", "max"].includes(k)}
                value={d[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Assessment">
            <select
              className={selectClass}
              value={d.assessment}
              onChange={(e) => set("assessment", e.target.value)}
            >
              {(exam.tier === "Nursery"
                ? ["Activity", "Assignment"]
                : [
                    "Formative",
                    "Summative",
                    "Theory",
                    "Practical",
                    "Assignment",
                    "Mock",
                  ]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned teacher">
            <select
              className={selectClass}
              value={d.graderUserId}
              onChange={(e) => set("graderUserId", e.target.value)}
            >
              <option value="">Administrator only</option>
              {teachers.map((t) => (
                <option key={t.user_id} value={t.user_id}>
                  {t.display_name || t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button disabled={busy} type="submit">
          Add subject
        </Button>
      </form>
    </Card>
  );
}
function RegistrationForm({
  exam,
  subjects,
  onSave,
}: {
  exam: Row;
  subjects: Row[];
  onSave: (d: Row) => Promise<any>;
}) {
  const [page, setPage] = useState(1);
  const r = useResource<Row>(`exams/${exam.id}/candidates?page=${page}`),
    [students, setStudents] = useState<string[]>([]),
    [chosen, setChosen] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const toggle = (a: string[], id: string) =>
    a.includes(id) ? a.filter((v) => v !== id) : [...a, id];
  return (
    <Card title="Register candidates">
      <p>
        Select students and their subjects. Already registered candidates cannot
        be added again.
      </p>
      <div className="exam-selection">
        {subjects.map((s: Row) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={chosen.includes(s.id)}
              onChange={() => setChosen(toggle(chosen, s.id))}
            />
            {s.name}
          </label>
        ))}
      </div>
      {r.error ? (
        <p role="alert">{r.error}</p>
      ) : (
        <select
          multiple
          className="exam-student-select"
          aria-label="Select candidates"
          value={students}
          onChange={(e) =>
            setStudents(Array.from(e.target.selectedOptions, (o) => o.value))
          }
        >
          {r.data?.rows.map((s: Row) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.admission_number}
            </option>
          ))}
        </select>
      )}
      <Button
        disabled={busy || !students.length || !chosen.length}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await onSave({
              studentIds: students,
              subjectIds: chosen,
            });
            if (r) setStudents([]);
          } finally {
            setBusy(false);
          }
        }}
      >
        Register {students.length} candidates
      </Button>
      <small>Up to 100 candidates per batch.</small>
      <div className="admit-actions">
        <Button
          variant="outline"
          disabled={page === 1 || students.length > 0}
          onClick={() => setPage(page - 1)}
        >
          Previous candidates
        </Button>
        <Button
          variant="outline"
          disabled={page * 50 >= (r.data?.total || 0) || students.length > 0}
          onClick={() => setPage(page + 1)}
        >
          Next candidates
        </Button>
      </div>
    </Card>
  );
}
