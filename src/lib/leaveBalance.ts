import {AttendanceRecord} from '../api/jadeApi';
import {InsaLeavePageData, InsaLeaveRecord} from '../api/insaParsers';

export type LeaveRecordSource = 'jade' | 'insa' | 'both';

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
  source: Exclude<LeaveRecordSource, 'both'>;
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
  if (value.includes('연차') || value.includes('시간차') || value === '휴가') return 'annual';
  if (value.includes('병가')) return 'sick';
  if (value.includes('공가')) return 'official';
  return value.toLowerCase();
}

function parseDurationHours(durationLabel: string, type: string): number | null {
  const value = durationLabel.trim();
  const compactValue = compact(value);
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

function periodKey(durationLabel: string): string {
  const value = compact(durationLabel);
  if (!value) return 'full-day';
  if (/(?:전일|종일|하루)/.test(value)) return 'full-day';
  if (/^\d+(?:\.\d+)?(?:시간|h|일|d)$/i.test(value)) return 'full-day';
  if (/(?:오전|출|전)\d*/.test(value)) return 'morning';
  if (/(?:오후|퇴|후)\d*/.test(value)) return 'afternoon';
  return value;
}

function isApproved(status: string): boolean {
  return /^(?:승인|승인완료|완료|approved|complete|completed|confirmed)$/i.test(compact(status));
}

function isJadeLeaveType(type: string): boolean {
  const value = compact(type);
  return value.includes('연차')
    || value.includes('시간차')
    || value.includes('휴가')
    || value.includes('병가')
    || value.includes('공가');
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
    periodKey: periodKey(time || durationLabel),
    hours,
    status: '확정',
    source: 'jade',
    deductible: hours !== null,
  };
}

function normalizeJadeRecords(record: AttendanceRecord): NormalizedLeaveRecord[] {
  const ymd = normalizeYmd(record.ymd) ?? record.ymd;
  const leaveRows = record.workList.filter((row) => isJadeLeaveType(row.type));
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
    periodKey: periodKey(record.durationLabel),
    hours,
    status: record.approvalStatus,
    source: 'insa',
    deductible: hours !== null && isApproved(record.approvalStatus),
  };
}

function yearFromYmd(ymd: string): number | null {
  const normalized = normalizeYmd(ymd);
  const match = normalized?.match(/^(\d{4})-/);
  return match?.[1] ? Number(match[1]) : null;
}

function matchKey(record: NormalizedLeaveRecord): string | null {
  if (!record.deductible || record.hours === null) return null;
  return `${record.ymd}|${record.canonicalType}|${record.hours}|${record.periodKey}`;
}

function toPublicRecord(
  record: NormalizedLeaveRecord,
  source: LeaveRecordSource = record.source,
  duplicate = false
): LeaveBalanceRecord {
  return {...record, source, duplicate};
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
  let duplicateHours = 0;

  for (const jadeRecord of jade) {
    const key = matchKey(jadeRecord);
    const bucket = key ? insaByKey.get(key) : undefined;
    const matchingInsa = bucket?.find((record) => !matchedInsa.has(record));
    if (matchingInsa) {
      matchedInsa.add(matchingInsa);
      duplicateHours += matchingInsa.hours ?? 0;
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
  const unresolved = records.filter(
    (record): record is UnresolvedLeaveRecord => record.hours === null
  ).map((record) => ({...record, reason: 'unknown-duration' as const}));

  return {
    year,
    accruedHours,
    jadeUsedHours,
    insaUsedHours,
    duplicateHours,
    usedHours,
    remainingHours: accruedHours - usedHours,
    records,
    unresolved,
  };
}
