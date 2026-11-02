import {AttendanceRecord} from '../api/jadeApi';
import {InsaLeavePageData, InsaLeaveRecord} from '../api/insaParsers';

export type LeaveRecordSource = 'jade' | 'insa' | 'both';
export type LeaveSource = Exclude<LeaveRecordSource, 'both'>;
export type LeaveDecision = 'auto' | 'deduct' | 'exclude' | 'duplicate';

export interface LeaveBalanceRecord {
  ymd: string;
  type: string;
  canonicalType: string;
  durationLabel: string;
  hours: number | null;
  status: string;
  source: LeaveRecordSource;
  deductible: boolean;
  duplicate: boolean;
}

export interface LeaveReviewRow {
  id: string;
  ymd: string;
  type: string;
  canonicalType: string;
  durationLabel: string;
  hours: number | null;
  status: string;
  reason: string;
  source: LeaveSource;
  deductible: boolean;
  duplicateGroup: string | null;
  autoDecision: Exclude<LeaveDecision, 'auto'>;
  needsReview: boolean;
}

export interface UnresolvedLeaveRecord extends LeaveBalanceRecord {
  reason: 'unknown-duration';
}

export interface LeaveBalanceResult {
  year: number;
  accruedHours: number;
  jadeUsedHours: number;
  insaUsedHours: number;
  duplicateHours: number;
  usedHours: number;
  remainingHours: number;
  records: LeaveBalanceRecord[];
  reviewRows: LeaveReviewRow[];
  unresolved: UnresolvedLeaveRecord[];
}

export type LeaveDecisionByRowId = Readonly<Record<string, LeaveDecision>>;
export type LeaveHoursByRowId = Readonly<Record<string, number | undefined>>;

export interface LeaveBalanceSummary {
  duplicateHours: number;
  usedHours: number;
  remainingHours: number;
  unresolved: UnresolvedLeaveRecord[];
}

export type LeaveUsageLoader = (
  year: number,
  signal?: AbortSignal,
  onProgress?: (progress: {completed: number; total: number}) => void
) => Promise<AttendanceRecord[]>;

export type InsaLeaveLoader = (
  year: number,
  signal?: AbortSignal,
  onProgress?: (progress: {completed: number; total: number}) => void
) => Promise<InsaLeavePageData>;

interface NormalizedLeaveRecord {
  ymd: string;
  type: string;
  canonicalType: string;
  durationLabel: string;
  periodKey: string;
  hours: number | null;
  status: string;
  reason: string;
  source: LeaveSource;
  deductible: boolean;
}

function compact(value: string): string {
  return value.replace(/[\s()]/g, '').trim();
}

function normalizeYmd(ymd: string): string | null {
  const match = ymd.trim().match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function canonicalType(type: string): string {
  const value = compact(type);
  if (value.includes('보건') || value.includes('생리')) return 'health';
  if (value.includes('연차') || value.includes('시간차') || value === '휴가') return 'annual';
  if (value.includes('병가')) return 'sick';
  if (value.includes('공가')) return 'official';
  return value.toLowerCase();
}

function isAnnualLeaveType(type: string): boolean {
  const value = compact(type);
  return value.includes('연차') || value.includes('시간차') || value === '휴가';
}

function isKnownNonDeductibleLeaveType(type: string): boolean {
  const value = compact(type);
  return canonicalType(type) === 'health'
    || value.includes('비전리더')
    || value.includes('건강검진')
    || value.includes('예비군');
}

function isReviewLeaveType(type: string): boolean {
  const value = compact(type);
  return !['연장', '휴무일', '재택근무', '현지출근신청', '현지퇴근신청'].includes(value);
}

function parseDurationHours(durationLabel: string, type: string): number | null {
  const value = durationLabel.trim();
  const compactValue = compact(value);
  const fullDayType = /(?:전일|종일|하루)/.test(compact(type));
  const numericDayCount = compactValue.match(/^\d+(?:\.\d+)?$/);

  if (fullDayType && numericDayCount?.[0]) return Number(numericDayCount[0]) * 8;

  const hoursMatch = compactValue.match(/(\d+(?:\.\d+)?)시간/);
  if (hoursMatch?.[1]) return Number(hoursMatch[1]);

  const shortHoursMatch = compactValue.match(/^(\d+(?:\.\d+)?)h$/i);
  if (shortHoursMatch?.[1]) return Number(shortHoursMatch[1]);

  const shortDaysMatch = compactValue.match(/^(\d+(?:\.\d+)?)d$/i);
  if (shortDaysMatch?.[1]) return Number(shortDaysMatch[1]) * 8;

  const markerMatch = compactValue.match(/(?:출|퇴|전|후)(\d+(?:\.\d+)?)/);
  if (markerMatch?.[1]) return Number(markerMatch[1]);

  const daysMatch = compactValue.match(/(\d+(?:\.\d+)?)일/);
  if (daysMatch?.[1]) return Number(daysMatch[1]) * 8;

  if (/(?:오전|오후|반차)/.test(compactValue)) return 4;
  if (/(?:전일|종일|하루)/.test(compactValue)) return 8;
  if (!value && canonicalType(type) === 'annual') return 8;
  return null;
}

function periodKey(durationLabel: string, hours?: number | null): string {
  const value = compact(durationLabel);
  if (!value) return 'full-day';
  if (hours !== null && hours !== undefined && hours >= 8) return 'full-day';
  if (/(?:전일|종일|하루)/.test(value)) return 'full-day';
  if (/^\d+(?:\.\d+)?(?:시간|h|일|d)$/i.test(value)) return 'full-day';
  const clockRangeMatch = value.match(/^(?:\d+(?:\.\d+)?시간)?(\d{1,2})(?::\d{2})?[-~]\d{1,2}(?::\d{2})?$/i);
  if (clockRangeMatch?.[1]) return Number(clockRangeMatch[1]) < 12 ? 'morning' : 'afternoon';
  if (/(?:오전|출|전)\d*/.test(value)) return 'morning';
  if (/(?:오후|퇴|후)\d*/.test(value)) return 'afternoon';
  return value;
}

function isApproved(status: string): boolean {
  const compactStatus = compact(status);
  if (/(?:반려|취소|대기|미승인|신청)/.test(compactStatus)) return false;

  const isApprovedToken = (token: string): boolean => (
    /^(?:승인|승인완료|완료|approved|complete|completed|confirmed)$/i.test(compact(token))
  );
  if (isApprovedToken(status)) return true;

  const approvalTokens = status.match(/:\s*([^\s)]+)/g)
    ?.map((entry) => entry.replace(/^:\s*/, ''))
    ?? [];
  return approvalTokens.length > 0 && approvalTokens.every(isApprovedToken);
}

function normalizeJadeLeave(
  ymd: string,
  type: string,
  durationLabel: string,
  time: string,
  hoursOverride?: number
): NormalizedLeaveRecord {
  const parsedHours = parseDurationHours(durationLabel, type);
  const hours = hoursOverride !== undefined && hoursOverride > 0
    ? hoursOverride
    : parsedHours;
  return {
    ymd,
    type,
    canonicalType: canonicalType(type),
    durationLabel: [durationLabel, time ? `(${time})` : '']
      .filter(Boolean)
      .join(' '),
    periodKey: periodKey(time || durationLabel, hours),
    hours,
    status: '확정',
    reason: '',
    source: 'jade',
    deductible: hours !== null && isAnnualLeaveType(type),
  };
}

function normalizeJadeRecords(record: AttendanceRecord): NormalizedLeaveRecord[] {
  const ymd = normalizeYmd(record.ymd) ?? record.ymd;
  const leaveRows = record.workList.filter((row) => isReviewLeaveType(row.type));
  if (leaveRows.length > 0) {
    return leaveRows.map((row, index) => {
      const matchesConvenienceField = index === 0
        && record.vacation
        && compact(record.vacation.type) === compact(row.type)
        && compact(record.vacation.duration) === compact(row.duration)
        && compact(record.vacation.time) === compact(row.time);
      return normalizeJadeLeave(
        ymd,
        row.type,
        row.duration,
        row.time,
        matchesConvenienceField ? record.vacation?.hours : undefined,
      );
    });
  }
  if (!record.vacation) return [];
  return [normalizeJadeLeave(
    ymd,
    record.vacation.type,
    record.vacation.duration,
    record.vacation.time,
    record.vacation.hours,
  )];
}

function normalizeInsaRecord(record: InsaLeaveRecord): NormalizedLeaveRecord {
  const hours = parseDurationHours(record.durationLabel, record.type);
  return {
    ymd: normalizeYmd(record.ymd) ?? record.ymd,
    type: record.type,
    canonicalType: canonicalType(record.type),
    durationLabel: record.durationLabel,
    periodKey: periodKey(record.durationLabel, hours),
    hours,
    status: record.approvalStatus,
    reason: record.reason,
    source: 'insa',
    deductible: hours !== null
      && isApproved(record.approvalStatus)
      && isAnnualLeaveType(record.type),
  };
}

function yearFromYmd(ymd: string): number | null {
  const normalized = normalizeYmd(ymd);
  const match = normalized?.match(/^(\d{4})-/);
  return match?.[1] ? Number(match[1]) : null;
}

function matchKey(record: NormalizedLeaveRecord): string | null {
  if (record.hours === null) return null;
  return `${record.ymd}|${record.canonicalType}|${record.hours}|${record.periodKey}`;
}

function toPublicRecord(
  record: NormalizedLeaveRecord,
  source: LeaveRecordSource = record.source,
  duplicate = false
): LeaveBalanceRecord {
  return {...record, source, duplicate};
}

function reviewRowToPublicRecord(row: LeaveReviewRow): LeaveBalanceRecord {
  return {
    ymd: row.ymd,
    type: row.type,
    canonicalType: row.canonicalType,
    durationLabel: row.durationLabel,
    hours: row.hours,
    status: row.status,
    source: row.source,
    deductible: row.deductible,
    duplicate: row.autoDecision === 'duplicate',
  };
}

function needsReview(record: NormalizedLeaveRecord): boolean {
  if (record.hours === null) return true;
  if (record.source === 'insa' && !isApproved(record.status)) return true;
  return !isAnnualLeaveType(record.type) && !isKnownNonDeductibleLeaveType(record.type);
}

function defaultDecision(record: NormalizedLeaveRecord): Exclude<LeaveDecision, 'auto'> {
  return record.deductible && record.hours !== null ? 'deduct' : 'exclude';
}

function buildReviewRows(
  jade: readonly NormalizedLeaveRecord[],
  insa: readonly NormalizedLeaveRecord[]
): LeaveReviewRow[] {
  const allRecords = [...jade, ...insa];
  const grouped = new Map<string, NormalizedLeaveRecord[]>();
  allRecords.forEach((record) => {
    const key = matchKey(record);
    if (!key) return;
    const bucket = grouped.get(key) ?? [];
    bucket.push(record);
    grouped.set(key, bucket);
  });

  const groupByRecord = new Map<NormalizedLeaveRecord, string>();
  const decisionByRecord = new Map<NormalizedLeaveRecord, Exclude<LeaveDecision, 'auto'>>();
  let groupNumber = 0;
  grouped.forEach((bucket) => {
    if (bucket.length < 2) return;
    const groupId = `duplicate-${groupNumber}`;
    groupNumber += 1;
    bucket.forEach((record) => groupByRecord.set(record, groupId));
    const preferred = bucket.find((record) => record.source === 'jade' && record.deductible && record.hours !== null)
      ?? bucket.find((record) => record.deductible && record.hours !== null);
    bucket.forEach((record) => {
      if (!record.deductible || record.hours === null) {
        decisionByRecord.set(record, 'exclude');
      } else if (record === preferred) {
        decisionByRecord.set(record, 'deduct');
      } else {
        decisionByRecord.set(record, 'duplicate');
      }
    });
  });

  return allRecords.map((record, index) => ({
    id: `${record.source}-${index}`,
    ymd: record.ymd,
    type: record.type,
    canonicalType: record.canonicalType,
    durationLabel: record.durationLabel,
    hours: record.hours,
    status: record.status,
    reason: record.reason,
    source: record.source,
    deductible: record.deductible,
    duplicateGroup: groupByRecord.get(record) ?? null,
    autoDecision: decisionByRecord.get(record) ?? defaultDecision(record),
    needsReview: needsReview(record),
  })).sort((left, right) => `${left.ymd}|${left.source}|${left.id}`.localeCompare(`${right.ymd}|${right.source}|${right.id}`));
}

function effectiveDecision(row: LeaveReviewRow, decisions: LeaveDecisionByRowId): Exclude<LeaveDecision, 'auto'> {
  const decision = decisions[row.id] ?? 'auto';
  return decision === 'auto' ? row.autoDecision : decision;
}

export function calculateLeaveBalanceSummary(
  result: LeaveBalanceResult,
  decisions: LeaveDecisionByRowId = {},
  hoursByRowId: LeaveHoursByRowId = {}
): LeaveBalanceSummary {
  let usedHours = 0;
  let duplicateHours = 0;
  const unresolved = result.reviewRows
    .filter((row) => row.hours === null && !(hoursByRowId[row.id] && (hoursByRowId[row.id] ?? 0) > 0))
    .map(reviewRowToPublicRecord)
    .map((record) => ({...record, reason: 'unknown-duration' as const}));

  result.reviewRows.forEach((row) => {
    const decision = effectiveDecision(row, decisions);
    const enteredHours = hoursByRowId[row.id];
    const hours = typeof enteredHours === 'number' && Number.isFinite(enteredHours) && enteredHours > 0
      ? enteredHours
      : row.hours;
    if (hours === null) return;
    if (decision === 'deduct') usedHours += hours;
    if (decision === 'duplicate') duplicateHours += hours;
  });

  return {
    usedHours,
    duplicateHours,
    remainingHours: result.accruedHours - usedHours,
    unresolved,
  };
}

export function reconcileLeaveBalance(
  year: number,
  jadeRecords: readonly AttendanceRecord[],
  insaData: InsaLeavePageData
): LeaveBalanceResult {
  const jade = jadeRecords
    .filter((record) => yearFromYmd(record.ymd) === year)
    .flatMap(normalizeJadeRecords);
  const insa = insaData.records
    .filter((record) => yearFromYmd(record.ymd) === year)
    .map(normalizeInsaRecord);

  const insaByKey = new Map<string, NormalizedLeaveRecord[]>();
  for (const record of insa) {
    const key = matchKey(record);
    if (!key) continue;
    const bucket = insaByKey.get(key) ?? [];
    bucket.push(record);
    insaByKey.set(key, bucket);
  }

  const records: LeaveBalanceRecord[] = [];
  const matchedInsa = new Set<NormalizedLeaveRecord>();

  for (const jadeRecord of jade) {
    const key = matchKey(jadeRecord);
    const bucket = key ? insaByKey.get(key) : undefined;
    const matchingInsa = bucket?.find((record) => !matchedInsa.has(record));
    if (matchingInsa) {
      matchedInsa.add(matchingInsa);
      records.push(toPublicRecord(jadeRecord, 'both', true));
    } else {
      records.push(toPublicRecord(jadeRecord));
    }
  }

  for (const insaRecord of insa) {
    if (!matchedInsa.has(insaRecord)) records.push(toPublicRecord(insaRecord));
  }

  records.sort((left, right) => `${left.ymd}|${left.source}`.localeCompare(`${right.ymd}|${right.source}`));

  const jadeUsedHours = jade
    .filter((record) => record.deductible && record.hours !== null)
    .reduce((total, record) => total + (record.hours ?? 0), 0);
  const insaUsedHours = insa
    .filter((record) => record.deductible && record.hours !== null)
    .reduce((total, record) => total + (record.hours ?? 0), 0);
  const usedHours = records
    .filter((record) => record.deductible && record.hours !== null)
    .reduce((total, record) => total + (record.hours ?? 0), 0);
  const accruedHours = insaData.balances
    .filter((balance) => balance.year === year)
    .reduce((total, balance) => total + balance.accruedHours, 0);
  const reviewRows = buildReviewRows(jade, insa);
  const baseResult: LeaveBalanceResult = {
    year,
    accruedHours,
    jadeUsedHours,
    insaUsedHours,
    duplicateHours: 0,
    usedHours: 0,
    remainingHours: accruedHours,
    records,
    reviewRows,
    unresolved: [],
  };
  const automaticSummary = calculateLeaveBalanceSummary(
    baseResult,
    Object.fromEntries(reviewRows.map((row) => [row.id, 'auto' as const])),
    {}
  );

  return {
    ...baseResult,
    ...automaticSummary,
  };
}
