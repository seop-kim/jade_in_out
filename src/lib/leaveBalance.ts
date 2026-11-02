import {AttendanceRecord, JadeLeaveBalance} from '../api/jadeApi';
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
  periodId: string | null;
  periodLabel: string | null;
  deductible: boolean;
  duplicateGroup: string | null;
  autoDecision: Exclude<LeaveDecision, 'auto'>;
  needsReview: boolean;
}

export interface LeaveBalancePeriod {
  id: string;
  year: number;
  period: string;
  startYmd: string;
  endYmd: string;
  isNewHire: boolean;
  accruedHours: number;
  usedHours: number;
  remainingHours: number;
  jadeAccruedHours?: number | null;
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
  periods: LeaveBalancePeriod[];
  availablePeriods: LeaveBalancePeriod[];
  includePreviousPeriod: boolean;
  unresolved: UnresolvedLeaveRecord[];
}

export type LeaveDecisionByRowId = Readonly<Record<string, LeaveDecision>>;
export type LeaveHoursByRowId = Readonly<Record<string, number | undefined>>;

export interface LeaveBalanceSummary {
  jadeUsedHours: number;
  insaUsedHours: number;
  duplicateHours: number;
  usedHours: number;
  remainingHours: number;
  unresolved: UnresolvedLeaveRecord[];
}

export type LeaveUsageLoader = (
  year: number,
  signal?: AbortSignal,
  onProgress?: (progress: {year?: number; completed: number; total: number}) => void,
  includePreviousPeriod?: boolean
) => Promise<AttendanceRecord[]>;

export type InsaLeaveLoader = (
  year: number,
  signal?: AbortSignal,
  onProgress?: (progress: {completed: number; total: number}) => void,
  includePreviousPeriod?: boolean
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
  periodId: string | null;
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

function periodId(year: number, period: string): string {
  return `${year}|${period}`;
}

function periodRange(year: number, period: string): {startYmd: string; endYmd: string; isNewHire: boolean} {
  const dates = period.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const startYmd = dates[0] ?? `${year}-01-01`;
  const endYmd = dates[1] ?? `${year}-12-31`;
  return {
    startYmd,
    endYmd,
    isNewHire: startYmd !== `${year}-01-01`,
  };
}

function toLeaveBalancePeriod(balance: InsaLeavePageData['balances'][number]): LeaveBalancePeriod {
  const range = periodRange(balance.year, balance.period);
  return {
    id: periodId(balance.year, balance.period),
    year: balance.year,
    period: balance.period,
    ...range,
    accruedHours: balance.accruedHours,
    usedHours: balance.usedHours,
    remainingHours: balance.remainingHours,
  };
}

function periodForYmd(ymd: string, periods: readonly LeaveBalancePeriod[]): string | null {
  const candidates = periods
    .filter((period) => ymd >= period.startYmd && ymd <= period.endYmd)
    .sort((left, right) => right.startYmd.localeCompare(left.startYmd));
  return candidates[0]?.id ?? null;
}

function canonicalType(type: string): string {
  const value = compact(type);
  if (value.includes('보건') || value.includes('생리')) return 'health';
  if (isAnnualLeaveType(type)) return 'annual';
  if (value.includes('병가')) return 'sick';
  if (value.includes('공가')) return 'official';
  return value.toLowerCase();
}

function isAnnualLeaveType(type: string): boolean {
  const value = compact(type);
  if (value === '휴가' || value === '연차' || value === '시간차' || value === '시간차휴가') return true;
  return /^연차휴가(?:시간차|시간|종일|전일|반차)?$/.test(value);
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
  if (isAnnualLeaveType(type) || isKnownNonDeductibleLeaveType(type)) return true;
  return /(휴가|휴직|병가|공가|경조|출산|육아|예비군|검진|보건|생리|비전리더|반차|반일)/.test(value);
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
  hoursOverride?: number,
  periodIdValue: string | null = null,
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
    periodId: periodIdValue,
    deductible: hours !== null && isAnnualLeaveType(type),
  };
}

function normalizeJadeRecords(record: AttendanceRecord, periods: readonly LeaveBalancePeriod[]): NormalizedLeaveRecord[] {
  const ymd = normalizeYmd(record.ymd) ?? record.ymd;
  const recordPeriodId = periodForYmd(ymd, periods);
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
        recordPeriodId,
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
    recordPeriodId,
  )];
}

function normalizeInsaRecord(record: InsaLeaveRecord, periods: readonly LeaveBalancePeriod[]): NormalizedLeaveRecord {
  const ymd = normalizeYmd(record.ymd) ?? record.ymd;
  const hours = parseDurationHours(record.durationLabel, record.type);
  return {
    ymd,
    type: record.type,
    canonicalType: canonicalType(record.type),
    durationLabel: record.durationLabel,
    periodKey: periodKey(record.durationLabel, hours),
    hours,
    status: record.approvalStatus,
    reason: record.reason,
    source: 'insa',
    periodId: record.periodId ?? periodForYmd(ymd, periods),
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
  insa: readonly NormalizedLeaveRecord[],
  periods: readonly LeaveBalancePeriod[]
): LeaveReviewRow[] {
  const allRecords = [...jade, ...insa];
  const groupByRecord = new Map<NormalizedLeaveRecord, string>();
  const decisionByRecord = new Map<NormalizedLeaveRecord, Exclude<LeaveDecision, 'auto'>>();
  const insaByKey = new Map<string, NormalizedLeaveRecord[]>();
  insa.forEach((record) => {
    const key = matchKey(record);
    if (!key) return;
    const bucket = insaByKey.get(key) ?? [];
    bucket.push(record);
    insaByKey.set(key, bucket);
  });
  const matchedInsa = new Set<NormalizedLeaveRecord>();
  let groupNumber = 0;
  jade.forEach((jadeRecord) => {
    const key = matchKey(jadeRecord);
    const matchingInsa = key
      ? insaByKey.get(key)?.find((record) => !matchedInsa.has(record))
      : undefined;
    if (!matchingInsa) return;
    matchedInsa.add(matchingInsa);
    const bucket = [jadeRecord, matchingInsa];
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

  return allRecords.map((record, index) => {
    const period = periods.find((candidate) => candidate.id === record.periodId);
    return {
      id: `${record.source}-${index}`,
      ymd: record.ymd,
      type: record.type,
      canonicalType: record.canonicalType,
      durationLabel: record.durationLabel,
      hours: record.hours,
      status: record.status,
      reason: record.reason,
      source: record.source,
      periodId: record.periodId,
      periodLabel: period ? `${period.year} ${period.isNewHire ? '신입휴가' : '연차'}` : null,
      deductible: record.deductible,
      duplicateGroup: groupByRecord.get(record) ?? null,
      autoDecision: decisionByRecord.get(record) ?? defaultDecision(record),
      needsReview: needsReview(record),
    };
  }).sort((left, right) => `${left.ymd}|${left.source}|${left.id}`.localeCompare(`${right.ymd}|${right.source}|${right.id}`));
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
  let jadeUsedHours = 0;
  let insaUsedHours = 0;
  let usedHours = 0;
  let duplicateHours = 0;
  const unresolved = result.reviewRows
    .filter((row) => {
      const selectedDecision = decisions[row.id] ?? 'auto';
      const acknowledged = selectedDecision === 'exclude' || selectedDecision === 'duplicate';
      return row.hours === null
        && !acknowledged
        && !(hoursByRowId[row.id] && (hoursByRowId[row.id] ?? 0) > 0);
    })
    .map(reviewRowToPublicRecord)
    .map((record) => ({...record, reason: 'unknown-duration' as const}));

  result.reviewRows.forEach((row) => {
    const decision = effectiveDecision(row, decisions);
    const enteredHours = hoursByRowId[row.id];
    const hours = typeof enteredHours === 'number' && Number.isFinite(enteredHours) && enteredHours > 0
      ? enteredHours
      : row.hours;
    if (hours === null) return;
    if (row.deductible) {
      if (row.source === 'jade') jadeUsedHours += hours;
      if (row.source === 'insa') insaUsedHours += hours;
    }
    if (decision === 'deduct') {
      usedHours += hours;
    }
    if (decision === 'duplicate') duplicateHours += hours;
  });

  return {
    jadeUsedHours,
    insaUsedHours,
    usedHours,
    duplicateHours,
    remainingHours: result.accruedHours - usedHours,
    unresolved,
  };
}

export function reconcileLeaveBalance(
  year: number,
  jadeRecords: readonly AttendanceRecord[],
  insaData: InsaLeavePageData,
  includePreviousPeriod = false,
  jadeBalances: readonly JadeLeaveBalance[] = [],
): LeaveBalanceResult {
  const allPeriods = insaData.balances.map(toLeaveBalancePeriod);
  const periods = allPeriods.filter((period) => (
    period.year === year
    || (includePreviousPeriod && period.year === year - 1 && period.isNewHire)
  )).map((period) => {
    const normalizePeriod = (value: string): string => value.replace(/\./g, '-');
    const jadeBalance = jadeBalances.find((balance) => normalizePeriod(balance.period) === normalizePeriod(period.period));
    return {...period, jadeAccruedHours: jadeBalance?.accruedHours ?? null};
  });
  const includedYears = new Set(periods.map((period) => period.year));
  const jade = jadeRecords
    .filter((record) => includedYears.has(yearFromYmd(record.ymd) ?? -1))
    .flatMap((record) => normalizeJadeRecords(record, periods));
  const insa = insaData.records
    .filter((record) => includedYears.has(yearFromYmd(record.ymd) ?? -1))
    .map((record) => normalizeInsaRecord(record, periods));

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
  const accruedHours = periods.reduce((total, period) => total + period.accruedHours, 0);
  const reviewRows = buildReviewRows(jade, insa, periods);
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
    periods,
    availablePeriods: allPeriods,
    includePreviousPeriod,
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
