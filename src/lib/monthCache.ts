export const MONTH_CACHE_TTL_MS = 5 * 60 * 1000;

export function isMonthCacheFresh(fetchedAt: Date, now = Date.now()): boolean {
  const age = now - fetchedAt.getTime();
  return age >= 0 && age < MONTH_CACHE_TTL_MS;
}
