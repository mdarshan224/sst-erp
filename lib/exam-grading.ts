export type GradeBand = { minimum: number; grade: string };
export function markUnits(value: string): number {
  if (!/^-?\d{1,6}(\.\d{1,2})?$/.test(value))
    throw new Error("Use marks with at most two decimals.");
  const negative = value.startsWith("-"),
    [whole, part = ""] = value.replace(/^-/, "").split(".");
  const result = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  return negative ? -result : result;
}
export const formatMarks = (units: number | null) =>
  units === null ? "—" : (units / 100).toFixed(2).replace(/\.00$/, "");
export function internalGrade(
  score: number,
  max: number,
  bands: GradeBand[],
): string {
  if (max <= 0) throw new Error("Maximum marks must be positive.");
  return (
    bands.find((b) => score * 100 >= b.minimum * max)?.grade || "Unclassified"
  );
}
// A percentile within this particular mock cohort; ties receive the same value.
export function cohortPercentile(
  score: number,
  cohort: number[],
): string | null {
  if (!cohort.length) return null;
  return (
    (cohort.filter((v) => v <= score).length * 100) /
    cohort.length
  ).toFixed(7);
}
export function timetableConflict(
  rows: {
    exam_date: string | null;
    start_time: string | null;
    end_time: string | null;
  }[],
) {
  return rows.some(
    (a, i) =>
      a.exam_date &&
      a.start_time &&
      a.end_time &&
      rows.some(
        (b, j) =>
          j > i &&
          a.exam_date === b.exam_date &&
          b.start_time &&
          b.end_time &&
          a.start_time! < b.end_time &&
          b.start_time < a.end_time!,
      ),
  );
}
