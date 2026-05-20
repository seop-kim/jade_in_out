export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toYmd(year: number, month: number, day: number): string {
  return `${year}${pad(month + 1)}${pad(day)}`;
}

export function ymdToKey(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function isHolidayType(workType: string | null | undefined): boolean {
  if (!workType) return false;
  return workType.includes('휴일') || workType.includes('휴무');
}

export function formatHm(value: string | null | undefined): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
  if (digits.length === 6) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return value;
}
