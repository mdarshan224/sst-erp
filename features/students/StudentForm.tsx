"use client";
import { Row, useApp } from "@/components/campus/context";
import { DraftNotice } from "@/components/campus/DraftNotice";
import { Field, FormDialog, Input, Picker } from "@/components/campus/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalDraft } from "@/hooks/use-local-draft";
import { fieldErrors, studentFormSchema } from "@/lib/form-validation";
import { ClientError } from "@/lib/api-client";
import { studentFieldTab } from "@/lib/student-form-tabs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
export function StudentForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { boot, scope, request, refresh, institutionId } = useApp(),
    [busy, setBusy] = useState(false),
    [d, setD] = useState<Row>({
      name: "",
      admissionNumber: "",
      sectionId: "",
      gender: "Not specified",
      parentName: "",
      mobile: "",
      email: "",
      dob: "",
      rollNumber: "",
      bloodGroup: "",
      aadhaarLast4: "",
      previousSchool: "",
    });
  const [tab, setTab] = useState("student"),
    [focusField, setFocusField] = useState(""),
    [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);
  const reveal = (key: string) => {
    setTab(studentFieldTab(key));
    setFocusField(key);
  };
  useEffect(() => {
    if (!focusField) return;
    const frame = requestAnimationFrame(() => {
      const field = formRef.current?.querySelector(
        `[data-field="${focusField}"]`,
      );
      const control = field?.querySelector<HTMLElement>(
        "input,button,select,textarea",
      );
      control?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "nearest" });
      setFocusField("");
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, focusField]);
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setD({ ...d, [key]: e.target.value });
    setServerErrors((v) => {
      const next = { ...v };
      delete next[key];
      return next;
    });
  };
  const [credentials, setCredentials] = useState<Row | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const draft = useLocalDraft<Row>({
    storageKey: [
      boot.user.id || boot.user.email,
      institutionId,
      scope.year,
      "student",
    ].join(":"),
    open,
    value: d,
    restore: (value) =>
      setD({
        ...d,
        ...Object.fromEntries(
          Object.entries(value).filter(
            ([k, v]) => k in d && typeof v === "string",
          ),
        ),
      }),
    reset: () => {
      setSubmitted(false);
      setTab("student");
      setServerErrors({});
      setD({
        name: "",
        admissionNumber: "",
        sectionId: "",
        gender: "Not specified",
        parentName: "",
        mobile: "",
        email: "",
        dob: "",
        rollNumber: "",
        bloodGroup: "",
        aadhaarLast4: "",
        previousSchool: "",
      });
    },
  });
  const errors = { ...fieldErrors(studentFormSchema, d), ...serverErrors };
  const error = (key: string) =>
    submitted || d[key] ? errors[key] : undefined;
  if (credentials)
    return (
      <FormDialog
        open={open}
        onClose={() => {
          setCredentials(null);
          onClose();
        }}
        title="Student created — portal credentials"
        submitLabel="Credentials saved"
        onSubmit={(e) => {
          e.preventDefault();
          setCredentials(null);
          onClose();
        }}
      >
        <p>
          Share privately after verifying identity. These credentials are shown
          once.
        </p>
        <p>Portal: /student-portal</p>
        <p>
          Username: <strong>{credentials.username}</strong>
        </p>
        <p>
          Temporary password:{" "}
          <strong className="break-all">{credentials.password}</strong>
        </p>
        <p>
          Expires: {credentials.expiresAt}. The student must change this
          password at first sign-in.
        </p>
      </FormDialog>
    );
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Add student"
      noValidate
      description={
        "Admission for " +
        (boot.years.find((y: Row) => y.id === scope.year)?.name ||
          "selected academic year")
      }
      busy={busy}
      wide
      submitLabel="Add student"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitted(true);
        const valid = studentFormSchema.safeParse(d);
        if (!valid.success) {
          reveal(valid.error.issues[0].path[0] as string);
          toast.error("Check the highlighted fields.");
          return;
        }
        if (busy) return;
        setServerErrors({});
        setBusy(true);
        try {
          const body = Object.fromEntries(
            Object.entries({ ...d, yearId: scope.year }).filter(
              ([_, v]) => v !== "",
            ),
          );
          const result = await request("students", { method: "POST", body });
          toast.success("Student and guardian records saved.");
          draft.clear();
          refresh();
          if (result.credentials) setCredentials(result.credentials);
          else onClose();
        } catch (e) {
          if (e instanceof ClientError) {
            const fields = Object.fromEntries(
              Object.entries(e.fields || {}).map(([k, v]) => [k, v[0]]),
            );
            if (e.code === "DUPLICATE_RECORD")
              fields.admissionNumber = "This admission number already exists.";
            setServerErrors(fields);
            const first = Object.keys(fields).find((k) => k in d);
            if (first) reveal(first);
          }
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <DraftNotice status={draft.status} onDiscard={draft.discard} />
      {submitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600">
          Check student and guardian details:{" "}
          {Object.values(errors).join(" · ")}
        </p>
      )}
      <div ref={formRef}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="form-tabs">
            <TabsTrigger
              value="student"
              aria-invalid={
                submitted &&
                Object.keys(errors).some(
                  (k) => studentFieldTab(k) === "student",
                )
              }
            >
              Student details
              {submitted &&
                Object.keys(errors).some(
                  (k) => studentFieldTab(k) === "student",
                ) && <span aria-label="Contains errors"> !</span>}
            </TabsTrigger>
            <TabsTrigger
              value="guardian"
              aria-invalid={
                submitted &&
                Object.keys(errors).some(
                  (k) => studentFieldTab(k) === "guardian",
                )
              }
            >
              Parent / guardian
              {submitted &&
                Object.keys(errors).some(
                  (k) => studentFieldTab(k) === "guardian",
                ) && <span aria-label="Contains errors"> !</span>}
            </TabsTrigger>
            <TabsTrigger
              value="additional"
              aria-invalid={
                submitted &&
                Object.keys(errors).some(
                  (k) => studentFieldTab(k) === "additional",
                )
              }
            >
              Additional details
              {submitted &&
                Object.keys(errors).some(
                  (k) => studentFieldTab(k) === "additional",
                ) && <span aria-label="Contains errors"> !</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="student">
            <div className="form-grid">
              <Field
                label="Student name"
                fieldName="name"
                error={error("name")}
                required
              >
                <Input
                  required
                  value={d.name}
                  onChange={set("name")}
                  placeholder="Full name"
                />
              </Field>
              <Field
                label="Admission number"
                fieldName="admissionNumber"
                error={error("admissionNumber")}
                required
              >
                <Input
                  required
                  value={d.admissionNumber}
                  onChange={set("admissionNumber")}
                  placeholder="CSA/26/0101"
                />
              </Field>
              <Field
                label="Class / section"
                fieldName="sectionId"
                error={error("sectionId")}
                required
                className="span-2"
              >
                <Picker
                  value={d.sectionId}
                  onChange={(v) => setD({ ...d, sectionId: v })}
                  placeholder="Choose class and section"
                  options={[
                    { value: "", label: "Choose class and section" },
                    ...boot.sections
                      .filter((s: Row) => s.academic_year_id === scope.year)
                      .map((s: Row) => ({
                        value: s.id,
                        label: `${s.class_name} · ${s.name}${s.stream_name ? " · " + s.stream_name : ""}`,
                      })),
                  ]}
                />
              </Field>
              <Field label="Date of birth" fieldName="dob" error={error("dob")}>
                <Input type="date" value={d.dob} onChange={set("dob")} />
              </Field>
              <Field label="Gender">
                <Picker
                  value={d.gender}
                  onChange={(v) => setD({ ...d, gender: v })}
                  options={["Not specified", "Male", "Female", "Other"].map(
                    (v) => ({ value: v, label: v }),
                  )}
                />
              </Field>
              <Field
                label="Roll number"
                fieldName="rollNumber"
                error={error("rollNumber")}
              >
                <Input value={d.rollNumber} onChange={set("rollNumber")} />
              </Field>
              <Field
                label="Blood group"
                fieldName="bloodGroup"
                error={error("bloodGroup")}
              >
                <Input
                  value={d.bloodGroup}
                  onChange={set("bloodGroup")}
                  placeholder="e.g. O+"
                />
              </Field>
            </div>
          </TabsContent>
          <TabsContent value="guardian">
            <div className="form-grid">
              <Field
                label="Parent / guardian name"
                fieldName="parentName"
                error={error("parentName")}
                required
                className="span-2"
              >
                <Input
                  value={d.parentName}
                  onChange={set("parentName")}
                  placeholder="Full name"
                />
              </Field>
              <Field
                label="Mobile number"
                fieldName="mobile"
                error={error("mobile")}
                required
              >
                <Input
                  value={d.mobile}
                  onChange={set("mobile")}
                  pattern="[6-9][0-9]{9}"
                  inputMode="tel"
                  placeholder="10-digit mobile"
                />
              </Field>
              <Field label="Email" fieldName="email" error={error("email")}>
                <Input
                  type="email"
                  value={d.email}
                  onChange={set("email")}
                  placeholder="parent@example.com"
                />
              </Field>
              <p className="form-note span-2">
                You can link an existing guardian to multiple children from the
                student profile.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="additional">
            <div className="form-grid">
              <Field
                label="Aadhaar last 4 digits"
                fieldName="aadhaarLast4"
                error={error("aadhaarLast4")}
                hint="Only the masked identifier is stored."
              >
                <Input
                  value={d.aadhaarLast4}
                  onChange={set("aadhaarLast4")}
                  pattern="[0-9]{4}"
                  maxLength={4}
                />
              </Field>
              <Field
                label="Previous school"
                fieldName="previousSchool"
                error={error("previousSchool")}
              >
                <Input
                  value={d.previousSchool}
                  onChange={set("previousSchool")}
                />
              </Field>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </FormDialog>
  );
}
