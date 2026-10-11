"use client";
import {
  platformPagePermission,
  type PlatformPermission,
} from "@/lib/platform-permissions";
import { AppLink as Link } from "@/lib/browser-navigation";
import { platformLogo, platformColor, brandTheme } from "@/lib/branding";
import { SignOut } from "@/components/campus/SmsLogin";
import { Access, BootScreen } from "@/components/campus/Access";
import type { Row } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";

import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import {
  Building2,
  ChartNoAxesCombined,
  CreditCard,
  Globe2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ScrollText,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { usePathname } from "@/lib/browser-navigation";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Loading } from "@/components/campus/ui";
import { createResourceClient } from "@/lib/resource-client";
import { Toaster } from "sonner";
import { PlatformContext } from "./context";

const InstitutionForm = lazy(() =>
  import("@/features/auth/InstitutionForm").then((m) => ({
    default: m.InstitutionForm,
  })),
);
const AdminDashboard = lazy(() =>
  import("@/features/auth/AdminDashboard").then((m) => ({
    default: m.AdminDashboard,
  })),
);
const Institutions = lazy(() =>
  import("@/features/auth/Institutions").then((m) => ({
    default: m.Institutions,
  })),
);
const InstitutionDetail = lazy(() =>
  import("./InstitutionDetail").then((m) => ({ default: m.InstitutionDetail })),
);
const Plans = lazy(() => import("./Plans").then((m) => ({ default: m.Plans })));
const Organizations = lazy(() =>
  import("./Organizations").then((m) => ({ default: m.Organizations })),
);
const CloudflareSetup = lazy(() =>
  import("./ServiceSetup").then((m) => ({ default: m.CloudflareSetup })),
);
const Holidays = lazy(() => import("./Holidays"));
const PlatformRegister = lazy(() =>
  import("./Registers").then((m) => ({ default: m.PlatformRegister })),
);
const PlatformSettings = lazy(() =>
  import("./Registers").then((m) => ({ default: m.PlatformSettings })),
);
const Governance = lazy(() =>
  import("./Governance").then((m) => ({ default: m.Governance })),
);
const CleanupPreview = lazy(() =>
  import("./Governance").then((m) => ({ default: m.CleanupPreview })),
);
const navigation = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "Organizations & Trusts",
    href: "/admin/organizations",
    icon: Building2,
  },
  { label: "Institutions", href: "/admin/institutions", icon: Building2 },
  {
    label: "Create Institution",
    href: "/admin/institutions/new",
    icon: Plus,
    child: true,
  },
  {
    label: "Plans",
    href: "/admin/plans",
    icon: Layers3,
    group: "Subscriptions",
  },
  {
    label: "Active Subscriptions",
    href: "/admin/subscriptions",
    icon: CreditCard,
  },
  { label: "Payments", href: "/admin/payments", icon: CreditCard },
  {
    label: "Payment attempts",
    href: "/admin/billing-orders",
    icon: CreditCard,
    child: true,
  },
  { label: "Holidays", href: "/admin/holidays", icon: Globe2 },
  { label: "Domains", href: "/admin/domains", icon: Globe2 },
  { label: "Usage", href: "/admin/usage", icon: ChartNoAxesCombined },
  { label: "Audit Logs", href: "/admin/audit", icon: ScrollText },
  { label: "Roles & Administrators", href: "/admin/roles", icon: ShieldCheck },
  { label: "Cleanup Review", href: "/admin/cleanup", icon: ScrollText },
  { label: "Platform Settings", href: "/admin/settings", icon: Settings2 },
];
export default function PlatformApp({
  initialSession,
}: {
  initialSession?: Row | null;
}) {
  const path = usePathname(),
    router = useRouter(),
    [session, setSession] = useState<Row | null>(
      initialSession?.platform ? initialSession : null,
    ),
    [error, setError] = useState<ClientError | null>(null),
    [retry, setRetry] = useState(0),
    [revision, setRevision] = useState(0),
    [menu, setMenu] = useState(false),
    [platformName, setPlatformName] = useState("Sohan Soft Tech");
  const client = useMemo(
    () =>
      createResourceClient(<T,>(path: string, options = {}) =>
        api<T>("platform/" + path, options),
      ),
    [],
  );
  const refresh = useCallback(() => {
    client.invalidate();
    setRevision((v) => v + 1);
  }, [client]);
  useEffect(() => {
    if (initialSession?.platform && retry === 0) return;
    let active = true;
    api("session")
      .then((s) => {
        if (!s.platform)
          throw new ClientError(
            "This dashboard is available to platform administrators. Open your institution portal to continue.",
            "PLATFORM_ACCESS_REQUIRED",
            403,
          );
        if (active) setSession(s);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [retry, initialSession]);
  useEffect(() => {
    if (session?.platformPermissions?.includes("settings.view"))
      client
        .request("settings")
        .then((data) =>
          setPlatformName(data.settings.platformName || "Sohan Soft Tech"),
        )
        .catch(() => {});
  }, [session, revision, client]);
  useEffect(() => setMenu(false), [path]);
  if (error)
    return (
      <Access
        error={error}
        name="Sohan Soft Tech Platform"
        returnTo="/admin"
        retry={() => {
          setError(null);
          setRetry((v) => v + 1);
        }}
      />
    );
  if (!session) return <BootScreen />;
  const parts = path.split("/").filter(Boolean),
    current = parts[1] || "";
  const can = (p: PlatformPermission) =>
    !!session.platformPermissions?.includes(p);
  let page: React.ReactNode;
  if (!current) page = <AdminDashboard />;
  else if (current === "institutions" && parts[2] && parts[2] !== "new")
    page = <InstitutionDetail key={parts[2]} id={parts[2]} />;
  else if (current === "institutions") page = <Institutions />;
  else if (current === "organizations") page = <Organizations />;
  else if (current === "plans") page = <Plans />;
  else if (current === "holidays") page = <Holidays />;
  else if (current === "roles") page = <Governance />;
  else if (current === "cleanup") page = <CleanupPreview />;
  else if (current === "domains" && path.endsWith("/setup"))
    page = <CloudflareSetup />;
  else if (current === "settings") page = <PlatformSettings />;
  else page = <PlatformRegister kind={current} />;
  const required = platformPagePermission(path);
  if (
    !required ||
    !can(required) ||
    (current === "roles" && !session.primaryPlatform)
  )
    page = (
      <Access
        error={
          new ClientError(
            "You do not have access to this platform section.",
            "FORBIDDEN",
            403,
          )
        }
        name="Platform access"
        returnTo="/"
        retry={() => setRetry((v) => v + 1)}
      />
    );
  return (
    <PlatformContext.Provider
      value={{
        user: session.user,
        primary: !!session.primaryPlatform,
        can,
        revision,
        refresh,
        request: client.request,
      }}
    >
      <div className="platform-shell">
        <aside className={"platform-sidebar " + (menu ? "open" : "")}>
          <Link prefetch={false} href="/admin" className="platform-brand">
            <img
              className="brand-logo"
              src={platformLogo}
              alt="Sohan Soft Tech logo"
            />
            <span>
              {platformName}
              <small>PLATFORM MANAGEMENT</small>
            </span>
          </Link>
          <div className="platform-access">
            <ShieldCheck size={17} />
            Super Administrator
          </div>
          <nav>
            {navigation
              .filter((n) => {
                const p = platformPagePermission(n.href);
                return (
                  p &&
                  can(p) &&
                  (n.href !== "/admin/roles" || session.primaryPlatform)
                );
              })
              .map((n) => (
                <div key={n.href}>
                  {n.group && <p className="platform-nav-group">{n.group}</p>}
                  <Link
                    prefetch={false}
                    href={n.href}
                    className={
                      (path === n.href ? "active " : "") +
                      (n.child ? "child" : "")
                    }
                  >
                    <n.icon size={18} />
                    {n.label}
                  </Link>
                </div>
              ))}
          </nav>
          <div className="platform-sidebar-footer">
            <strong>{session.user.name}</strong>
            <small>{session.user.email}</small>
            <SignOut>
              <LogOut size={15} />
              Sign out
            </SignOut>
          </div>
        </aside>
        <div className="platform-body">
          <header className="platform-topbar">
            <Button
              variant="ghost"
              size="icon"
              className="platform-menu"
              onClick={() => setMenu((v) => !v)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </Button>
            <span>{platformName} Platform Management</span>
            <span className="platform-topbar-badge">Platform Admin</span>
          </header>
          <main className="platform-main">
            <div key={path} className="workspace-route">
              <Suspense fallback={<Loading />}>{page}</Suspense>
            </div>
            <footer className="workspace-footer">
              <span>Sohan Soft Tech Platform</span>
              <span>Institution management</span>
            </footer>
          </main>
        </div>
        {menu && (
          <button
            className="platform-backdrop"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          />
        )}
      </div>
      {path === "/admin/institutions/new" && can("institutions.create") && (
        <Suspense fallback={<Loading />}>
          <InstitutionForm
            open={path === "/admin/institutions/new"}
            onClose={() => router.push("/admin/institutions")}
            onCreated={async (id) => {
              refresh();
              router.push("/admin/institutions/" + id);
            }}
          />
        </Suspense>
      )}
      <Toaster position="bottom-right" richColors theme="light" />
    </PlatformContext.Provider>
  );
}
