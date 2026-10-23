export const DOB_FUTURE = "Date of birth cannot be in the future.";
export const ATTENDANCE_FUTURE =
  "Attendance cannot be marked for a future date.";
export function institutionTimezone(settings: { timezone?: string } = {}) {
  const zone = settings.timezone || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "Asia/Kolkata";
  }
}
export function localToday(timeZone = "Asia/Kolkata", instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: institutionTimezone({ timezone: timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
