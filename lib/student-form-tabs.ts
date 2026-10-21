export function studentFieldTab(field: string): string {
  return ["parentName", "mobile", "email"].includes(field)
    ? "guardian"
    : ["aadhaarLast4", "previousSchool"].includes(field)
      ? "additional"
      : "student";
}
