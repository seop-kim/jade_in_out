import {LeaveDecisionByRowId, LeaveHoursByRowId, LeaveReviewRow} from './leaveBalance';
import {
  LEAVE_BALANCE_EXPORT_COLUMNS,
  buildLeaveBalanceExportRows,
} from './leaveBalanceExport';

const rows: LeaveReviewRow[] = [
  {
    id: 'jade-1',
    ymd: '2026-05-26',
    type: '연차휴가',
    canonicalType: 'annual',
    durationLabel: '6시간 (09:00~15:00)',
    hours: 6,
    status: '확정',
    reason: '',
    source: 'jade',
    periodId: '2026-period',
    periodLabel: '2026 연차',
    deductible: true,
    duplicateGroup: null,
    autoDecision: 'deduct',
    needsReview: false,
  },
  {
    id: 'insa-1',
    ymd: '2026-05-26',
    type: '연차휴가(시간차)',
    canonicalType: 'annual',
    durationLabel: '(출4)',
    hours: 4,
    status: '승인',
    reason: '개인 사유',
    source: 'insa',
    periodId: '2026-period',
    periodLabel: '2026 연차',
    deductible: true,
    duplicateGroup: 'duplicate-1',
    autoDecision: 'duplicate',
    needsReview: false,
  },
];

describe('leaveBalanceExport', () => {
  test('builds export rows with the final decision and effective hours', () => {
    const decisions: LeaveDecisionByRowId = {'insa-1': 'exclude'};
    const hours: LeaveHoursByRowId = {};

    expect(buildLeaveBalanceExportRows(rows, decisions, hours)).toEqual([
      {
        period: '2026 연차',
        date: '2026-05-26',
        type: '연차휴가',
        reason: '-',
        hours: '6시간 (09:00~15:00)',
        source: 'Jade',
        status: '확정',
        autoDecision: '차감',
        finalDecision: '차감',
        appliedHours: '6시간',
      },
      {
        period: '2026 연차',
        date: '2026-05-26',
        type: '연차휴가(시간차)',
        reason: '개인 사유',
        hours: '(출4)',
        source: '신규',
        status: '승인',
        autoDecision: '중복 제외',
        finalDecision: '차감 제외',
        appliedHours: '4시간',
      },
    ]);
    expect(LEAVE_BALANCE_EXPORT_COLUMNS.map((column) => column.key)).toEqual([
      'period', 'date', 'type', 'reason', 'hours', 'source', 'status', 'autoDecision', 'finalDecision', 'appliedHours',
    ]);
  });

  test('uses manually entered hours for unknown-duration rows', () => {
    const unknownRow: LeaveReviewRow = {...rows[0]!, id: 'unknown-1', hours: null, durationLabel: '확인 필요'};
    expect(buildLeaveBalanceExportRows([unknownRow], {}, {'unknown-1': 2})[0]?.appliedHours).toBe('2시간');
  });
});
