"use client";
import { AppLink as Link } from "@/lib/browser-navigation";
import { SmsSetup, SignOut } from "./SmsLogin";

import { createResourceClient } from "@/lib/resource-client";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import { usePathname } from "@/lib/browser-navigation";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Access, BootScreen } from "./Access";

import type { Row } from "./context";
import { Button, Card, PageHead } from "./ui";
const PlatformApp = lazy(() => import("@/features/platform/App"));
const CampusApp = lazy(() => import("./App"));
export default function Entry() {
  const path = usePathname().replace(/\/+$/, "") || "/",
    router = useRouter();
  const [session, setSession] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [retry, setRetry] = useState(0),
    [domainReady, setDomainReady] = useState(false),
    [domainSlug, setDomainSlug] = useState<string | null>(null);
  const client = useMemo(() => createResourceClient(api), []);
  useEffect(() => {
    let active = true;
    client
      .request<Row>("domain/context")
      .then((d) => {
        if (!active) return;
        setDomainSlug(d.institution?.slug || null);
        setDomainReady(true);
      })
      .catch((e) => {
        if (!active) return;
        setError(e);
        setDomainReady(true);
      });
    return () => {
      active = false;
    };
  }, [retry, client]);
  useEffect(() => {
    if (!domainSlug) return;
    const base = "/campus/" + domainSlug;
    if (path !== base && !path.startsWith(base + "/"))
      router.replace(
        base + (path === "/" || path.startsWith("/admin") ? "" : path),
      );
  }, [domainSlug, path, router]);
  useEffect(() => {
    if (!domainReady || domainSlug) return;
    if (
      path.startsWith("/campus/") ||
      path.startsWith("/admin") ||
      path === "/auth/setup"
    )
      return;
    let active = true;
    client
      .request("session")
      .then((s) => {
        if (active) setSession(s);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [path, retry, domainReady, domainSlug, client]);
  useEffect(() => {
    if (domainSlug) return;
    if (!session || path.startsWith("/campus/") || path.startsWith("/admin"))
      return;
    if (session.platform) router.replace("/admin");
    else if (session.memberships.length === 1 && !session.organizations?.length)
      router.replace(
        "/campus/" +
          session.memberships[0].slug +
          (["/", "/campus"].includes(path) ? "" : path),
      );
  }, [session, path, router, domainSlug]);
  if (!domainReady) return <BootScreen />;
  if (domainSlug && !path.startsWith("/campus/" + domainSlug))
    return <BootScreen />;
  if (path === "/auth/setup") return <SmsSetup />;
  if (path.startsWith("/campus/"))
    return (
      <Suspense fallback={<BootScreen />}>
        <CampusApp key={path.split("/")[2]} slug={path.split("/")[2]} />
      </Suspense>
    );
  if (path.startsWith("/admin"))
    return (
      <Suspense fallback={<BootScreen />}>
        <PlatformApp initialSession={session} />
      </Suspense>
    );
  if (path === "/parent" || path.startsWith("/pay/"))
    return (
      <div className="portal-chooser">
        <PageHead
          title="Portal unavailable"
          description="Contact your institution accounts office for fee assistance."
        />
        <Link prefetch={false} href="/">
          Return to Sohan Soft Tech
        </Link>
      </div>
    );
  if (error)
    return (
      <Access
        error={error}
        retry={() => {
          client.invalidate();
          setError(null);
          setRetry((v) => v + 1);
        }}
      />
    );
  if (
    !session ||
    session.platform ||
    (session.memberships.length === 1 && !session.organizations?.length)
  )
    return <BootScreen />;
  return (
    <div className="portal-chooser">
      <PageHead
        title="Your institutions"
        description={
          session.memberships.length
            ? "Choose an institution to open its fee workspace."
            : "Ask your institution administrator to grant staff access to your registered staff email."
        }
      />
      <div className="institution-choice-grid">
        {session.organizations?.map((o: Row) => (
          <Card key={o.id}>
            <h2>{o.name}</h2>
            <p>Trust / group reports</p>
            <Link prefetch={false} href={"/organization/" + o.id}>
              Open consolidated reports
            </Link>
          </Card>
        ))}
        {session.memberships.map((m: Row) => (
          <Card key={m.institution_id}>
            <h2>{m.institution_name}</h2>
            <p>{m.role.toLowerCase().replaceAll("_", " ")}</p>
            <Button onClick={() => router.push("/campus/" + m.slug)}>
              Open institution
            </Button>
          </Card>
        ))}
      </div>
      <SignOut />
    </div>
  );
}
