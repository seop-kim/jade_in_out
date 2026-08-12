import {
  buildInsaCalendarMap,
  InsaCalendarMap,
} from './transformInsa';
import {
  InsaHomeMonthData,
  InsaLeaveRecord,
  InsaWorktimeRecord,
} from '../api/insaParsers';

const worktimeRecord = (ymd: string, leaveLabel = ''): InsaWorktimeRecord => ({
  ymd,
  scheduledIn: '09:00',
  scheduledOut: '18:00',
  actualIn: '09:01',
  actualOut: '18:02',
  leaveLabel,
  overtimeLabel: '',
  correctionIn: '',
  correctionOut: '',
  correctionStatus: '',
  note: '',
});

const leaveRecord = (ymd: string, type: string): InsaLeaveRecord => ({
  ymd,
  durationLabel: '(half day)',
  type,
  reason: 'masked reason',
  appliedAt: '2026-08-01',
  approvalStatus: 'approved',
});

describe('INSA calendar transform', () => {
  test('creates every day in the requested zero-based month', () => {
    const map = buildInsaCalendarMap(2026, 7, null, [], []);

    expect(Object.keys(map)).toHaveLength(31);
    expect(map['2026-08-01']).toEqual({ymd: '2026-08-01', ownLeave: []});
    expect(map['2026-08-31']).toEqual({ymd: '2026-08-31', ownLeave: []});
    expect(map['2026-09-01']).toBeUndefined();
  });

  test('merges own leave records while retaining worktime leave as fallback data', () => {
    const map = buildInsaCalendarMap(
      2026,
      7,
      null,
      [worktimeRecord('2026-08-07', '(worktime fallback)')],
      [leaveRecord('2026-08-07', 'annual leave (hourly)')]
    );

    expect(map['2026-08-07']?.ownLeave).toEqual([
      expect.objectContaining({type: 'annual leave (hourly)'}),
    ]);
    expect(map['2026-08-07']?.worktime?.leaveLabel).toBe('(worktime fallback)');
  });

  test('keeps multiple own leave records for one day', () => {
    const map = buildInsaCalendarMap(
      2026,
      7,
      null,
      [],
      [leaveRecord('2026-08-07', 'morning leave'), leaveRecord('2026-08-07', 'afternoon leave')]
    );

    expect(map['2026-08-07']?.ownLeave.map((record) => record.type)).toEqual([
      'morning leave',
      'afternoon leave',
    ]);
  });

  test('merges team schedule counts and ignores records outside the month', () => {
    const home: InsaHomeMonthData = {
      year: 2026,
      month: 8,
      days: {
        '2026-08-07': {ymd: '2026-08-07', vacationCount: 2, timeCount: 1},
        '2026-09-01': {ymd: '2026-09-01', vacationCount: 4, timeCount: 3},
      },
    };

    const map: InsaCalendarMap = buildInsaCalendarMap(
      2026,
      7,
      home,
      [worktimeRecord('2026-08-07'), worktimeRecord('2026-09-01')],
      [leaveRecord('2026-08-07', 'annual leave'), leaveRecord('2026-09-01', 'outside month')]
    );

    expect(map['2026-08-07']).toEqual(expect.objectContaining({
      teamSchedule: {ymd: '2026-08-07', vacationCount: 2, timeCount: 1},
      worktime: expect.objectContaining({ymd: '2026-08-07'}),
      ownLeave: [expect.objectContaining({type: 'annual leave'})],
    }));
    expect(map['2026-09-01']).toBeUndefined();
  });
});
