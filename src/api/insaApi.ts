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
import {appConfig} from '../config';

export interface InsaWorktimeRange {
  start: string;
  end: string;
}

export interface InsaRequestOptions {
  cookie?: string;
  signal?: AbortSignal;
  requestHtml?: (path: string, init: RequestInit, signal?: AbortSignal) => Promise<string>;
}

export interface FetchInsaHomeMonthOptions extends InsaRequestOptions {
  year: number;
  month: number;
}

export interface FetchInsaDayDetailsOptions extends InsaRequestOptions {
  ymd: string;
}

export interface FetchInsaWorktimeOptions extends InsaRequestOptions {
  range: InsaWorktimeRange;
}

export type InsaMonthSource = 'home' | 'worktime' | 'leave';

export interface LoadInsaMonthOptions extends FetchInsaHomeMonthOptions {
  today: Date;
  onRequestStart?: (source: InsaMonthSource) => void;
  onRequestEnd?: (source: InsaMonthSource) => void;
}

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
  options: InsaRequestOptions,
  init: RequestInit,
  signal = options.signal
): Promise<string> {
  if (options.requestHtml) return options.requestHtml(path, init, signal);
  if (!options.cookie) throw new Error('INSA authentication is not configured');
  const response = await fetch(`${appConfig.insa.apiBasePath}${path}`, {
    ...init,
    credentials: 'omit',
    cache: 'no-store',
    signal,
    headers: {...init.headers, 'X-Insa-Cookie': options.cookie},
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new TextDecoder('euc-kr').decode(await response.arrayBuffer());
}

export async function fetchInsaHomeMonth(options: FetchInsaHomeMonthOptions): Promise<InsaHomeMonthData> {
  const insaMonth = options.month + 1;
  const html = await requestHtml(
    `${appConfig.insa.paths.home}?${appConfig.insa.query.year}=${options.year}&${appConfig.insa.query.month}=${insaMonth}&${appConfig.insa.query.day}=1`,
    options,
    {method: 'GET'},
    options.signal
  );
  return parseInsaHomeHtml(html, options.year, insaMonth);
}

export async function fetchInsaDayDetails(options: FetchInsaDayDetailsOptions): Promise<InsaTeamDetail[]> {
  const [year, month, day] = options.ymd.split('-');
  const html = await requestHtml(
    `${appConfig.insa.paths.home}?${appConfig.insa.query.year}=${year}&${appConfig.insa.query.month}=${Number(month)}&${appConfig.insa.query.day}=${Number(day)}`,
    options,
    {method: 'GET'},
    options.signal
  );
  return parseInsaDayDetails(html, options.ymd);
}

export async function fetchInsaWorktime(options: FetchInsaWorktimeOptions): Promise<InsaWorktimeRecord[]> {
  const html = await requestHtml(
    appConfig.insa.paths.worktime,
    options,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `${appConfig.insa.worktimeForm.typeField}=${appConfig.insa.worktimeForm.typeValue}&${appConfig.insa.worktimeForm.startField}=${options.range.start}&${appConfig.insa.worktimeForm.endField}=${options.range.end}`,
    }
  );
  return parseInsaWorktimeHtml(html);
}

export async function fetchInsaLeave(options: InsaRequestOptions): Promise<InsaLeavePageData> {
  const html = await requestHtml(appConfig.insa.paths.leave, options, {method: 'GET'});
  return parseInsaLeaveHtml(html);
}

function errorMessage(reason: unknown, cookie?: string): string {
  const message = reason instanceof Error ? reason.message : 'Request failed';
  return cookie ? message.replaceAll(cookie, '[redacted]') : message;
}

function sourceResult<T>(
  source: InsaMonthSource,
  result: PromiseSettledResult<T>,
  cookie: string | undefined,
  errors: InsaMonthLoadError[]
): T | null {
  if (result.status === 'fulfilled') return result.value;
  errors.push({source, message: errorMessage(result.reason, cookie)});
  return null;
}

function trackMonthlyRequest<T>(
  source: InsaMonthSource,
  request: Promise<T>,
  options: LoadInsaMonthOptions
): Promise<T> {
  options.onRequestStart?.(source);
  return request.finally(() => options.onRequestEnd?.(source));
}

export async function loadInsaMonth(options: LoadInsaMonthOptions): Promise<InsaMonthLoadResult> {
  const worktimeRange = getWorktimeRange(options.year, options.month, options.today);
  const homeRequest = trackMonthlyRequest('home', fetchInsaHomeMonth(options), options);
  const worktimeRequest = worktimeRange
    ? trackMonthlyRequest('worktime', fetchInsaWorktime({
      cookie: options.cookie,
      range: worktimeRange,
      signal: options.signal,
      requestHtml: options.requestHtml,
    }), options)
    : Promise.resolve([]);
  const leaveRequest = trackMonthlyRequest('leave', fetchInsaLeave({
    cookie: options.cookie,
    signal: options.signal,
    requestHtml: options.requestHtml,
  }), options);
  const [homeResult, worktimeResult, leaveResult] = await Promise.allSettled([
    homeRequest,
    worktimeRequest,
    leaveRequest,
  ]);
  const errors: InsaMonthLoadError[] = [];

  return {
    home: sourceResult('home', homeResult, options.cookie, errors),
    worktime: sourceResult('worktime', worktimeResult, options.cookie, errors),
    leave: sourceResult('leave', leaveResult, options.cookie, errors),
    errors,
  };
}
