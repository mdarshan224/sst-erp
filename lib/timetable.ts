export type Period = { start: number; end: number };
export type TeachingLoad = {
  id: string;
  teacherId: string;
  sectionId: string;
  room: string;
  periods: number;
};
export type ScheduledSlot = {
  assignmentId: string;
  teacherId: string;
  sectionId: string;
  room: string;
  weekday: number;
  start: number;
  end: number;
};
export class SchedulingError extends Error {}
export const minute = (value: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new SchedulingError("Use a valid 24-hour time.");
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export function validateSlots(slots: ScheduledSlot[]) {
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    if (
      !Number.isInteger(a.weekday) ||
      a.weekday < 1 ||
      a.weekday > 7 ||
      !Number.isInteger(a.start) ||
      !Number.isInteger(a.end) ||
      a.start < 0 ||
      a.end > 1440 ||
      a.start >= a.end
    )
      throw new SchedulingError("A timetable period has invalid times.");
    for (let j = 0; j < i; j++) {
      const b = slots[j];
      if (a.weekday === b.weekday && a.start < b.end && b.start < a.end) {
        if (a.teacherId === b.teacherId)
          throw new SchedulingError(
            "A teacher is assigned to concurrent classes.",
          );
        if (a.sectionId === b.sectionId)
          throw new SchedulingError("A section has overlapping lessons.");
        if (a.room.trim().toLowerCase() === b.room.trim().toLowerCase())
          throw new SchedulingError(
            "A room is assigned to concurrent classes.",
          );
      }
    }
  }
}
// Bounded constraint search. It either produces a complete schedule or fails;
// it never publishes an incomplete/overlapping timetable.
export function generateTimetable(
  loads: TeachingLoad[],
  days: number[],
  periods: Period[],
): ScheduledSlot[] {
  if (
    !loads.length ||
    loads.length > 100 ||
    !days.length ||
    days.length > 7 ||
    new Set(days).size !== days.length ||
    days.some((d) => !Number.isInteger(d) || d < 1 || d > 7) ||
    periods.length > 12 ||
    !periods.length
  )
    throw new SchedulingError(
      "Choose teaching assignments, distinct weekdays and up to 12 periods.",
    );
  const positions = days.flatMap((weekday) =>
    periods.map((p) => ({ weekday, ...p })),
  );
  validateSlots(
    positions.map((p) => ({
      ...p,
      teacherId: "grid",
      sectionId: "grid",
      assignmentId: "grid",
      room: "grid",
    })),
  );
  const tasks = loads.flatMap((l) => {
    if (!Number.isInteger(l.periods) || l.periods < 1 || l.periods > 20)
      throw new SchedulingError("Weekly periods must be between 1 and 20.");
    return Array.from({ length: l.periods }, () => l);
  });
  if (tasks.length > 300)
    throw new SchedulingError("Generate at most 300 lessons per timetable.");
  const demand = (key: "teacherId" | "sectionId" | "room", value: string) =>
    tasks.filter((t) => t[key] === value).length;
  for (const l of loads)
    for (const k of ["teacherId", "sectionId", "room"] as const)
      if (demand(k, l[k]) > positions.length)
        throw new SchedulingError(
          "Teaching load exceeds the available teacher, room or section periods.",
        );
  tasks.sort(
    (a, b) =>
      demand("teacherId", b.teacherId) +
        demand("room", b.room) -
        demand("teacherId", a.teacherId) -
        demand("room", a.room) || a.id.localeCompare(b.id),
  );
  const placed: ScheduledSlot[] = [];
  let visits = 0;
  function search(i: number): boolean {
    if (i === tasks.length) return true;
    if (++visits > 50000)
      throw new SchedulingError(
        "No complete timetable found within the search limit. Adjust rooms, loads or periods and retry.",
      );
    const task = tasks[i],
      previous = placed.filter((s) => s.assignmentId === task.id).at(-1);
    const options = positions.filter(
      (p) =>
        !previous ||
        p.weekday > previous.weekday ||
        (p.weekday === previous.weekday && p.start > previous.start),
    );
    for (const p of options) {
      const slot = {
        ...p,
        assignmentId: task.id,
        teacherId: task.teacherId,
        sectionId: task.sectionId,
        room: task.room,
      };
      try {
        validateSlots([...placed, slot]);
      } catch {
        continue;
      }
      placed.push(slot);
      if (search(i + 1)) return true;
      placed.pop();
    }
    return false;
  }
  if (!search(0))
    throw new SchedulingError(
      "No conflict-free timetable exists for these rooms, teachers and periods.",
    );
  return placed;
}
