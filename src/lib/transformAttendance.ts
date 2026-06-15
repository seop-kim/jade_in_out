import {
  AttendanceRecord,
  AttendanceResult,
  DurationInfo,
  VacationInfo,
  WorkListRow,
} from '../api/jadeApi';
import {formatHm, isHolidayType, toYmd, ymdToKey} from './format';

export interface DisplayLoading {
  kind: 'loading';
}

export interface DisplayError {
  kind: 'error';
  error: string;
}

export interface DisplayHoliday {
  kind: 'holiday';
  label: string;
  workList: WorkListRow[];
}

export interface DisplayRemote {
  kind: 'remote';
  vacation: VacationInfo | null;
  workList: WorkListRow[];
}

export interface DisplayVacation {
  kind: 'vacation';
  label: string;
  workList: WorkListRow[];
}

export interface DisplayWork {
  kind: 'work';
  vacation: VacationInfo | null;
  workList: WorkListRow[];
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

export type DisplayRecord =
  | DisplayLoading
  | DisplayError
  | DisplayHoliday
  | DisplayRemote
  | DisplayVacation
  | DisplayWork;

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
    workList: record.workList,
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

export function buildDisplayRecord(
  ymd: string,
  data: AttendanceResult,
  today: Date
): DisplayRecord | null {
  if (data.error !== undefined) {
    return {kind: 'error', error: data.error};
  }
  if (data.remoteWork) {
    return {kind: 'remote', vacation: data.vacation, workList: data.workList};
  }
  if (isHolidayType(data.workType) && !data.dayOffWork) {
    return {kind: 'holiday', label: '휴일', workList: data.workList};
  }
  if (data.vacation?.isFullDay) {
    return {kind: 'vacation', label: data.vacation.type, workList: data.workList};
  }
  const todayYmd = toYmd(today.getFullYear(), today.getMonth(), today.getDate());
  return buildWorkRecord(data, ymd < todayYmd);
}

export function buildAttendanceMap(
  raw: Record<string, AttendanceResult>,
  today: Date
): AttendanceMap {
  const out: AttendanceMap = {};
  for (const [ymd, data] of Object.entries(raw)) {
    const display = buildDisplayRecord(ymd, data, today);
    if (display) out[ymdToKey(ymd)] = display;
  }
  return out;
}
