"use client";
import type { PlatformPermission } from "@/lib/platform-permissions";
import type { Row } from "@/components/campus/context";
import { api } from "@/lib/api-client";
import { createContext, useContext } from "react";
import { useRequestResource } from "@/hooks/use-resource";
import type { ResourceRequest } from "@/lib/resource-client";
export const platformRequest = <T = any,>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
) => api<T>("platform/" + path, options);
export const PlatformContext = createContext<{
  user: Row;
  primary: boolean;
  can: (permission: PlatformPermission) => boolean;
  request: ResourceRequest;
  revision: number;
  refresh: () => void;
} | null>(null);
export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("Platform context unavailable");
  return value;
}
export function usePlatformResource<T = any>(path: string | null) {
  const { revision, request } = usePlatform();
  return useRequestResource<T>(request, path, revision);
}
