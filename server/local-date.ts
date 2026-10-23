import { one } from "./db";
import { institutionTimezone, localToday } from "../lib/local-date";
export async function institutionToday(institutionId: string) {
  const institution = await one(
    "SELECT settings FROM institutions WHERE id=?",
    [institutionId],
  );
  return localToday(
    institutionTimezone(JSON.parse(institution?.settings || "{}")),
  );
}
