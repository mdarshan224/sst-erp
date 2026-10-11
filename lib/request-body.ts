export class RequestBodyError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
// Bound bytes while reading, including chunked requests without Content-Length.
export async function readJsonObject(
  request: Request,
  maximum = 3_500_000,
): Promise<Record<string, unknown>> {
  const oversized = () =>
    new RequestBodyError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request exceeds the upload limit.",
    );
  if (Number(request.headers.get("content-length")) > maximum)
    throw oversized();
  if (!request.body) return {};
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw oversized();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let parsed: unknown;
  try {
    parsed = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new RequestBodyError(400, "INVALID_JSON", "Enter valid JSON data.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RequestBodyError(
      400,
      "INVALID_JSON",
      "The request must contain a JSON object.",
    );
  return parsed as Record<string, unknown>;
}
