import {
  billingSummary,
  createBillingOrder,
  resumeOrder,
  verifyBillingOrder,
} from "../subscription-billing";
import { ApiError } from "../security";
import { ok, RouteContext } from "./shared";
export async function billingRoute(c: RouteContext): Promise<Response | null> {
  if (c.path[0] !== "billing") return null;
  if (c.method === "GET" && c.path.length === 1)
    return ok(await billingSummary(c.actor), c.requestId);
  if (c.method === "POST" && c.path[1] === "checkout" && c.path.length === 2)
    return ok(await createBillingOrder(c.actor, c.body), c.requestId);
  if (
    c.method === "GET" &&
    c.path[1] === "orders" &&
    c.path[2] &&
    c.path.length === 3
  )
    return ok(await resumeOrder(c.actor, c.path[2]), c.requestId);
  if (
    c.method === "POST" &&
    c.path[1] === "orders" &&
    c.path[2] &&
    ["verify", "reconcile"].includes(c.path[3]) &&
    c.path.length === 4
  )
    return ok(
      await verifyBillingOrder(
        c.actor,
        c.path[2],
        c.body,
        c.path[3] === "reconcile",
      ),
      c.requestId,
    );
  throw new ApiError(404, "NOT_FOUND", "Billing route not found.");
}
