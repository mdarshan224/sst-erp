export function addInstallment(dates: string[]) {
  return [...dates, ""];
}
export function changeInstallment(
  dates: string[],
  index: number,
  value: string,
) {
  return dates.map((date, i) => (i === index ? value : date));
}
export function removeInstallment(dates: string[], index: number) {
  return dates.filter((_, i) => i !== index);
}
export function moveInstallment(
  dates: string[],
  index: number,
  direction: number,
) {
  const next = index + direction;
  if (next < 0 || next >= dates.length) return dates;
  const result = [...dates];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
