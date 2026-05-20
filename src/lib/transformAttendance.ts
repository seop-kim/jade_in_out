import {
  AttendanceRecord,
  AttendanceResult,
  DurationInfo,
  VacationInfo,
} from '../api/jadeApi';
import {formatHm, isHolidayType, toYmd, ymdToKey} from './format';

export interface DisplayError {
  kind: 'error';
  error: string;
}

export interface DisplayHoliday {
  kind: 'holiday';
  label: string;
}

export interface DisplayVacation {
  kind: 'vacation';
  label: string;
}

export interface DisplayWork {
  kind: 'work';
  vacation: VacationInfo | null;
  dayOffWork: DurationInfo | null;
  overtime: DurationInfo | null;
  clockIn: string;
  clockInChanged: boolean;
  clockInLocal: boolean;
  clockInMissing: boolean;
  clockOut: string;
  clockOutChanged: boolean;
  clockOutLocal: boolean;
  clockOutMissing: boolean;
  workDay: string;
}

export type DisplayRecord = DisplayError | DisplayHoliday | DisplayVacation | DisplayWork;

export type AttendanceMap = Record<string, DisplayRecord>;

function buildWorkRecord(record: AttendanceRecord, isPast: boolean): DisplayWork | null {
  let clockIn = formatHm(record.clockIn);
  let clockInChanged = record.clockInChanged;
  const clockInLocal = record.clockInLocal;

  let clockOut = formatHm(record.clockOut);
  let clockOutChanged = record.clockOutChanged;
  const clockOutLocal = record.clockOutLocal;

  if (!isPast && clockInChanged) {
    clockIn = '';
    clockInChanged = false;
  }
  if (!isPast && clockOutChanged) {
    clockOut = '';
    clockOutChanged = false;
  }

  const clockInMissing = isPast && !clockIn && !clockInLocal;
  const clockOutMissing = isPast && !clockOut && !clockOutLocal;

  const hasContent =
    clockIn ||
    clockOut ||
    clockInLocal ||
    clockOutLocal ||
    record.vacation ||
    record.overtime ||
    record.dayOffWork ||
    clockInMissing ||
    clockOutMissing;

  if (!hasContent) return null;

  return {
    kind: 'work',
    vacation: record.vacation,
    dayOffWork: record.dayOffWork,
    overtime: record.overtime,
    clockIn,
    clockInChanged,
    clockInLocal,
    clockInMissing,
    clockOut,
    clockOutChanged,
    clockOutLocal,
    clockOutMissing,
    workDay: record.workDay,
  };
}

export function buildAttendanceMap(
  raw: Record<string, AttendanceResult>,
  today: Date
): AttendanceMap {
  const todayYmd = toYmd(today.getFullYear(), today.getMonth(), today.getDate());
  const out: AttendanceMap = {};

  for (const [ymd, data] of Object.entries(raw)) {
    const key = ymdToKey(ymd);

    if (data.error !== undefined) {
      out[key] = {kind: 'error', error: data.error};
      continue;
    }

    if (isHolidayType(data.workType) && !data.dayOffWork) {
      out[key] = {kind: 'holiday', label: '휴일'};
      continue;
    }

    if (data.vacation?.isFullDay) {
      out[key] = {kind: 'vacation', label: data.vacation.type};
      continue;
    }

    const work = buildWorkRecord(data, ymd < todayYmd);
    if (work) out[key] = work;
  }

  return out;
}
