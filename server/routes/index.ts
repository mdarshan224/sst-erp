import { billingRoute } from "./billing";
import { idempotent, requiresIdempotency } from "../idempotency";
import { ApiError } from "../security";
import { facilitiesRoute } from "./facilities";
import { academicsRoute } from "./academics";
import { examsRoute } from "./exams";
import { cashRoute } from "./cash";
import { extensionsRoute } from "./extensions";
import { feesRoute } from "./fees";
import { operationsRoute } from "./operations";
import { paymentsRoute } from "./payments";
import { reportsRoute } from "./reports";
import { listResource, patchResource } from "./resources";
import { settingsRoute } from "./settings";
import { ok, RouteContext } from "./shared";
import { studentsRoute } from "./students";
import { usersRoute } from "./users";
type Route = (context: RouteContext) => Promise<Response | null>;
// Preserve specificity and existing route precedence; null means not mounted.
const institutionRoutes: readonly Route[] = Object.freeze([
  billingRoute,
  facilitiesRoute,
  academicsRoute,
  examsRoute,
  extensionsRoute,
  settingsRoute,
  usersRoute,
  reportsRoute,
  studentsRoute,
  cashRoute,
  feesRoute,
  paymentsRoute,
  operationsRoute,
]);
export async function dispatchInstitution(
  ctx: RouteContext,
): Promise<Response> {
  const handle = async () => {
    for (const route of institutionRoutes) {
      const response = await route(ctx);
      if (response) return response;
    }
    if (ctx.method === "GET")
      return ok(
        await listResource(ctx.actor, ctx.path[0], ctx.p),
        ctx.requestId,
      );
    if (ctx.method === "PATCH")
      return ok(
        await patchResource(ctx.actor, ctx.path, ctx.body),
        ctx.requestId,
      );
    throw new ApiError(404, "NOT_FOUND", "API route not found.");
  };
  return requiresIdempotency(ctx.path, ctx.method)
    ? idempotent(
        ctx.actor,
        ctx.method + ":" + ctx.path.join("/"),
        ctx.body,
        handle,
      )
    : handle();
}
