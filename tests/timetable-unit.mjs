import { permissionModule } from "../lib/permissions.ts";
import assert from "node:assert/strict";
import { generateTimetable, validateSlots, minute } from "../lib/timetable.ts";
import { brandTheme, brandColor } from "../lib/branding.ts";
const loads = [
  { id: "a", teacherId: "T", sectionId: "A", room: "room 1", periods: 2 },
  { id: "b", teacherId: "T", sectionId: "B", room: "room 2", periods: 2 },
];
const result = generateTimetable(
  loads,
  [1, 2],
  [
    { start: 540, end: 585 },
    { start: 585, end: 630 },
  ],
);
assert.equal(result.length, 4);
validateSlots(result);
assert.throws(
  () => generateTimetable(loads, [1], [{ start: 540, end: 585 }]),
  /exceeds/,
);
const a = {
  assignmentId: "a",
  teacherId: "T",
  sectionId: "A",
  room: "Room 1",
  weekday: 1,
  start: 540,
  end: 585,
};
assert.throws(
  () => validateSlots([a, { ...a, sectionId: "B", room: "room 2" }]),
  /teacher/,
);
assert.throws(
  () =>
    validateSlots([
      a,
      { ...a, teacherId: "U", sectionId: "B", room: "room 1" },
    ]),
  /room/,
);
assert.throws(
  () => validateSlots([a, { ...a, teacherId: "U", room: "room 2" }]),
  /section/,
);
validateSlots([a, { ...a, start: 585, end: 630 }]);
assert.throws(() => minute("25:30"));
assert.equal(minute("09:45"), 585);
assert.equal(brandColor("url(evil)"), "#d4980b");
assert.equal(brandTheme("#ffffff")["--primary-foreground"], "#111111");
assert.equal(brandTheme("#111111")["--primary-foreground"], "#ffffff");
console.log("11 scheduling and brand contrast checks passed");

assert.equal(permissionModule("exams.view"), "academics");
assert.equal(permissionModule("attendance.mark"), "academics");
assert.equal(permissionModule("cash.close"), "payments");
