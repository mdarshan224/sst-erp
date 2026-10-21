const pendingKeys = new Map<string, string>();
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public requestId?: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    institutionId?: string;
    signal?: AbortSignal;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const endpoint = path.replace(/^campus\/[^/]+\//, "");
  const financial =
    options.method === "POST" &&
    /^(payments|refunds|cash|fees|invoices|rollovers|facilities)(\/|$)|^reconciliation\/bank-commit/.test(
      endpoint,
    );
  const bodyKey = (options.body as { idempotencyKey?: string } | undefined)
    ?.idempotencyKey;
  const fingerprint = financial
    ? JSON.stringify([options.institutionId, path, options.body])
    : "";
  // Keep the key after a network/unknown error. Successful intentional repeats
  // get a fresh key; explicit form keys survive retries and double clicks.
  const key =
    options.idempotencyKey ||
    bodyKey ||
    (financial
      ? pendingKeys.get(fingerprint) || crypto.randomUUID()
      : undefined);
  if (financial && key) pendingKeys.set(fingerprint, key);
  const mutation =
    options.method && !["GET", "HEAD", "OPTIONS"].includes(options.method);
  const payload = options.body ?? (mutation ? {} : undefined);
  const response = await fetch("/api/" + path, {
    method: options.method || "GET",
    headers: {
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(options.institutionId
        ? { "X-Institution-ID": options.institutionId }
        : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: options.signal,
    cache: "no-store",
  });
  let result: {
    success?: boolean;
    data: T;
    message?: string;
    errorCode?: string;
    requestId?: string;
    fields?: Record<string, string[]>;
  };
  try {
    result = await response.json();
  } catch {
    throw new ClientError(
      "The server returned an unreadable response. Retry the request; contact support if it persists.",
      "INVALID_RESPONSE",
      response.status,
      response.headers.get("X-Request-ID") || undefined,
    );
  }
  if (!result || typeof result !== "object")
    throw new ClientError(
      "The server returned an invalid response.",
      "INVALID_RESPONSE",
      response.status,
    );
  if (!response.ok || !result.success)
    throw new ClientError(
      result.message || "This request could not be completed.",
      result.errorCode || "REQUEST_FAILED",
      response.status,
      result.requestId || response.headers.get("X-Request-ID") || undefined,
      result.fields,
    );
  if (financial) pendingKeys.delete(fingerprint);
  return result.data;
}
