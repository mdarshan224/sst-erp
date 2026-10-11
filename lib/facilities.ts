export type FacilityKind = "Transport" | "Hostel";
export type FacilityCharge = {
  componentId: string;
  name: string;
  amountPaise: number;
};
/** Monthly fees are charged in full, including the first partial calendar month. */
export function nextMonth(date: string): string {
  const [y, m] = date.slice(0, 7).split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
}
