"use client";
import { useRouter } from "@/lib/browser-navigation";
import { en, Language } from "@/lib/i18n";
import { Permission } from "@/lib/permissions";
import { AppLink as Link } from "@/lib/browser-navigation";
import { campusHref } from "@/lib/navigation-target";
import type { ComponentProps } from "react";
import { createContext, useContext, useMemo } from "react";
import { useRequestResource } from "@/hooks/use-resource";
export type Row = Record<string, any>;
export type Scope = {
  year: string;
  campus: string;
  class: string;
  section: string;
  stream: string;
  from: string;
  to: string;
};
export type AppState = {
  boot: Row;
  scope: Scope;
  setScope: (value: Scope) => void;
  revision: number;
  refresh: () => void;
  reload: () => Promise<void>;
  request: <T = any>(
    path: string,
    options?: { method?: string; body?: unknown; signal?: AbortSignal },
  ) => Promise<T>;
  query: (extra?: Record<string, string>) => string;
  t: (key: keyof typeof en) => string;
  admin: boolean;
  collect: boolean;
  finance: boolean;
  language: Language;
  setLanguage: (v: Language) => void;
  institutionId: string;
  setInstitutionId: (v: string) => void;
  basePath: string;
  can: (permission: Permission) => boolean;
};
export const AppContext = createContext<AppState | null>(null);
export const useApp = (manage?: Permission) => {
  const value = useContext(AppContext);
  if (!value) throw new Error("Application context unavailable");
  return manage ? { ...value, admin: value.can(manage) } : value;
};
export function useCampusRouter() {
  const router = useRouter(),
    { basePath } = useApp();
  return useMemo(
    () => ({
      ...router,
      push: (path: string, options?: { scroll?: boolean }) =>
        router.push(campusHref(basePath, path), options),
      replace: (path: string, options?: { scroll?: boolean }) =>
        router.replace(campusHref(basePath, path), options),
    }),
    [router, basePath],
  );
}
export function CampusLink({ href, ...props }: ComponentProps<"a">) {
  const { basePath } = useApp();
  if (
    !href ||
    (props.download !== undefined && props.download !== false) ||
    /^\/api(\/|[?#]|$)/.test(href) ||
    !href.startsWith("/") ||
    href.startsWith("//")
  )
    return <a {...props} href={href} />;
  return <Link {...props} prefetch={false} href={campusHref(basePath, href)} />;
}
export function useResource<T = any>(path: string | null) {
  const { request, revision } = useApp();
  return useRequestResource<T>(request, path, revision);
}
