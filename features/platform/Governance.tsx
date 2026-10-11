"use client";
import { AppLink } from "@/lib/browser-navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Card,
  Field,
  Input,
  Loading,
  Failure,
  PageHead,
  Picker,
} from "@/components/campus/ui";
import { usePlatform, usePlatformResource } from "./context";
import type { Row } from "@/components/campus/context";
export function Governance() {
  const { request, refresh, primary } = usePlatform(),
    r = usePlatformResource("roles"),
    [role, setRole] = useState<Row>({
      name: "",
      permissions: [],
      active: true,
    }),
    [admin, setAdmin] = useState<Row>({
      name: "",
      email: "",
      mobile: "",
      roleId: "",
      active: true,
    }),
    [busy, setBusy] = useState(false);
  if (!primary)
    return (
      <Failure
        message="Only the primary administrator can configure platform access."
        retry={() => r.retry()}
      />
    );
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const save = async (path: string, body: Row) => {
    setBusy(true);
    try {
      await request(path, { method: "POST", body });
      refresh();
      toast.success("Platform access updated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead
        title="Roles & Administrators"
        description="Platform permissions are enforced on every server request. The primary administrator remains protected."
      />
      <Card title="Platform roles">
        <div className="admin-access-list">
          {r.data.roles.map((v: Row) => (
            <Button
              key={v.id}
              variant="outline"
              onClick={() =>
                setRole({
                  ...v,
                  active: !!v.active,
                  permissions: JSON.parse(v.permissions),
                })
              }
            >
              {v.name} {v.active ? "" : "(disabled)"}
            </Button>
          ))}
          <Button
            variant="outline"
            onClick={() => setRole({ name: "", permissions: [], active: true })}
          >
            New Role
          </Button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save("roles" + (role.id ? "/" + role.id : ""), role);
          }}
        >
          <Field label="Role name">
            <Input
              required
              value={role.name}
              onChange={(e) => setRole({ ...role, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {r.data.permissions.map((p: string) => (
              <label key={p} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={role.permissions.includes(p)}
                  onChange={(e) =>
                    setRole({
                      ...role,
                      permissions: e.target.checked
                        ? [...role.permissions, p]
                        : role.permissions.filter((v: string) => v !== p),
                    })
                  }
                />
                {p}
              </label>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={role.active}
              onChange={(e) => setRole({ ...role, active: e.target.checked })}
            />{" "}
            Active role
          </label>
          <Button disabled={busy} type="submit">
            Save Role
          </Button>
        </form>
      </Card>
      <Card title="Administrator access">
        <div className="admin-access-list">
          {r.data.administrators.map((a: Row) => (
            <div key={a.user_id}>
              <strong>{a.name}</strong> · {a.email} ·{" "}
              {a.role_name || "Primary administrator"}{" "}
              {a.active ? "" : "(disabled)"}
              {a.user_id !== r.data.primaryUserId && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setAdmin({
                      name: a.name,
                      email: a.email,
                      mobile: a.mobile || "",
                      roleId: a.role_id || "",
                      active: !!a.active,
                    })
                  }
                >
                  Edit access
                </Button>
              )}
            </div>
          ))}
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save("administrators", admin);
          }}
        >
          {["name", "email", "mobile"].map((k) => (
            <Field key={k} label={k}>
              <Input
                required
                value={admin[k]}
                onChange={(e) => setAdmin({ ...admin, [k]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Role">
            <Picker
              value={admin.roleId}
              onChange={(roleId) => setAdmin({ ...admin, roleId })}
              options={r.data.roles
                .filter((v: Row) => v.active)
                .map((v: Row) => ({ value: v.id, label: v.name }))}
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={admin.active}
              onChange={(e) => setAdmin({ ...admin, active: e.target.checked })}
            />{" "}
            Active administrator
          </label>
          <Button disabled={busy} type="submit">
            Save Administrator
          </Button>
        </form>
      </Card>
    </>
  );
}
export function CleanupPreview() {
  const r = usePlatformResource("cleanup");
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  return (
    <>
      <PageHead
        title="Institution cleanup review"
        description="No automatic deletion. Review current use and confirm each institution separately."
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Status</th>
                <th>Review</th>
                <th>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {r.data.rows.map((i: Row) => (
                <tr key={i.id}>
                  <td className="p-3">
                    {i.name}
                    <small className="block">{i.institution_code}</small>
                  </td>
                  <td>{i.status}</td>
                  <td>{i.classification}</td>
                  <td>
                    <AppLink href={"/admin/institutions/" + i.id}>
                      Review Institution
                    </AppLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
export function InstitutionDeletion({ id }: { id: string }) {
  const { request, refresh } = usePlatform(),
    r = usePlatformResource("institutions/" + id + "/deletion"),
    [action, setAction] = useState("restore"),
    [name, setName] = useState(""),
    [warning, setWarning] = useState(false),
    [challenge, setChallenge] = useState<Row | null>(null),
    [otp, setOtp] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [failure, setFailure] = useState(""),
    [clock, setClock] = useState(0);
  const inFlight = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const call = async (suffix: string, body: Row) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const result = await request(
        "institutions/" + id + "/deletion/" + suffix,
        { method: "POST", body },
      );
      refresh();
      return result;
    } catch (e) {
      setFailure((e as Error).message);
      toast.error((e as Error).message);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const resume = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    let processed = 0;
    try {
      for (let n = 0; n < 50 && mounted.current; n++) {
        const result = await request<Row>(
          "institutions/" + id + "/deletion/resume",
          { method: "POST", body: {} },
        );
        processed += result.processed || 0;
        if (mounted.current)
          setProgress(
            `${result.status}: ${processed} records processed in this run. Batch ${n + 1}.`,
          );
        if (!result.hasMore) {
          toast.success("Permanent operational cleanup completed.");
          break;
        }
        if (n === 49)
          toast("Progress saved. Continue cleanup for the next batch.");
      }
    } catch (error) {
      if (mounted.current) setFailure((error as Error).message);
      toast.error((error as Error).message);
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        refresh();
      }
    }
  };
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const { job, inventory, institution } = r.data,
    expired = challenge && Date.parse(challenge.expiresAt) <= clock;
  return (
    <Card title="Permanent deletion & recovery">
      <p className="platform-help">{inventory.policy}</p>
      {progress && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"
        >
          {progress}
        </p>
      )}
      {(failure || job?.error) && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {failure || job.error}. Progress is saved; resolve the error before
          resuming.
        </p>
      )}
      <p>
        <strong>Status: {job?.status || "Not requested"}</strong>
        {job && (
          <> · Recovery until {new Date(job.recovery_until).toLocaleString()}</>
        )}
      </p>
      <div className="overflow-x-auto max-h-72">
        <table className="w-full text-sm text-left">
          <thead>
            <tr>
              <th>Data</th>
              <th>Records</th>
              <th>Disposition</th>
            </tr>
          </thead>
          <tbody>
            {inventory.entries
              .filter((e: Row) => e.count)
              .map((e: Row) => (
                <tr key={e.table}>
                  <td>{e.table}</td>
                  <td>{e.count}</td>
                  <td>
                    {e.retained
                      ? "Retain: " + e.reason
                      : "Delete after quarantine"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {job && ["Purging", "Objects"].includes(job.status) ? (
        <Button disabled={busy} onClick={resume}>
          {busy ? "Processing safely…" : "Continue resumable cleanup"}
        </Button>
      ) : job?.status === "Completed" ? (
        <p>
          Operational cleanup completed. Statutory history and encrypted
          recovery archives remain restricted.
        </p>
      ) : (
        <div className="grid gap-4 mt-6">
          <Field label="Action">
            <Picker
              value={action}
              onChange={(v) => {
                setAction(v);
                setChallenge(null);
                setOtp("");
                setWarning(false);
              }}
              options={
                job?.status === "Quarantined"
                  ? [
                      {
                        value: "restore",
                        label: "Restore during recovery window",
                      },
                      {
                        value: "finalize",
                        label: "Permanent cleanup after recovery window",
                      },
                    ]
                  : [
                      {
                        value: "request",
                        label: "Request deletion (seven-day quarantine)",
                      },
                    ]
              }
            />
          </Field>
          <Field
            label={
              "Type institution name exactly: " +
              (job?.institution_name || institution.name)
            }
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={warning}
              onChange={(e) => setWarning(e.target.checked)}
            />
            <span>
              Second warning: I have verified this institution and explicitly
              authorize this action. Permanent cleanup cannot be undone
              automatically; financial and audit retention remains in force.
            </span>
          </label>
          <Button
            variant="outline"
            disabled={
              busy ||
              !warning ||
              name !== (job?.institution_name || institution.name)
            }
            onClick={async () => {
              const c = await call("challenge", {
                action: job?.status === "Quarantined" ? action : "request",
              });
              if (c) {
                setChallenge(c);
                setOtp("");
              }
            }}
          >
            Send fresh Super Admin OTP
          </Button>
          {challenge && (
            <>
              <p>
                Code sent to {challenge.mobile}. Expires{" "}
                {new Date(challenge.expiresAt).toLocaleTimeString()}. Maximum
                five attempts.
              </p>
              <Field label="Security OTP">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Button
                disabled={
                  busy ||
                  !!expired ||
                  otp.length !== 6 ||
                  !warning ||
                  name !== (job?.institution_name || institution.name)
                }
                onClick={async () => {
                  const result = await call(
                    job?.status === "Quarantined" ? action : "request",
                    {
                      institutionName: name,
                      secondWarningAccepted: warning,
                      challengeId: challenge.challengeId,
                      otp,
                    },
                  );
                  if (result) {
                    setChallenge(null);
                    setOtp("");
                    toast.success("Workflow updated.");
                  }
                }}
              >
                Confirm authorized action
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
