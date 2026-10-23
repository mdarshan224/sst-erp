"use client";
import { InstitutionLogo } from "./InstitutionLogo";
import { AppLink as Link } from "@/lib/browser-navigation";
import { platformLogo, platformColor, brandTheme } from "@/lib/branding";
import { SmsLogin, SignOut } from "./SmsLogin";
import { api, ClientError } from "@/lib/api-client";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { Row } from "./context";
import { Button } from "./ui";
export function InstitutionAccess({
  slug,
  error,
  retry,
}: {
  slug: string;
  error: ClientError;
  retry: () => void;
}) {
  const [portal, setPortal] = useState<Row | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => {
    api("portal/" + slug)
      .then(setPortal)
      .catch(() => {});
  }, [slug]);
  useEffect(() => {
    if (error.status !== 403) return;
    api("session")
      .then((s) => setPlatformAdmin(!!s.platform))
      .catch(() => {});
  }, [error.status]);
  return (
    <Access
      error={error}
      retry={retry}
      name={portal?.name || "Institution portal"}
      logo={portal?.logoUrl}
      returnTo={"/campus/" + slug}
      color={portal?.primaryColor}
      supportHref={
        platformAdmin && portal
          ? "https://erp.sohansoft.in/admin/institutions/" +
            portal.id +
            "?support=1"
          : undefined
      }
    />
  );
}
export function Access({
  error,
  retry,
  name = "Sohan Soft Tech",
  logo,
  returnTo = "/",
  color = platformColor,
  supportHref,
}: {
  error: ClientError;
  retry: () => void;
  name?: string;
  logo?: string;
  returnTo?: string;
  color?: string;
  supportHref?: string;
}) {
  return (
    <div
      className="login-page"
      style={brandTheme(color) as React.CSSProperties}
    >
      <div className="login-brand">
        <img
          className="brand-logo"
          src={platformLogo}
          alt="Sohan Soft Tech logo"
        />
        Sohan Soft Tech
      </div>
      <div className="login-card">
        {logo ? (
          <InstitutionLogo className="portal-logo" src={logo} name={name} />
        ) : (
          <span className="login-icon">
            <Building2 size={30} />
          </span>
        )}
        <h1>{name}</h1>
        <p>
          {error.status === 401
            ? "Fees management · Staff sign in"
            : supportHref
              ? "Open this institution using your audited Platform Administrator access."
              : error.message}
        </p>
        {error.status === 401 ? (
          <SmsLogin retry={retry} />
        ) : (
          <>
            {supportHref && (
              <a className="login-button" href={supportHref}>
                Access as Institution Admin
              </a>
            )}
            <Button onClick={retry}>Check access again</Button>
            <Link prefetch={false} className="access-help" href="/admin">
              Platform administrator sign in
            </Link>
            <SignOut>Sign out to use another account</SignOut>
          </>
        )}
        <small>
          <ShieldCheck size={14} /> Sohan Soft Tech · Secure institution access
        </small>
      </div>
    </div>
  );
}
export function BootScreen() {
  return (
    <div className="app-boot">
      <img
        className="brand-logo"
        src={platformLogo}
        alt="Sohan Soft Tech logo"
      />
      <strong>Sohan Soft Tech</strong>
      <Loader2 className="animate-spin" size={24} />
    </div>
  );
}
