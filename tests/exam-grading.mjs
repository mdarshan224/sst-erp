import assert from "node:assert/strict";
import {
  markUnits,
  internalGrade,
  cohortPercentile,
  timetableConflict,
} from "../lib/exam-grading.ts";
assert.equal(markUnits("0.29"), 29);
assert.equal(markUnits("-5.50"), -550);
assert.throws(() => markUnits("1.234"));
assert.equal(
  internalGrade(7999, 10000, [
    { minimum: 80, grade: "A" },
    { minimum: 0, grade: "B" },
  ]),
  "B",
);
assert.equal(cohortPercentile(50, [25, 50, 50, 100]), "75.0000000");
assert.equal(cohortPercentile(5, []), null);
assert.equal(
  timetableConflict([
    { exam_date: "2026-11-01", start_time: "09:00", end_time: "10:00" },
    { exam_date: "2026-11-01", start_time: "10:00", end_time: "11:00" },
  ]),
  false,
);
assert.equal(
  timetableConflict([
    { exam_date: "2026-11-01", start_time: "09:00", end_time: "10:01" },
    { exam_date: "2026-11-01", start_time: "10:00", end_time: "11:00" },
  ]),
  true,
);
console.log("8 grading algorithm checks passed");
