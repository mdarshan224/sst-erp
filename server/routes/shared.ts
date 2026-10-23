import { readJsonObject, RequestBodyError } from "../../lib/request-body";
import { z } from "zod";
import { MoneyError } from "../../lib/money";
import { Permission } from "../../lib/permissions";
import { Row } from "../db";
import { Actor, ApiError, hasPermission, permit } from "../security";
export type RouteContext = {
  actor: Actor;
  path: string[];
  p: URLSearchParams;
  method: string;
  body: Row;
  request: Request;
  url: URL;
  requestId: string;
};
export function responseHeaders(id: string) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "private,no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": id,
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}
export function ok(data: unknown, id: string) {
  return new Response(JSON.stringify({ success: true, data, requestId: id }), {
    headers: responseHeaders(id),
  });
}
export async function readBody(request: Request): Promise<Row> {
  try {
    return await readJsonObject(request);
  } catch (error) {
    if (error instanceof RequestBodyError)
      throw new ApiError(error.status, error.code, error.message);
    throw error;
  }
}
export function routeArea(path: string[]) {
  const areas: Record<string, string> = {
    students: "students",
    "portal-staff": "students",
    parents: "students",
    years: "academics",
    exams: "academics",
    teaching: "academics",
    timetables: "academics",
    attendance: "academics",
    holidays: "academics",
    facilities: "academics",
    catalog: ["components", "structures", "benefits"].includes(path[1])
      ? "fees"
      : "academics",
    structures: "fees",
    fees: "fees",
    installments: "fees",
    invoices: "fees",
    outstanding: "fees",
    defaulters: "fees",
    payments: "payments",
    refunds: "payments",
    cash: "payments",
    reconciliation: "payments",
    receipts: "receipts",
    documents: path[1] === "receipt" ? "receipts" : "fees",
    reports: "reports",
    users: "users",
    invitations: "users",
    settings: "settings",
    providers: "settings",
    hardware: "settings",
    communications: "settings",
    certificates: "fees",
    "parent-links": "students",
    rollovers: "academics",
  };
  return areas[path[0]];
}
export function guardRoute(
  actor: Actor,
  path: string[],
  method: string,
  p: URLSearchParams,
) {
  const k = path[0],
    read = method === "GET";
  let permission: Permission | undefined;
  if (k === "portal-staff") permission = "portal.manage";
  if (["teaching", "timetables"].includes(k))
    permission = read ? "timetable.view" : "timetable.manage";
  if (k === "facilities")
    permission = read ? "facilities.view" : "facilities.manage";
  if (k === "holidays")
    permission = read ? "academics.view" : "academics.manage";
  if (k === "attendance")
    permission = read ? "attendance.view" : "attendance.mark";
  if (k === "exams")
    permission =
      read || path[2] === "admit"
        ? "exams.view"
        : path[2] === "results"
          ? "exams.grade"
          : "exams.manage";
  if (k === "billing") permission = "settings.manage";
  if (["students", "parents", "uploads", "search"].includes(k))
    permission = read ? "students.view" : "students.manage";
  if (k === "catalog")
    permission =
      path[1] === "parents"
        ? "students.manage"
        : ["components", "structures", "benefits"].includes(path[1])
          ? "fees.manage"
          : "academics.manage";
  if (["years"].includes(k))
    permission = read ? "academics.view" : "academics.manage";
  if (
    [
      "fees",
      "structures",
      "structure-items",
      "components",
      "installments",
      "invoices",
      "outstanding",
      "defaulters",
    ].includes(k)
  )
    permission = read
      ? "fees.view"
      : k === "invoices"
        ? "fees.invoice"
        : "fees.manage";
  if (["payments", "reconciliation", "cash", "notifications"].includes(k))
    permission = read ? "payments.view" : "payments.collect";
  if (k === "payments" && !read && ["confirm", "cancel"].includes(path[2]))
    permission = "payments.manage";
  if (k === "reconciliation" && !read) permission = "payments.manage";
  if (k === "cash") permission = read ? "payments.view" : "cash.close";
  if (k === "refunds")
    permission = read || !path[1] ? "refunds.request" : "refunds.approve";
  if (k === "receipts") permission = "receipts.view";
  if (k === "reports")
    permission = p.get("format") ? "reports.export" : "reports.view";
  if (k === "users" || k === "invitations")
    permission = read ? "users.view" : "users.manage";
  if (["settings", "providers", "jobs", "audit"].includes(k))
    permission = read ? "settings.view" : "settings.manage";
  if (k === "documents")
    permission = path[1] === "receipt" ? "receipts.view" : "fees.view";
  if (permission) permit(actor, permission);
  if (k === "template")
    permit(
      actor,
      path[1] === "students" || path[1] === "parents"
        ? "students.manage"
        : path[1] === "reconciliation"
          ? "payments.manage"
          : "fees.manage",
    );
  if (k === "dashboard" && !hasPermission(actor, "fees.view"))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role cannot access financial dashboards.",
    );
}
export function errorResponse(error: unknown, requestId: string): Response {
  let status = 500,
    code = "INTERNAL_ERROR",
    message = "This operation could not be completed. Please try again.";
  let fields: unknown;
  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof MoneyError) {
    status = 422;
    code = "INVALID_AMOUNT";
    message = error.message;
  } else if (error instanceof z.ZodError) {
    status = 422;
    code = "VALIDATION_ERROR";
    message = error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    fields = error.flatten().fieldErrors;
  } else if (error instanceof Error) {
    if (/SECTION_DUPLICATE/.test(error.message)) {
      status = 409;
      code = "SECTION_DUPLICATE";
      message =
        "This section already exists for the selected class and campus.";
    } else if (/OTP_COOLDOWN/.test(error.message)) {
      status = 429;
      code = "OTP_COOLDOWN";
      message = "Wait one minute before requesting another security code.";
    } else if (/HOLIDAY_DUPLICATE/.test(error.message)) {
      status = 409;
      code = "HOLIDAY_DUPLICATE";
      message = "This holiday already exists for these dates and institution.";
    } else if (/TENANT_DELETING/.test(error.message)) {
      status = 409;
      code = "INSTITUTION_LOCKED";
      message = "This institution is locked for deletion or recovery.";
    } else if (/HOLIDAY_NO_ATTENDANCE/.test(error.message)) {
      status = 409;
      code = "HOLIDAY_NO_ATTENDANCE";
      message = "Attendance is not required on this holiday.";
    } else if (/FACILITY_/.test(error.message)) {
      status = 409;
      code = "FACILITY_CONFLICT";
      message =
        "Check bed/vehicle capacity, existing allocations and billing dates. Historical allocations cannot be changed.";
    } else if (
      /TIMETABLE_CONFLICT|TIMETABLE_SCOPE|TEACHING_SCOPE|ATTENDANCE_SCOPE/.test(
        error.message,
      )
    ) {
      status = 422;
      code = "ACADEMIC_VALIDATION";
      message =
        "Check timetable overlaps, teaching assignments or attendance details.";
    } else if (
      /TIMETABLE_STALE|TIMETABLE_FROZEN|TIMETABLE_HISTORY|ATTENDANCE_STALE|ATTENDANCE_HISTORY|TEACHING_IMMUTABLE/.test(
        error.message,
      )
    ) {
      status = 409;
      code = "ACADEMIC_CONFLICT";
      message =
        "This academic record changed or is locked. Reload before retrying.";
    } else if (/STUDENT_LIMIT_REACHED|USER_LIMIT_REACHED/.test(error.message)) {
      status = 409;
      code = error.message.includes("STUDENT_LIMIT_REACHED")
        ? "STUDENT_LIMIT_REACHED"
        : "USER_LIMIT_REACHED";
      message =
        "Your institution plan limit has been reached. Contact the platform administrator to upgrade.";
    } else if (/UNIQUE constraint|ALREADY|duplicate/i.test(error.message)) {
      status = 409;
      code = "DUPLICATE_RECORD";
      message =
        "This record already exists. Check existing records before trying again.";
    } else if (
      /ACADEMIC_YEAR_FROZEN|ROLLOVER_ROSTER_FROZEN|ROLLOVER_PREVIEW_CHANGED|INVALID_CARRY_FORWARD|CASH_BALANCE_CHANGED|UNBALANCED_JOURNAL|OVERPAYMENT|INVALID_ADJUSTMENT|REFUND_TOO_LARGE|IMMUTABLE|TENANT_ISOLATION|INVALID_ALLOCATION|INCOMPLETE_PAYMENT|ACADEMIC_YEAR_ISOLATION|CASH_DAY_CLOSED/.test(
        error.message,
      )
    ) {
      status = 409;
      code = "FINANCIAL_CONFLICT";
      message =
        "The balance or record changed. Refresh the page and try again.";
    } else if (
      /Enter an amount|supported range|Percentage|Installments/.test(
        error.message,
      )
    ) {
      status = 422;
      code = "INVALID_AMOUNT";
      message = error.message;
    } else
      console.error(
        "Sohan Soft Tech request failed",
        requestId,
        error.message.slice(0, 240),
      );
  }
  return new Response(
    JSON.stringify({
      success: false,
      message,
      errorCode: code,
      fields,
      requestId,
    }),
    { status, headers: responseHeaders(requestId) },
  );
}
