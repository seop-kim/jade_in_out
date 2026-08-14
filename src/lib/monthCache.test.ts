import {isMonthCacheFresh, MONTH_CACHE_TTL_MS} from './monthCache';

describe('month cache policy', () => {
  const fetchedAt = new Date('2026-08-14T00:00:00.000Z');

  test('keeps a cache entry within the TTL', () => {
    expect(isMonthCacheFresh(fetchedAt, fetchedAt.getTime() + MONTH_CACHE_TTL_MS - 1)).toBe(true);
  });

  test('expires a cache entry at the TTL boundary', () => {
    expect(isMonthCacheFresh(fetchedAt, fetchedAt.getTime() + MONTH_CACHE_TTL_MS)).toBe(false);
  });

  test('does not trust entries from the future', () => {
    expect(isMonthCacheFresh(fetchedAt, fetchedAt.getTime() - 1)).toBe(false);
  });
});
