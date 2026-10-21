import {
  roomBeds,
  facilitySetup,
  createFacility,
  allocateFacility,
  endAllocation,
  billFacilities,
} from "../facilities";
import { holidayList, saveHoliday, cancelHoliday } from "../holidays";
import { ApiError } from "../security";
import { ok, RouteContext } from "./shared";
export async function facilitiesRoute({
  actor,
  path,
  method,
  p,
  body,
  requestId,
}: RouteContext): Promise<Response | null> {
  if (path[0] === "holidays") {
    if (method === "POST" && path[2] === "edit")
      return ok(await saveHoliday(actor, body, false, path[1]), requestId);
    if (method === "GET") return ok(await holidayList(actor, p), requestId);
    if (method === "POST" && !path[1])
      return ok(await saveHoliday(actor, body), requestId);
    if (method === "POST" && path[2] === "cancel")
      return ok(await cancelHoliday(actor, path[1]), requestId);
  }
  if (path[0] !== "facilities") return null;
  if (method === "GET" && path[1] === "rooms" && path[3] === "beds")
    return ok(
      await roomBeds(actor, path[2], p.get("from") || "", p.get("to") || ""),
      requestId,
    );
  if (method === "GET") return ok(await facilitySetup(actor, p), requestId);
  if (method === "POST") {
    if (path[1] === "allocations" && !path[2])
      return ok(await allocateFacility(actor, body), requestId);
    if (path[1] === "allocations" && path[3] === "end")
      return ok(await endAllocation(actor, path[2]), requestId);
    if (path[1] === "bill") return ok(await billFacilities(actor), requestId);
    if (path.length === 2)
      return ok(await createFacility(actor, path[1], body), requestId);
  }
  throw new ApiError(404, "NOT_FOUND", "Facility route not found.");
}
