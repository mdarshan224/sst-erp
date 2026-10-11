import { ok, RouteContext } from "./shared";
import {
  addTeachingAssignment,
  addTeachingSubject,
  generateDraft,
  publishTimetable,
  saveDraft,
  teachingSetup,
  timetableDetail,
  timetableList,
} from "../timetable";
import { attendanceGrid, saveAttendance } from "../attendance";
export async function academicsRoute({
  actor,
  path,
  method,
  body,
  p,
  requestId,
}: RouteContext): Promise<Response | null> {
  if (path[0] === "teaching" && method === "GET")
    return ok(await teachingSetup(actor, p.get("year") || ""), requestId);
  if (path.join("/") === "teaching/subjects" && method === "POST")
    return ok(await addTeachingSubject(actor, body), requestId);
  if (path.join("/") === "teaching/assignments" && method === "POST")
    return ok(await addTeachingAssignment(actor, body), requestId);
  if (path[0] === "timetables") {
    if (!path[1] && method === "GET")
      return ok(
        await timetableList(
          actor,
          p.get("year") || "",
          Math.max(1, parseInt(p.get("page") || "1") || 1),
        ),
        requestId,
      );
    if (path[1] === "generate" && method === "POST")
      return ok(await generateDraft(actor, body), requestId);
    if (path[1] && !path[2] && method === "GET")
      return ok(
        await timetableDetail(actor, path[1], p.get("date") || undefined),
        requestId,
      );
    if (path[2] === "slots" && method === "POST")
      return ok(await saveDraft(actor, path[1], body), requestId);
    if (path[2] === "publish" && method === "POST")
      return ok(await publishTimetable(actor, path[1], body), requestId);
  }
  if (path.join("/") === "attendance/setup" && method === "GET")
    return ok(
      await teachingSetup(actor, p.get("year") || "", "attendance.view"),
      requestId,
    );
  if (path[0] === "attendance") {
    if (method === "GET")
      return ok(
        await attendanceGrid(
          actor,
          p.get("year") || "",
          p.get("section") || "",
          p.get("date") || "",
          Math.max(1, parseInt(p.get("page") || "1") || 1),
        ),
        requestId,
      );
    if (method === "POST")
      return ok(await saveAttendance(actor, body), requestId);
  }
  return null;
}
