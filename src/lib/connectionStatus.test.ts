import {formatLastFetchedAt, ConnectionStatus} from './connectionStatus';

describe('connection status helpers', () => {
  test('formats a recent fetch timestamp for the calendar toolbar', () => {
    expect(formatLastFetchedAt(new Date(2026, 7, 14, 14, 32))).toBe('2026. 08. 14. 14:32');
  });

  test('returns no label for an unknown fetch time', () => {
    expect(formatLastFetchedAt(null)).toBe('');
  });

  test('keeps the connection status values finite', () => {
    const statuses: ConnectionStatus[] = ['not-configured', 'checking', 'connected', 'error'];
    expect(statuses).toHaveLength(4);
  });
});
