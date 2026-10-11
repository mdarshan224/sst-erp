export type ResourceOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};
export type ResourceRequest = <T = any>(
  path: string,
  options?: ResourceOptions,
) => Promise<T>;

// One client per mounted, authenticated workspace. Never store this cache in
// localStorage or on the server: institutions and sessions cannot share entries.
export function createResourceClient(
  fetcher: ResourceRequest,
  ttl = 15_000,
  limit = 80,
) {
  type Entry = { promise: Promise<unknown>; expires: number; pending: boolean };
  const entries = new Map<string, Entry>();
  let generation = 0;
  const invalidate = () => {
    generation++;
    entries.clear();
  };
  const request: ResourceRequest = <T>(
    path: string,
    options: ResourceOptions = {},
  ) => {
    if (options.signal?.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    if ((options.method || "GET").toUpperCase() !== "GET") {
      invalidate();
      return fetcher<T>(path, options).finally(invalidate);
    }
    const separator = path.indexOf("?");
    const route = separator < 0 ? path : path.slice(0, separator);
    const search = separator < 0 ? "" : path.slice(separator + 1);
    const params = new URLSearchParams(search);
    params.sort();
    const key = route + "?" + params.toString();
    let entry = entries.get(key);
    if (entry && !entry.pending && entry.expires <= Date.now()) {
      entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const version = generation;
      // Cancellation belongs to the subscriber, not the shared fetch. A tab
      // change or StrictMode cleanup must not abort another mounted consumer.
      entry = { promise: Promise.resolve(), expires: 0, pending: true };
      const current = entry;
      entry.promise = fetcher(path, { ...options, signal: undefined }).then(
        (value) => {
          if (version === generation && entries.get(key) === current) {
            current.pending = false;
            // Bootstrap is authoritative for permissions/subscription changes.
            current.expires = Date.now() + (route === "bootstrap" ? 0 : ttl);
          }
          return value;
        },
        (error) => {
          if (
            (error as { status?: number }).status === 401 ||
            (error as { status?: number }).status === 403
          )
            invalidate();
          else if (entries.get(key) === current) entries.delete(key);
          throw error;
        },
      );
      entries.set(key, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    }
    // Touch on access so frequently revisited sections survive bounded eviction.
    entries.delete(key);
    entries.set(key, entry);
    const promise = entry.promise as Promise<T>;
    if (!options.signal) return promise;
    const signal = options.signal;
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      promise
        .then(
          (value) => {
            if (!signal.aborted) resolve(value);
          },
          (error) => {
            if (!signal.aborted) reject(error);
          },
        )
        .finally(() => signal.removeEventListener("abort", abort));
    });
  };
  return { request, invalidate };
}
