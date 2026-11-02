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
  if (/(?:오전|출|전)\d*/.test(value)) return 'morning';
  if (/(?:오후|퇴|후)\d*/.test(value)) return 'afternoon';
  if (/(?:전일|종일|하루)/.test(value)) return 'full-day';
  if (/^\d+(?:\.\d+)?(?:시간|h|일)$/.test(value)) return 'full-day';
  return value;
}

function isApproved(status: string): boolean {
  return /승인|완료/.test(status);
}

function normalizeJadeRecord(record: AttendanceRecord): NormalizedLeaveRecord | null {
  if (!record.vacation) return null;
  const hours = record.vacation.hours > 0 ? record.vacation.hours : null;
  return {
    ymd: record.ymd,
    type: record.vacation.type,
    canonicalType: canonicalType(record.vacation.type),
    durationLabel: [record.vacation.duration, record.vacation.time ? `(${record.vacation.time})` : '']
      .filter(Boolean)
      .join(' '),
    periodKey: periodKey(record.vacation.time),
    hours,
    status: '확정',
    source: 'jade',
    deductible: hours !== null,
  };
}

function normalizeInsaRecord(record: InsaLeaveRecord): NormalizedLeaveRecord {
  const hours = parseDurationHours(record.durationLabel, record.type);
  return {
    ymd: record.ymd,
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
  const match = ymd.match(/^(\d{4})-/);
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
    .map(normalizeJadeRecord)
    .filter((record): record is NormalizedLeaveRecord => record !== null);
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
