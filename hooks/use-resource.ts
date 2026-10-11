"use client";
import { useEffect, useState } from "react";
import type { ResourceRequest } from "@/lib/resource-client";

export function useRequestResource<T>(
  request: ResourceRequest,
  path: string | null,
  revision: number,
) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([path, revision, retry]);
  const [state, setState] = useState<{
    key: string;
    request: ResourceRequest;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ key, request, data: null, loading: true, error: null });
  useEffect(() => {
    if (path === null) return;
    const abort = new AbortController();
    request<T>(path, { signal: abort.signal }).then(
      (data) => {
        if (!abort.signal.aborted)
          setState({ key, request, data, loading: false, error: null });
      },
      (error: Error) => {
        if (!abort.signal.aborted)
          setState({
            key,
            request,
            data: null,
            loading: false,
            error: error.message,
          });
      },
    );
    return () => abort.abort();
  }, [path, revision, retry, request, key]);
  // No stale rows from the previous route, student, or filter even during the
  // render before effect cleanup. Late completions cannot overwrite new data.
  const current =
    path === null
      ? { data: null, loading: false, error: null }
      : state.key === key && state.request === request
        ? state
        : { data: null, loading: true, error: null };
  return { ...current, retry: () => setRetry((v) => v + 1) };
}
