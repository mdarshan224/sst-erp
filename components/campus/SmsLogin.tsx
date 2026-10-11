"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button, Field, Input } from "./ui";
export function SmsLogin({
  retry,
  setup = false,
}: {
  retry: () => void;
  setup?: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [mobile, setMobile] = useState(""),
    [key, setKey] = useState(""),
    [challenge, setChallenge] = useState(""),
    [otp, setOtp] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [wait, setWait] = useState(0),
    [expires, setExpires] = useState(0);
  useEffect(() => {
    api("auth/status")
      .then((s) => setEnabled(s.enabled))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!wait && !expires) return;
    const timer = setInterval(() => {
      setWait((v) => Math.max(0, v - 1));
      setExpires((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [wait, expires]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await api("auth/verify", {
          method: "POST",
          body: { challengeId: challenge, otp },
        });
        setKey("");
        window.location.assign(setup ? "/admin" : window.location.pathname);
        return;
      }
      const result = await api(setup ? "auth/configure" : "auth/send", {
        method: "POST",
        body: setup
          ? { mobile, apiKey: key, template: "7a563a8ad5" }
          : { mobile },
      });
      setChallenge(result.challengeId);
      setKey("");
      setWait(60);
      setExpires(result.expiresIn);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (enabled === null)
    return <p>{error || "Checking sign-in configuration…"}</p>;
  if (setup && enabled)
    return (
      <p>
        SMS login is enabled. <a href="/admin">Open Platform Dashboard</a>
      </p>
    );
  if (!setup && !enabled)
    return (
      <>
        <p>SMS sign-in requires owner setup.</p>
        <a className="login-button" href="/auth/setup">
          Configure SMS sign-in
        </a>
        <a
          className="access-help"
          href="/signin-with-chatgpt?return_to=/admin/settings"
        >
          Existing account access during migration
        </a>
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="settings-form"
    >
      {setup && !challenge && (
        <>
          <p>
            Verify the platform owner's mobile before switching authentication.
            Existing institutions and staff access are preserved.
          </p>
          <Field label="Fast2SMS API key">
            <Input
              type="password"
              autoComplete="off"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <small>
            OTP template: 7a563a8ad5. Credentials are encrypted on the server.
          </small>
        </>
      )}
      <Field label="Mobile number">
        <Input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="[6-9][0-9]{9}"
          maxLength={10}
          required
          disabled={!!challenge}
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      {challenge && (
        <Field label="Six-digit OTP">
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      )}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy || (!!challenge && expires === 0)}>
        {busy
          ? "Please wait…"
          : challenge
            ? setup
              ? "Verify & activate SMS login"
              : "Verify & sign in"
            : "Send OTP"}
      </Button>
      {challenge && (
        <>
          <small>
            {expires
              ? `Code expires in ${Math.ceil(expires / 60)} min.`
              : "Code expired. Request a new code."}
          </small>
          <Button
            type="button"
            disabled={busy || wait > 0 || expires === 0}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("auth/resend", {
                  method: "POST",
                  body: { challengeId: challenge },
                });
                setWait(60);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {wait ? `Resend in ${wait}s` : "Resend OTP"}
          </Button>
          {expires === 0 && (
            <Button
              type="button"
              onClick={() => {
                setChallenge("");
                setOtp("");
              }}
            >
              Request new code
            </Button>
          )}
        </>
      )}
      {!setup && (
        <small>
          Use the mobile number registered by your institution administrator.
        </small>
      )}
    </form>
  );
}
export function SmsSetup() {
  const [active, setActive] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("auth/status")
      .then((s) => setActive(s.enabled))
      .catch(() => {});
    api("session")
      .then((s) => setAllowed(s.platform))
      .catch((e) => {
        setAllowed(false);
        setError(e.message);
      });
  }, []);
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Set up SMS login</h1>
        {allowed === null ? (
          <p>Checking owner access…</p>
        ) : allowed ? (
          <SmsLogin setup retry={() => {}} />
        ) : active ? (
          <SmsLogin retry={() => window.location.reload()} />
        ) : (
          <>
            <p role="alert">{error || "Platform owner access required."}</p>
            <a
              className="login-button"
              href="/signin-with-chatgpt?return_to=/auth/setup"
            >
              Verify existing owner account for migration
            </a>
          </>
        )}
        <a className="access-help" href="/admin">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
export function SignOut({ children }: { children?: React.ReactNode }) {
  return (
    <a
      href="#"
      onClick={async (e) => {
        e.preventDefault();
        try {
          const s = await api("auth/status");
          if (!s.enabled) {
            window.location.assign("/signout-with-chatgpt?return_to=/");
            return;
          }
          await api("auth/logout", { method: "POST", body: {} });
          window.location.assign("/");
        } catch {
          window.location.reload();
        }
      }}
    >
      {children || "Sign out"}
    </a>
  );
}
