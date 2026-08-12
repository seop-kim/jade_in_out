import {
  InsaHomeMonthData,
  InsaLeavePageData,
  InsaTeamDetail,
  InsaWorktimeRecord,
  parseInsaDayDetails,
  parseInsaHomeHtml,
  parseInsaLeaveHtml,
  parseInsaWorktimeHtml,
} from './insaParsers';

export interface InsaWorktimeRange {
  start: string;
  end: string;
}

export interface InsaRequestOptions {
  cookie: string;
  signal?: AbortSignal;
}

export interface FetchInsaHomeMonthOptions extends InsaRequestOptions {
  year: number;
  month: number;
}

export interface FetchInsaDayDetailsOptions extends InsaRequestOptions {
  ymd: string;
}

export interface LoadInsaMonthOptions extends FetchInsaHomeMonthOptions {
  today: Date;
}

export type InsaMonthSource = 'home' | 'worktime' | 'leave';

export interface InsaMonthLoadError {
  source: InsaMonthSource;
  message: string;
}

export interface InsaMonthLoadResult {
  home: InsaHomeMonthData | null;
  worktime: InsaWorktimeRecord[] | null;
  leave: InsaLeavePageData | null;
  errors: InsaMonthLoadError[];
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

export function getWorktimeRange(year: number, month: number, today: Date): InsaWorktimeRange | null {
  const requestedMonth = monthStart(year, month);
  const currentMonth = monthStart(today.getFullYear(), today.getMonth());

  if (requestedMonth > currentMonth) return null;

  const end = requestedMonth.getTime() === currentMonth.getTime()
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    : new Date(year, month + 1, 0);

  return end < requestedMonth ? null : {start: formatDate(requestedMonth), end: formatDate(end)};
}

async function requestHtml(
  path: string,
  cookie: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`/api/insa${path}`, {
    ...init,
    credentials: 'omit',
    signal,
    headers: {...init.headers, 'X-Insa-Cookie': cookie},
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new TextDecoder('euc-kr').decode(await response.arrayBuffer());
}

export async function fetchInsaHomeMonth(options: FetchInsaHomeMonthOptions): Promise<InsaHomeMonthData> {
  const insaMonth = options.month + 1;
  const html = await requestHtml(
    `/main.asp?Sel_Year=${options.year}&Sel_Month=${insaMonth}&Sel_Day=1`,
    options.cookie,
    {method: 'GET'},
    options.signal
  );
  return parseInsaHomeHtml(html, options.year, insaMonth);
}

export async function fetchInsaDayDetails(options: FetchInsaDayDetailsOptions): Promise<InsaTeamDetail[]> {
  const [year, month, day] = options.ymd.split('-');
  const html = await requestHtml(
    `/main.asp?Sel_Year=${year}&Sel_Month=${Number(month)}&Sel_Day=${Number(day)}`,
    options.cookie,
    {method: 'GET'},
    options.signal
  );
  return parseInsaDayDetails(html, options.ymd);
}

export async function fetchInsaWorktime(
  cookie: string,
  range: InsaWorktimeRange,
  signal?: AbortSignal
): Promise<InsaWorktimeRecord[]> {
  const html = await requestHtml(
    '/worktime/01_list.asp',
    cookie,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `sType=0&sdt=${range.start}&edt=${range.end}`,
    },
    signal
  );
  return parseInsaWorktimeHtml(html);
}

export async function fetchInsaLeave(cookie: string, signal?: AbortSignal): Promise<InsaLeavePageData> {
  const html = await requestHtml('/leave/01_list.asp', cookie, {method: 'GET'}, signal);
  return parseInsaLeaveHtml(html);
}

function errorMessage(reason: unknown, cookie: string): string {
  const message = reason instanceof Error ? reason.message : 'Request failed';
  return cookie ? message.replaceAll(cookie, '[redacted]') : message;
}

function sourceResult<T>(
  source: InsaMonthSource,
  result: PromiseSettledResult<T>,
  cookie: string,
  errors: InsaMonthLoadError[]
): T | null {
  if (result.status === 'fulfilled') return result.value;
  errors.push({source, message: errorMessage(result.reason, cookie)});
  return null;
}

export async function loadInsaMonth(options: LoadInsaMonthOptions): Promise<InsaMonthLoadResult> {
  const worktimeRange = getWorktimeRange(options.year, options.month, options.today);
  const [homeResult, worktimeResult, leaveResult] = await Promise.allSettled([
    fetchInsaHomeMonth(options),
    worktimeRange ? fetchInsaWorktime(options.cookie, worktimeRange, options.signal) : Promise.resolve([]),
    fetchInsaLeave(options.cookie, options.signal),
  ]);
  const errors: InsaMonthLoadError[] = [];

  return {
    home: sourceResult('home', homeResult, options.cookie, errors),
    worktime: sourceResult('worktime', worktimeResult, options.cookie, errors),
    leave: sourceResult('leave', leaveResult, options.cookie, errors),
    errors,
  };
}
