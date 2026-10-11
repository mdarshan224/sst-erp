const idempotency = {
  in: "header",
  name: "Idempotency-Key",
  required: true,
  schema: { type: "string", format: "uuid" },
  description:
    "Reuse the same UUID when retrying an identical facility operation.",
};
const param = (name: string, location: "path" | "query", required = false) => ({
  in: location,
  name,
  required,
  schema: { type: "string" },
});
const operation = (
  summary: string,
  write = false,
  financial = false,
  parameters: unknown[] = [],
) => ({
  summary,
  tags: ["Facilities & Holidays"],
  security: [{ SmsSession: [] }],
  parameters: [...parameters, ...(financial ? [idempotency] : [])],
  ...(write
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
      }
    : {}),
  responses: {
    "200": { description: "Persisted result" },
    "401": { description: "Sign-in required" },
    "403": { description: "Role or tenant access denied" },
    "404": { description: "Record is outside tenant or not found" },
    "409": {
      description:
        "Capacity, billing replay, holiday or historical record conflict",
    },
    "422": { description: "Invalid dates, references, amount or capacity" },
  },
});
export const facilitiesPaths = {
  "/facilities": {
    get: operation(
      "Paged facility catalogue (?catalog=vehicles/routes/stops/blocks/rooms) or allocations (?year&kind&page)",
      false,
      false,
      [
        param("catalog", "query"),
        param("year", "query"),
        param("kind", "query"),
        param("page", "query"),
      ],
    ),
  },
  "/facilities/{catalog}": {
    post: operation(
      "Create institution facility (vehicles/routes/stops/blocks/rooms)",
      true,
      true,
      [param("catalog", "path", true)],
    ),
  },
  "/facilities/allocations": {
    post: operation(
      "Allocate student using authoritative stop/room rates and generate first invoice if due",
      true,
      true,
    ),
  },
  "/facilities/allocations/{id}/end": {
    post: operation(
      "End allocation without changing historical invoices or ledger",
      true,
      true,
      [param("id", "path", true)],
    ),
  },
  "/facilities/rooms/{id}/beds": {
    get: operation(
      "Numbered bed availability for the requested date range",
      false,
      false,
      [
        param("id", "path", true),
        param("from", "query", true),
        param("to", "query", true),
      ],
    ),
  },
  "/facilities/bill": {
    post: operation(
      "Generate at most 20 due monthly facility invoices; continue while hasMore",
      true,
      true,
    ),
  },
  "/holidays": {
    get: operation(
      "Global and current-institution holiday calendar, paged by date range",
      false,
      false,
      [param("from", "query"), param("to", "query"), param("page", "query")],
    ),
    post: operation("Create institution-local holiday or term break", true),
  },
  "/holidays/{id}/cancel": {
    post: operation(
      "Cancel institution-owned holiday and restore daily expectations",
      true,
      false,
      [param("id", "path", true)],
    ),
  },
  "/platform/holidays": {
    get: operation("Platform administrator holiday calendar across campuses"),
    post: operation(
      "Create global holiday (institutionId:null) or campus-specific holiday",
      true,
    ),
  },
  "/platform/holidays/{id}/cancel": {
    post: operation(
      "Platform administrator cancels holiday with immutable audit evidence",
      true,
      false,
      [param("id", "path", true)],
    ),
  },
};
