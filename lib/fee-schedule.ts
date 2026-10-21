/** Inclusive billing period, anchored to its start day; month ends clamp without drifting. */
export function feeSchedule(
  start: string,
  end: string,
  frequency: string,
): string[] {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end) || end < start)
    throw new Error("Choose a valid billing period.");
  const step: Record<string, number> = {
    Monthly: 1,
    Quarterly: 3,
    "Half-yearly": 6,
    Annual: 12,
  };
  if (!step[frequency])
    throw new Error("Choose a supported recurring frequency.");
  const [year, month, day] = start.split("-").map(Number),
    dates: string[] = [];
  for (let offset = 0; offset <= 1200; offset += step[frequency]) {
    const first = new Date(Date.UTC(year, month - 1 + offset, 1));
    const last = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    first.setUTCDate(Math.min(day, last));
    const date = first.toISOString().slice(0, 10);
    if (date > end) break;
    dates.push(date);
    if (dates.length > 12)
      throw new Error(
        "Schedules support up to twelve instalments; shorten the billing period.",
      );
  }
  return dates;
}
