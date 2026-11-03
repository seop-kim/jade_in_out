import {CsvColumn, CsvRow} from './csvExport';
import {LeaveDecision, LeaveDecisionByRowId, LeaveHoursByRowId, LeaveReviewRow} from './leaveBalance';

export const LEAVE_BALANCE_EXPORT_COLUMNS: CsvColumn[] = [
  {key: 'period', label: '발생기간'},
  {key: 'date', label: '날짜'},
  {key: 'type', label: '휴가 유형'},
  {key: 'reason', label: '사유'},
  {key: 'hours', label: '시간'},
  {key: 'source', label: '출처'},
  {key: 'status', label: '승인상태'},
  {key: 'finalDecision', label: '최종 판정'},
  {key: 'appliedHours', label: '반영시간'},
];

function sourceLabel(source: LeaveReviewRow['source']): string {
  return source === 'jade' ? 'Jade' : '신규';
}

function decisionLabel(decision: LeaveDecision): string {
  if (decision === 'auto') return '자동';
  if (decision === 'deduct') return '차감';
  if (decision === 'duplicate') return '중복 제외';
  return '차감 제외';
}

function hoursLabel(hours: number | null): string {
  return hours === null ? '확인 필요' : `${hours}시간`;
}

export function effectiveLeaveDecision(row: LeaveReviewRow, decisions: LeaveDecisionByRowId): LeaveDecision {
  return decisions[row.id] ?? 'auto';
}

export function effectiveLeaveHours(row: LeaveReviewRow, hoursByRowId: LeaveHoursByRowId): number | null {
  const enteredHours = hoursByRowId[row.id];
  return typeof enteredHours === 'number' && enteredHours >= 0 ? enteredHours : row.hours;
}

export function buildLeaveBalanceExportRows(
  rows: readonly LeaveReviewRow[],
  decisions: LeaveDecisionByRowId = {},
  hoursByRowId: LeaveHoursByRowId = {},
): CsvRow[] {
  return rows.map((row) => {
    const selectedDecision = effectiveLeaveDecision(row, decisions);
    const effective = selectedDecision === 'auto' ? row.autoDecision : selectedDecision;
    const appliedHours = effectiveLeaveHours(row, hoursByRowId);
    return {
      period: row.periodLabel || '-',
      date: row.ymd,
      type: row.type,
      reason: row.reason || '-',
      hours: row.durationLabel || hoursLabel(row.hours),
      source: sourceLabel(row.source),
      status: row.status || '-',
      finalDecision: decisionLabel(effective),
      appliedHours: hoursLabel(appliedHours),
    };
  });
}
