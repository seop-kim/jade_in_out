import {AttendanceRecord} from '../api/jadeApi';
import {InsaLeavePageData, InsaLeaveRecord} from '../api/insaParsers';
import {calculateLeaveBalanceSummary, reconcileLeaveBalance} from './leaveBalance';

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

  test('keeps health leave visible without deducting it from annual leave', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-04-10', '보건휴가', '4시간', '출4', 4)],
      insaData([insaRecord('2026-04-10', '보건휴가', '(출4)')])
    );

    expect(result.duplicateHours).toBe(0);
    expect(result.usedHours).toBe(0);
    expect(result.remainingHours).toBe(120);
    expect(result.records).toEqual([
      expect.objectContaining({
        ymd: '2026-04-10',
        canonicalType: 'health',
        source: 'both',
        hours: 4,
        deductible: false,
      }),
    ]);
  });

  test('deduplicates records when INSA approval status contains approval history', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-03-18', '연차휴가', '4시간', '출4', 4)],
      insaData([insaRecord(
        '2026-03-18',
        '연차휴가(시간차)',
        '(출4)',
        '루상민 (2026.03.18:승인) 유현철 (2026.03.18:승인)'
      )])
    );

    expect(result.insaUsedHours).toBe(4);
    expect(result.duplicateHours).toBe(4);
    expect(result.usedHours).toBe(4);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-03-18', source: 'both', deductible: true}),
    ]);
  });

  test('deduplicates a full-day INSA record with an eight-hour Jade range', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-05-14', '연차휴가', '8시간', '09:00~18:00', 8)],
      insaData([insaRecord(
        '2026-05-14',
        '연차휴가(종일)',
        '1',
        '루상민 (2026.05.14:승인) 유현철 (2026.05.14:승인)'
      )])
    );

    expect(result.duplicateHours).toBe(8);
    expect(result.usedHours).toBe(8);
    expect(result.records).toEqual([
      expect.objectContaining({ymd: '2026-05-14', source: 'both', hours: 8}),
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

  test('does not mark two identical rows from the same source as duplicates', () => {
    const record = {
      ...jadeRecord('2026-08-07', '연차휴가', '4시간', '후4', 4),
      workList: [
        {type: '연차휴가', duration: '4시간', time: '후4'},
        {type: '연차휴가', duration: '4시간', time: '후4'},
      ],
    };

    const result = reconcileLeaveBalance(2026, [record], insaData([]));

    expect(result.reviewRows).toHaveLength(2);
    expect(result.reviewRows.every((row) => row.duplicateGroup === null && row.autoDecision === 'deduct')).toBe(true);
    expect(result.usedHours).toBe(8);
    expect(result.duplicateHours).toBe(0);
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

  test('does not automatically deduct an unknown leave label containing annual leave text', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([insaRecord('2026-08-01', '연차 외 휴가', '(후4)', '승인')])
    );

    expect(result.reviewRows[0]).toEqual(expect.objectContaining({
      autoDecision: 'exclude',
      canonicalType: '연차외휴가',
      needsReview: true
    }));
    expect(result.usedHours).toBe(0);
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

  test('clears an unknown-duration warning when the row is explicitly excluded', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([insaRecord('2026-08-07', '연차휴가', '(미정)')])
    );
    const row = result.reviewRows[0]!;

    const summary = calculateLeaveBalanceSummary(result, {[row.id]: 'exclude'}, {});

    expect(summary.unresolved).toHaveLength(0);
  });

  test('keeps both source rows and assigns the default duplicate decisions', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-08-07', '연차휴가', '4시간', '후4', 4)],
      insaData([insaRecord('2026-08-07', '연차휴가(시간차)', '(후4)')])
    );

    expect(result.reviewRows).toHaveLength(2);
    expect(new Set(result.reviewRows.map((row) => row.duplicateGroup)).size).toBe(1);
    expect(result.reviewRows.map((row) => row.source).sort()).toEqual(['insa', 'jade']);
    expect(result.reviewRows.find((row) => row.source === 'jade')).toEqual(expect.objectContaining({
      autoDecision: 'deduct',
      duplicateGroup: expect.any(String),
    }));
    expect(result.reviewRows.find((row) => row.source === 'insa')).toEqual(expect.objectContaining({
      autoDecision: 'duplicate',
    }));
  });

  test('excludes non-annual Jade leave types from the automatic annual balance', () => {
    const types = ['보건휴가', '생리휴가', '비전리더휴가', '건강검진휴가', '예비군훈련'];
    const result = reconcileLeaveBalance(
      2026,
      types.map((type, index) => jadeRecord(`2026-08-${String(index + 1).padStart(2, '0')}`, type, '4시간', '', 4)),
      insaData([])
    );

    expect(result.reviewRows).toHaveLength(types.length);
    expect(result.reviewRows.every((row) => row.autoDecision === 'exclude')).toBe(true);
    expect(result.reviewRows.every((row) => row.deductible === false)).toBe(true);
    expect(result.usedHours).toBe(0);
  });

  test('marks pending and cancelled rows as excluded and needing review', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([
        insaRecord('2026-08-01', '연차', '(후4)', '승인대기'),
        insaRecord('2026-08-02', '연차', '(후4)', '취소완료'),
      ])
    );

    expect(result.reviewRows).toHaveLength(2);
    expect(result.reviewRows.every((row) => row.autoDecision === 'exclude' && row.needsReview)).toBe(true);
  });

  test('allows an unknown duration to be manually deducted with entered hours', () => {
    const result = reconcileLeaveBalance(
      2026,
      [],
      insaData([insaRecord('2026-08-07', '연차휴가', '(미정)')])
    );
    const row = result.reviewRows[0]!;

    expect(result.usedHours).toBe(0);
    const summary = calculateLeaveBalanceSummary(
      result,
      {[row.id]: 'deduct'},
      {[row.id]: 4}
    );

    expect(summary.usedHours).toBe(4);
    expect(summary.remainingHours).toBe(116);
    expect(summary.unresolved).toHaveLength(0);
  });

  test('recalculates both rows when a duplicate group is manually set to deduct', () => {
    const result = reconcileLeaveBalance(
      2026,
      [jadeRecord('2026-08-07', '연차휴가', '4시간', '후4', 4)],
      insaData([insaRecord('2026-08-07', '연차휴가(시간차)', '(후4)')])
    );
    const decisions = Object.fromEntries(result.reviewRows.map((row) => [row.id, 'deduct' as const]));
    const summary = calculateLeaveBalanceSummary(result, decisions, {});

    expect(summary.usedHours).toBe(8);
    expect(summary.duplicateHours).toBe(0);
  });
});
