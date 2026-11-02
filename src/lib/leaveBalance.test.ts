import {AttendanceRecord} from '../api/jadeApi';
import {InsaLeavePageData, InsaLeaveRecord} from '../api/insaParsers';
import {reconcileLeaveBalance} from './leaveBalance';

function jadeRecord(
  ymd: string,
  type: string,
  duration: string,
  time: string,
  hours: number
): AttendanceRecord {
  return {
    ymd,
    workDay: '',
    workType: '',
    vacation: {type, duration, time, hours, isFullDay: hours >= 8},
    overtime: null,
    dayOffWork: null,
    remoteWork: null,
    clockIn: '',
    clockInChanged: false,
    clockInLocal: false,
    clockOut: '',
    clockOutChanged: false,
    clockOutLocal: false,
    workList: [],
    raw: {},
  };
}

function insaRecord(
  ymd: string,
  type: string,
  durationLabel: string,
  approvalStatus = '승인'
): InsaLeaveRecord {
  return {
    ymd,
    durationLabel,
    type,
    reason: '',
    appliedAt: '',
    approvalStatus,
  };
}

function insaData(records: InsaLeaveRecord[], accruedHours = 120): InsaLeavePageData {
  return {
    balances: [{
      year: 2026,
      period: '2026',
      accruedHours,
      usedHours: 0,
      remainingHours: accruedHours,
    }],
    records,
  };
}

describe('reconcileLeaveBalance', () => {
  test('deduplicates equivalent Jade and INSA leave records', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-08-07', '연차휴가', '4시간', '후4', 4)],
      insaData([insaRecord('2026-08-07', '연차', '(후4)')])
    );

    expect(result.duplicateHours).toBe(4);
    expect(result.usedHours).toBe(4);
    expect(result.remainingHours).toBe(116);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-08-07', source: 'both', hours: 4}),
    ]);
  });

  test('deduplicates a clock-range Jade record with an INSA 출4 label', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-03-18', '연차휴가', '4시간 (09:00~14:00)', '', 4)],
      insaData([insaRecord('2026-03-18', '연차휴가(시간차)', '(출4)')])
    );

    expect(result.duplicateHours).toBe(4);
    expect(result.usedHours).toBe(4);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-03-18', source: 'both', hours: 4}),
    ]);
  });

  test('normalizes compact Jade dates before filtering and matching', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('20260807', '연차휴가', '4시간', '후4', 4)],
      insaData([insaRecord('2026-08-07', '연차', '(후4)')])
    );

    expect(result.jadeUsedHours).toBe(4);
    expect(result.duplicateHours).toBe(4);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-08-07', source: 'both'}),
    ]);
  });

  test('keeps every Jade leave row on a day as a separate usage entry', () => {
    const record = {
      ...jadeRecord('20260807', '연차', '4시간', '전4', 4),
      workList: [
        {type: '연차', duration: '4시간', time: '전4'},
        {type: '연차', duration: '4시간', time: '후4'},
      ],
    };

    const result = reconcileLeaveBalance(2026, [record], insaData([]));

    expect(result.jadeUsedHours).toBe(8);
    expect(result.records).toHaveLength(2);
    expect(result.records.map((leave) => leave.durationLabel)).toEqual(['4시간 (전4)', '4시간 (후4)']);
  });

  test('deduplicates full-day labels with different system formatting', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-08-08', '연차', '8시간', '', 8)],
      insaData([insaRecord('2026-08-08', '연차휴가', '1일')])
    );

    expect(result.duplicateHours).toBe(8);
    expect(result.usedHours).toBe(8);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-08-08', source: 'both', hours: 8}),
    ]);
  });

  test('treats a one-day full-day leave type as eight hours', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([insaRecord('2026-08-08', '연차휴가(종일)', '1')])
    );

    expect(result.insaUsedHours).toBe(8);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-08-08', hours: 8, deductible: true}),
    ]);
  });

  test('includes usage that exists in only one source', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-08-01', '연차', '8시간', '', 8)],
      insaData([insaRecord('2026-08-02', '연차휴가', '(후4)')])
    );

    expect(result.jadeUsedHours).toBe(8);
    expect(result.insaUsedHours).toBe(4);
    expect(result.duplicateHours).toBe(0);
    expect(result.usedHours).toBe(12);
    expect(result.remainingHours).toBe(108);
    expect(result.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ymd: '2026-08-01', source: 'jade'}),
      expect.objectContaining({ymd: '2026-08-02', source: 'insa'}),
    ]));
  });

  test('keeps different time-off periods on the same day separate', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-08-07', '연차', '4시간', '전4', 4)],
      insaData([insaRecord('2026-08-07', '연차휴가', '(후4)')])
    );

    expect(result.duplicateHours).toBe(0);
    expect(result.usedHours).toBe(8);
    expect(result.records).toHaveLength(2);
  });

  test('deducts only approved INSA records', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([
        insaRecord('2026-08-01', '연차', '(후4)', '승인'),
        insaRecord('2026-08-02', '연차', '(후4)', '신청'),
        insaRecord('2026-08-03', '연차', '(후4)', '반려'),
      ])
    );

    expect(result.insaUsedHours).toBe(4);
    expect(result.usedHours).toBe(4);
    expect(result.records.filter((record) => record.source === 'insa')).toHaveLength(3);
    expect(result.records.filter((record) => record.deductible)).toHaveLength(1);
  });

  test('does not deduct pending, unapproved, or completed cancellation statuses', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([
        insaRecord('2026-08-01', '연차', '(후4)', '승인대기'),
        insaRecord('2026-08-02', '연차', '(후4)', '미승인'),
        insaRecord('2026-08-03', '연차', '(후4)', '취소완료'),
      ])
    );

    expect(result.insaUsedHours).toBe(0);
    expect(result.usedHours).toBe(0);
    expect(result.records.every((record) => !record.deductible)).toBe(true);
  });

  test('matches equivalent full-day labels without treating 전일 as morning', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('20260808', '연차', '8시간', '', 8)],
      insaData([insaRecord('2026-08-08', '연차휴가', '전일')])
    );

    expect(result.duplicateHours).toBe(8);
    expect(result.usedHours).toBe(8);
  });

  test('sums target-year accrual and calculates the remaining hours', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      {
        balances: [
          {year: 2025, period: '2025', accruedHours: 200, usedHours: 0, remainingHours: 200},
          {year: 2026, period: '2026-01', accruedHours: 120, usedHours: 0, remainingHours: 120},
          {year: 2026, period: '2026-07', accruedHours: 8, usedHours: 0, remainingHours: 8},
        ],
        records: [],
      }
    );

    expect(result.accruedHours).toBe(128);
    expect(result.usedHours).toBe(0);
    expect(result.remainingHours).toBe(128);
  });

  test('keeps unknown durations unresolved instead of counting them as zero usage', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([insaRecord('2026-08-07', '연차휴가', '(미정)')])
    );

    expect(result.usedHours).toBe(0);
    expect(result.unresolved).toEqual([
      expect.objectContaining({ymd: '2026-08-07', source: 'insa'}),
    ]);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-08-07', hours: null, deductible: false}),
    ]);
  });
});
