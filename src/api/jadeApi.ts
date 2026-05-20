import axios from 'axios';
import {toYmd} from '../lib/format';

const ENDPOINT = '/api/jade/commonAction.do';

const client = axios.create({
  timeout: 15000,
  responseType: 'text',
  transformResponse: (data) => data,
});

export interface VacationInfo {
  type: string;
  duration: string;
  time: string;
  hours: number;
  isFullDay: boolean;
}

export interface DurationInfo {
  duration: string;
  hours: number;
}

export interface LocalAttendance {
  in: string;
  out: string;
}

export interface RawEtc {
  I_IN_HM?: string;
  I_OUT_HM?: string;
  C_IN_HM?: string;
  C_OUT_HM?: string;
  WORK_DAY?: string;
  WORK_TYPE_NM?: string;
  WORK_DETAIL?: string;
  __message?: string;
  [key: string]: string | undefined;
}

export interface AttendanceRecord {
  ymd: string;
  workDay: string;
  workType: string;
  vacation: VacationInfo | null;
  overtime: DurationInfo | null;
  dayOffWork: DurationInfo | null;
  remoteWork: DurationInfo | null;
  clockIn: string;
  clockInChanged: boolean;
  clockInLocal: boolean;
  clockOut: string;
  clockOutChanged: boolean;
  clockOutLocal: boolean;
  raw: RawEtc;
  error?: undefined;
}

export interface AttendanceError {
  ymd: string;
  error: string;
}

export type AttendanceResult = AttendanceRecord | AttendanceError;

interface WorkListRow {
  type: string;
  duration: string;
  time: string;
}

const LEAVE_TYPE_KEYWORDS = ['휴가', '병가', '공가'] as const;

function isLeaveType(type: string): boolean {
  return LEAVE_TYPE_KEYWORDS.some((keyword) => type.includes(keyword));
}

function buildFormBody(parsedBody: Record<string, string>, ymd: string): URLSearchParams {
  const params = new URLSearchParams();
  let stdYmdSet = false;
  for (const [key, value] of Object.entries(parsedBody)) {
    if (key === 'S_STD_YMD') {
      params.append(key, ymd);
      stdYmdSet = true;
    } else {
      params.append(key, value ?? '');
    }
  }
  if (!stdYmdSet) params.append('S_STD_YMD', ymd);
  return params;
}

function durationToHours(s: string): number {
  if (!s) return 0;
  const dMatch = s.match(/^(\d+(?:\.\d+)?)d$/);
  if (dMatch && dMatch[1]) return parseFloat(dMatch[1]) * 8;
  const hMatch = s.match(/^(\d+(?:\.\d+)?)\s*시간$/);
  if (hMatch && hMatch[1]) return parseFloat(hMatch[1]);
  return 0;
}

function parseWorkListRows(html: string): WorkListRow[] {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const trs = doc.querySelectorAll('.workList tr');
    const rows: WorkListRow[] = [];
    trs.forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) return;
      const type = (cells[0]?.textContent ?? '').trim();
      const duration = cells[1] ? (cells[1].textContent ?? '').trim() : '';
      const time = cells[2]
        ? (cells[2].textContent ?? '').trim().replace(/^\(\s*|\s*\)$/g, '')
        : '';
      rows.push({type, duration, time});
    });
    return rows;
  } catch {
    return [];
  }
}

function findDurationRow(rows: WorkListRow[], match: (type: string) => boolean): DurationInfo | null {
  const row = rows.find((r) => match(r.type));
  if (!row) return null;
  const hours = durationToHours(row.duration);
  if (hours <= 0) return null;
  return {duration: row.duration, hours};
}

function vacationFromRows(rows: WorkListRow[]): VacationInfo | null {
  const row = rows.find((r) => isLeaveType(r.type));
  if (!row) return null;
  const hours = durationToHours(row.duration);
  return {
    type: row.type,
    duration: row.duration,
    time: row.time,
    hours,
    isFullDay: hours >= 8,
  };
}

function overtimeFromRows(rows: WorkListRow[]): DurationInfo | null {
  return findDurationRow(rows, (t) => t === '연장');
}

function dayOffWorkFromRows(rows: WorkListRow[]): DurationInfo | null {
  return findDurationRow(rows, (t) => t === '휴무일');
}

function remoteWorkFromRows(rows: WorkListRow[]): DurationInfo | null {
  const row = rows.find((r) => r.type === '재택근무');
  if (!row) return null;
  const hours = durationToHours(row.duration);
  return {duration: row.duration, hours};
}

function localAttendanceFromRows(rows: WorkListRow[]): LocalAttendance | null {
  const result: LocalAttendance = {in: '', out: ''};
  for (const row of rows) {
    if (row.type !== '현지출근신청' && row.type !== '현지퇴근신청') continue;
    const [start, end] = row.time.split('~').map((s) => (s || '').trim());
    if (row.type === '현지출근신청') {
      result.in = start || '';
    } else {
      result.out = end || start || '';
    }
  }
  if (!result.in && !result.out) return null;
  return result;
}

function parseAttendanceXml(xmlText: string): RawEtc {
  let text = typeof xmlText === 'string' ? xmlText : String(xmlText ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trim();
  if (!text) {
    throw new Error('빈 응답');
  }
  text = text.replace(/^<\?xml[\s\S]*?\?>/, (m) => m.replace(/\s+/g, ' '));

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML 파싱 실패: ' + (parserError.textContent ?? '').slice(0, 200));
  }

  const result: RawEtc = {};
  doc.querySelectorAll('ETC').forEach((node) => {
    const key = node.getAttribute('KEY');
    if (!key) return;
    result[key] = (node.textContent ?? '').trim();
  });

  const message = doc.querySelector('MESSAGE');
  const messageText = message ? (message.textContent ?? '').trim() : '';

  if (Object.keys(result).length === 0) {
    if (messageText === 'LOGIN_CHECK_FAIL:LOGOUT') {
      throw new Error('로그인 정보 만료');
    }
    throw new Error('오류');
  }

  if (messageText) result.__message = messageText;
  return result;
}

export interface FetchDateOptions {
  cookie: string;
  parsedBody: Record<string, string>;
  ymd: string;
  signal?: AbortSignal;
}

export async function fetchAttendanceForDate({
  cookie,
  parsedBody,
  ymd,
  signal,
}: FetchDateOptions): Promise<RawEtc> {
  const body = buildFormBody(parsedBody, ymd);
  const res = await client.post(ENDPOINT, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Jade-Cookie': cookie,
    },
    signal,
  });
  return parseAttendanceXml(res.data);
}

function buildRecord(ymd: string, etc: RawEtc): AttendanceRecord {
  const rows = parseWorkListRows(etc.WORK_DETAIL ?? '');

  let clockIn = etc.I_IN_HM ?? '';
  let clockInChanged = false;
  if (!clockIn && etc.C_IN_HM) {
    clockIn = etc.C_IN_HM;
    clockInChanged = true;
  }

  let clockOut = etc.I_OUT_HM ?? '';
  let clockOutChanged = false;
  if (!clockOut && etc.C_OUT_HM) {
    clockOut = etc.C_OUT_HM;
    clockOutChanged = true;
  }

  const localAttendance = localAttendanceFromRows(rows);
  let clockInLocal = false;
  if (localAttendance?.in) {
    if (!clockIn) clockIn = localAttendance.in;
    clockInChanged = false;
    clockInLocal = true;
  }
  let clockOutLocal = false;
  if (localAttendance?.out) {
    if (!clockOut) clockOut = localAttendance.out;
    clockOutChanged = false;
    clockOutLocal = true;
  }

  return {
    ymd,
    workDay: etc.WORK_DAY ?? '',
    workType: etc.WORK_TYPE_NM ?? '',
    vacation: vacationFromRows(rows),
    overtime: overtimeFromRows(rows),
    dayOffWork: dayOffWorkFromRows(rows),
    remoteWork: remoteWorkFromRows(rows),
    clockIn,
    clockInChanged,
    clockInLocal,
    clockOut,
    clockOutChanged,
    clockOutLocal,
    raw: etc,
  };
}

export interface ProgressInfo {
  completed: number;
  total: number;
}

export interface FetchMonthOptions {
  cookie: string;
  parsedBody: Record<string, string>;
  year: number;
  month: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (info: ProgressInfo) => void;
  onDayResult?: (ymd: string, result: AttendanceResult) => void;
}

export async function fetchAttendanceForMonth({
  cookie,
  parsedBody,
  year,
  month,
  concurrency = 4,
  signal,
  onProgress,
  onDayResult,
}: FetchMonthOptions): Promise<Record<string, AttendanceResult>> {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const queue: number[] = [];
  for (let day = 1; day <= lastDay; day++) queue.push(day);

  const result: Record<string, AttendanceResult> = {};
  let completed = 0;
  const total = lastDay;

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      if (signal?.aborted) return;
      const day = queue.shift();
      if (day === undefined) return;
      const ymd = toYmd(year, month, day);
      let dayResult: AttendanceResult;
      try {
        const etc = await fetchAttendanceForDate({cookie, parsedBody, ymd, signal});
        dayResult = buildRecord(ymd, etc);
      } catch (err) {
        const error = err as {name?: string; message?: string; response?: {status?: number}};
        if (error.name === 'CanceledError' || error.name === 'AbortError') return;
        const message = error.response?.status
          ? `HTTP ${error.response.status}`
          : error.message ?? String(err);
        console.error('[jade] fetch failed', ymd, message, err);
        dayResult = {ymd, error: message};
      }
      result[ymd] = dayResult;
      onDayResult?.(ymd, dayResult);
      completed += 1;
      onProgress?.({completed, total});
    }
  };

  await Promise.all(
    Array.from({length: Math.min(concurrency, queue.length)}, () => worker())
  );

  return result;
}
