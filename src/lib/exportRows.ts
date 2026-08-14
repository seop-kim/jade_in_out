import {AttendanceResult} from '../api/jadeApi';
import {InsaCalendarMap} from './transformInsa';
import {formatHm} from './format';
import {CsvColumn, CsvRow} from './csvExport';

export const JADE_EXPORT_COLUMNS: CsvColumn[] = [
  {key: 'date', label: '날짜'},
  {key: 'workDay', label: '요일'},
  {key: 'workType', label: '근무 유형'},
  {key: 'clockIn', label: '출근 시간'},
  {key: 'clockOut', label: '퇴근 시간'},
  {key: 'vacation', label: '휴가'},
  {key: 'overtime', label: '연장 시간'},
  {key: 'dayOffWork', label: '휴일 근무'},
  {key: 'remoteWork', label: '재택근무'},
  {key: 'workList', label: '근무 상세'},
  {key: 'status', label: '조회 상태'},
];

export const INSA_EXPORT_COLUMNS: CsvColumn[] = [
  {key: 'date', label: '날짜'},
  {key: 'weekday', label: '요일'},
  {key: 'holiday', label: '휴일'},
  {key: 'departmentLeave', label: '연차'},
  {key: 'departmentTime', label: '시간차'},
  {key: 'scheduledIn', label: '정규근무 출근'},
  {key: 'scheduledOut', label: '정규근무 퇴근'},
  {key: 'actualIn', label: '출근 시간'},
  {key: 'actualOut', label: '퇴근 시간'},
  {key: 'leave', label: '내 연차'},
  {key: 'overtime', label: '연장 시간'},
  {key: 'correctionIn', label: '정정 출근'},
  {key: 'correctionOut', label: '정정 퇴근'},
  {key: 'correctionStatus', label: '정정 상태'},
  {key: 'note', label: '비고'},
  {key: 'status', label: '조회 상태'},
];

function joinParts(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part === null || part === undefined ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' ');
}

function durationLabel(value: {duration: string} | null | undefined): string {
  return value?.duration ?? '';
}

function workListLabel(result: Extract<AttendanceResult, {workList: unknown}>): string {
  return result.workList
    .map((row) => joinParts([row.type, row.duration, row.time ? `(${row.time})` : '']))
    .filter(Boolean)
    .join(' / ');
}

function jadeDateLabel(ymd: string): string {
  if (/^\d{8}$/.test(ymd)) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }
  return ymd;
}

export function buildJadeExportRows(results: Record<string, AttendanceResult>): CsvRow[] {
  return Object.entries(results)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, result]) => {
      if ('error' in result) {
        return {date: jadeDateLabel(date), status: '조회 실패'};
      }

      return {
        date: jadeDateLabel(date),
        workDay: result.workDay,
        workType: result.workType,
        clockIn: formatHm(result.clockIn),
        clockOut: formatHm(result.clockOut),
        vacation: result.vacation
          ? joinParts([result.vacation.type, result.vacation.duration, result.vacation.time ? `(${result.vacation.time})` : ''])
          : '',
        overtime: durationLabel(result.overtime),
        dayOffWork: durationLabel(result.dayOffWork),
        remoteWork: durationLabel(result.remoteWork),
        workList: workListLabel(result),
        status: '정상',
      };
    });
}

function weekdayLabel(date: string): string {
  const parts = date.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()] ?? '';
}

function insaLeaveLabel(day: InsaCalendarMap[string]): string {
  return day.ownLeave
    .map((leave) => joinParts([leave.type, leave.durationLabel, leave.approvalStatus, leave.reason ? `(${leave.reason})` : '']))
    .filter(Boolean)
    .join(' / ');
}

export function buildInsaExportRows(days: InsaCalendarMap): CsvRow[] {
  return Object.keys(days)
    .sort()
    .map((date) => {
      const day = days[date]!;
      const worktime = day.worktime;
      const summary = day.teamSchedule;
      const departmentLeave = summary?.vacationCount ? `연차 (${summary.vacationCount})` : '';
      const departmentTime = summary?.timeCount ? `시간차 (${summary.timeCount})` : '';
      const holiday = summary?.holidayLabel
        || (worktime && !worktime.scheduledIn && !worktime.scheduledOut ? '휴일' : '');

      return {
        date,
        weekday: weekdayLabel(date),
        holiday,
        departmentLeave,
        departmentTime,
        scheduledIn: worktime?.scheduledIn ?? '',
        scheduledOut: worktime?.scheduledOut ?? '',
        actualIn: worktime?.actualIn ?? '',
        actualOut: worktime?.actualOut ?? '',
        leave: insaLeaveLabel(day),
        overtime: worktime?.overtimeLabel ?? '',
        correctionIn: worktime?.correctionIn ?? '',
        correctionOut: worktime?.correctionOut ?? '',
        correctionStatus: worktime?.correctionStatus ?? '',
        note: worktime?.note ?? '',
        status: worktime || summary || day.ownLeave.length > 0 ? '정상' : '일자 데이터 없음',
      };
    });
}
