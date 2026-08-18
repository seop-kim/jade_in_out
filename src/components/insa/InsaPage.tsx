import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  fetchInsaDayDetails,
  isInsaAuthenticationError,
  InsaMonthLoadResult,
  InsaMonthSource,
  loadInsaMonth,
} from '../../api/insaApi';
import {InsaTeamDetail} from '../../api/insaParsers';
import {
  INSA_BRIDGE_ORIGIN,
  InsaBridgeClient,
  createInsaBookmarklet,
} from '../../lib/insaBridge';
import {clearInsaCookie, loadInsaCookie, saveInsaCookie} from '../../lib/insaStorage';
import {buildInsaCalendarMap, InsaCalendarMap} from '../../lib/transformInsa';
import {ConnectionStatus} from '../../lib/connectionStatus';
import {isMonthCacheFresh} from '../../lib/monthCache';
import {CsvRow, filterRowsByDateRange} from '../../lib/csvExport';
import MonthPicker from '../MonthPicker';
import LastFetchedLabel from '../LastFetchedLabel';
import ExportMenu from '../ExportMenu';
import InsaCalendar from './InsaCalendar';
import InsaSetup from './InsaSetup';
import './Insa.css';
import {INSA_EXPORT_COLUMNS, buildInsaExportRows} from '../../lib/exportRows';

const EXPORT_MIN_DATE = '2000-01-01';
const EXPORT_MAX_DATE = '2099-12-31';

export type DetailState =
  | {status: 'loading'}
  | {status: 'loaded'; details: InsaTeamDetail[]}
  | {status: 'error'; message: string};

export interface InsaApiRequest {
  key: string;
  message: string;
}

const SOURCE_LABELS: Record<InsaMonthSource, string> = {
  home: '팀 일정',
  worktime: '근태',
  leave: '휴가',
};

function safeMessage(reason: unknown, cookie: string): string {
  const message = reason instanceof Error ? reason.message : String(reason || '조회 실패');
  return cookie ? message.split(cookie).join('[redacted]') : message;
}

function ymdLabel(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function TeamDetailPanel({ymd, state}: {ymd: string; state?: DetailState}) {
  return (
    <section className="insa-card insa-detail-panel" aria-labelledby="insa-detail-title">
      <h2 id="insa-detail-title" className="insa-section-title">{ymdLabel(ymd)} 팀 일정</h2>
      {!state || state.status === 'loading' ? (
        <p className="insa-detail-status" role="status">팀 상세 조회 중…</p>
      ) : state.status === 'error' ? (
        <p className="insa-error-text" role="alert">팀 상세 조회 실패: {state.message}</p>
      ) : state.details.length === 0 ? (
        <p className="insa-detail-empty">등록된 팀 일정이 없습니다.</p>
      ) : (
        <ul className="insa-detail-list">
          {state.details.map((detail, index) => (
            <li className="insa-detail-item" key={`${detail.name}-${detail.scheduleLabel}-${index}`}>
              <strong>{detail.name}</strong>
              <span>{detail.scheduleLabel}{detail.durationLabel ? ` · ${detail.durationLabel}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface InsaPageProps {
  resetRequest?: number;
  onConnectionChange?: (connected: boolean) => void;
  onAuthenticationExpired?: () => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onLastFetchedChange?: (value: Date | null) => void;
  onApiRequestChange?: (request: InsaApiRequest, active: boolean) => void;
  onError?: (message: string) => void;
  onExportReady?: (opener: (() => void) | null) => void;
}

interface CachedMonth {
  result: InsaMonthLoadResult;
  fetchedAt: Date;
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function exportMonths(startDate: string, endDate: string): Array<{year: number; month: number}> {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const months: Array<{year: number; month: number}> = [];
  while (cursor <= end) {
    months.push({year: cursor.getFullYear(), month: cursor.getMonth()});
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

const INSA_POPUP_URL = `${INSA_BRIDGE_ORIGIN}/`;

function InsaPage({
  resetRequest = 0,
  onConnectionChange,
  onAuthenticationExpired,
  onConnectionStatusChange,
  onLastFetchedChange,
  onApiRequestChange,
  onError,
  onExportReady,
}: InsaPageProps) {
  const [today, setToday] = useState(() => new Date());
  const [cookie, setCookie] = useState<string | null>(() => loadInsaCookie());
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'waiting'>('idle');
  const [bridgeWindow, setBridgeWindow] = useState<Window | null>(null);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<InsaMonthLoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [detailStates, setDetailStates] = useState<Record<string, DetailState>>({});
  const detailStatesRef = useRef<Record<string, DetailState>>({});
  const detailControllers = useRef(new Map<string, AbortController>());
  const bridgeClientRef = useRef<InsaBridgeClient | null>(null);
  const monthCache = useRef(new Map<string, CachedMonth>());

  useEffect(() => {
    if (!cookie && !bridgeReady) {
      onExportReady?.(null);
      return undefined;
    }

    onExportReady?.(() => setExportOpen(true));
    return () => onExportReady?.(null);
  }, [bridgeReady, cookie, onExportReady]);

  const disposeBridge = useCallback((closePopup = false): void => {
    bridgeClientRef.current?.dispose();
    bridgeClientRef.current = null;
    if (closePopup && bridgeWindow && !bridgeWindow.closed) bridgeWindow.close();
    setBridgeWindow(null);
    setBridgeReady(false);
    setBridgeStatus('idle');
  }, [bridgeWindow]);

  const handleOpenAutomatic = useCallback((): void => {
    monthCache.current.clear();
    const insaWindow = window.open(INSA_POPUP_URL, 'insa-system-window');
    if (!insaWindow) {
      onError?.('인사시스템 창을 열지 못했습니다');
      return;
    }
    bridgeClientRef.current?.dispose();
    setBridgeWindow(insaWindow);
    setBridgeReady(false);
    setBridgeStatus('waiting');
    onConnectionStatusChange?.('checking');
    bridgeClientRef.current = new InsaBridgeClient(insaWindow, window.location.origin, () => {
      setBridgeReady(true);
      setBridgeStatus('idle');
    });
  }, [onConnectionStatusChange, onError]);

  const requestHtmlViaBridge = useCallback((path: string, init: RequestInit, signal?: AbortSignal): Promise<string> => {
    const client = bridgeClientRef.current;
    if (!client) return Promise.reject(new Error('인사시스템 연결이 준비되지 않았습니다.'));
    return client.request(path, init, signal);
  }, []);

  const invalidateDayDetails = useCallback((): void => {
    detailControllers.current.forEach((controller) => controller.abort());
    detailControllers.current.clear();
    detailStatesRef.current = {};
    setDetailStates({});
    setSelectedYmd(null);
  }, []);

  useEffect(() => () => {
    detailControllers.current.forEach((controller) => controller.abort());
    detailControllers.current.clear();
    bridgeClientRef.current?.dispose();
  }, []);

  useEffect(() => {
    onConnectionChange?.(Boolean(cookie || bridgeReady));
    if (!cookie && !bridgeReady) onConnectionStatusChange?.('not-configured');
  }, [bridgeReady, cookie, onConnectionChange, onConnectionStatusChange]);

  useEffect(() => {
    if (!bridgeWindow || cookie) return undefined;
    const timer = window.setInterval(() => {
      if (!bridgeWindow.closed) return;
      bridgeClientRef.current?.dispose();
      bridgeClientRef.current = null;
      setBridgeWindow(null);
      setBridgeReady(false);
      setBridgeStatus('idle');
    }, 500);
    return () => window.clearInterval(timer);
  }, [bridgeWindow, cookie]);

  const handleMonthlyRequestChange = useCallback((source: InsaMonthSource, active: boolean): void => {
    const isWorktime = source === 'worktime';
    onApiRequestChange?.({
      key: isWorktime ? 'worktime' : 'leave',
      message: isWorktime
        ? '출퇴근 정보를 불러오는 중 입니다.'
        : '연차 정보를 불러오는 중 입니다.',
    }, active);
  }, [onApiRequestChange]);

  useEffect(() => {
    if (!cookie && !bridgeReady) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    const key = monthKey(viewYear, viewMonth);
    const cachedEntry = monthCache.current.get(key);
    const cached = cachedEntry && isMonthCacheFresh(cachedEntry.fetchedAt) ? cachedEntry : undefined;
    if (cachedEntry && !cached) monthCache.current.delete(key);

    setLoading(true);
    setResult(null);
    setSelectedYmd(null);
    setLastFetchedAt(null);
    onLastFetchedChange?.(null);
    onConnectionStatusChange?.('checking');

    if (cached) {
      setResult(cached.result);
      setLastFetchedAt(cached.fetchedAt);
      onLastFetchedChange?.(cached.fetchedAt);
      onConnectionStatusChange?.('connected');
      setLoading(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    loadInsaMonth({
      cookie: cookie ?? undefined,
      requestHtml: cookie ? undefined : requestHtmlViaBridge,
      year: viewYear,
      month: viewMonth,
      today,
      signal: controller.signal,
      onRequestStart: (source) => handleMonthlyRequestChange(source, true),
      onRequestEnd: (source) => handleMonthlyRequestChange(source, false),
    })
      .then((nextResult) => {
        if (!cancelled) {
          if (nextResult.errors.some((error) => error.authError)) {
            onConnectionStatusChange?.('error');
            onAuthenticationExpired?.();
            return;
          }
          setResult(nextResult);
          if (nextResult.errors.length === 0) {
            const fetchedAt = new Date();
            monthCache.current.set(key, {result: nextResult, fetchedAt});
            setLastFetchedAt(fetchedAt);
            onLastFetchedChange?.(fetchedAt);
            onConnectionStatusChange?.('connected');
          } else {
            onConnectionStatusChange?.('error');
          }
          nextResult.errors.forEach((error) => {
            onError?.(`${SOURCE_LABELS[error.source]} 조회 실패`);
          });
        }
      })
      .catch((error: {name?: string} | unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (isInsaAuthenticationError(error)) {
          onConnectionStatusChange?.('error');
          onAuthenticationExpired?.();
          return;
        }
        onConnectionStatusChange?.('error');
        onError?.('월간 조회 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bridgeReady, cookie, handleMonthlyRequestChange, onAuthenticationExpired, onConnectionStatusChange, onError, onLastFetchedChange, reloadKey, requestHtmlViaBridge, today, viewMonth, viewYear]);

  const days = useMemo(() => buildInsaCalendarMap(
    viewYear,
    viewMonth,
    result?.home ?? null,
    result?.worktime ?? [],
    result?.leave?.records ?? []
  ), [result, viewMonth, viewYear]);
  const exportRows = useMemo(() => buildInsaExportRows(days), [days]);
  const exportMinDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const requestExportRows = useCallback(async (startDate: string, endDate: string, signal?: AbortSignal): Promise<CsvRow[]> => {
    const exportDays: InsaCalendarMap = {};
    for (const month of exportMonths(startDate, endDate)) {
      const monthResult = await loadInsaMonth({
        cookie: cookie ?? undefined,
        requestHtml: cookie ? undefined : requestHtmlViaBridge,
        year: month.year,
        month: month.month,
        today,
        signal,
      });
      if (monthResult.errors.some((error) => error.authError)) {
        onAuthenticationExpired?.();
        throw new Error('INSA authentication expired');
      }
      if (monthResult.errors.length > 0) throw new Error('INSA export request failed');
      Object.assign(exportDays, buildInsaCalendarMap(
        month.year,
        month.month,
        monthResult.home,
        monthResult.worktime ?? [],
        monthResult.leave?.records ?? [],
      ));
    }
    return filterRowsByDateRange(buildInsaExportRows(exportDays), 'date', startDate, endDate);
  }, [cookie, onAuthenticationExpired, requestHtmlViaBridge, today]);

  const selectMonth = (year: number, month: number): void => {
    setViewYear(year);
    setViewMonth(month);
  };

  const shiftMonth = (offset: number): void => {
    const next = new Date(viewYear, viewMonth + offset, 1);
    selectMonth(next.getFullYear(), next.getMonth());
  };

  const handleSetup = (nextCookie: string): void => {
    disposeBridge(true);
    monthCache.current.clear();
    saveInsaCookie(nextCookie);
    setCookie(nextCookie);
    setLastFetchedAt(null);
    onLastFetchedChange?.(null);
  };

  const handleReset = useCallback((): void => {
    invalidateDayDetails();
    disposeBridge(true);
    monthCache.current.clear();
    clearInsaCookie();
    setCookie(null);
    setResult(null);
    setLoading(false);
    setLastFetchedAt(null);
    onLastFetchedChange?.(null);
    onConnectionStatusChange?.('not-configured');
    setExportOpen(false);
  }, [disposeBridge, invalidateDayDetails, onConnectionStatusChange, onLastFetchedChange]);

  useEffect(() => {
    if (resetRequest > 0) handleReset();
  }, [handleReset, resetRequest]);

  const handleRefresh = (): void => {
    invalidateDayDetails();
    setToday(new Date());
    monthCache.current.delete(monthKey(viewYear, viewMonth));
    setReloadKey((key) => key + 1);
  };

  const requestDayDetails = useCallback(async (ymd: string): Promise<void> => {
    if (!cookie && !bridgeReady) return;
    if (detailStatesRef.current[ymd]?.status === 'loaded' || detailControllers.current.has(ymd)) return;

    const controller = new AbortController();
    detailControllers.current.set(ymd, controller);
    const departmentLeaveCount = (days[ymd]?.teamSchedule?.vacationCount ?? 0)
      + (days[ymd]?.teamSchedule?.timeCount ?? 0);
    const request: InsaApiRequest = {
      key: 'department-leave',
      message: `부서 연차 정보를 불러오는 중 입니다. (${departmentLeaveCount}건)`,
    };
    onApiRequestChange?.(request, true);
    setDetailStates((previous) => {
      const next = {...previous, [ymd]: {status: 'loading'} as DetailState};
      detailStatesRef.current = next;
      return next;
    });
    try {
      const details = await fetchInsaDayDetails({
        cookie: cookie ?? undefined,
        requestHtml: cookie ? undefined : requestHtmlViaBridge,
        ymd,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setDetailStates((previous) => {
          const next = {...previous, [ymd]: {status: 'loaded', details} as DetailState};
          detailStatesRef.current = next;
          return next;
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (isInsaAuthenticationError(error)) {
          onAuthenticationExpired?.();
          return;
        }
        setDetailStates((previous) => {
          const next = {
            ...previous,
            [ymd]: {status: 'error', message: safeMessage(error, cookie ?? '')} as DetailState,
          };
          detailStatesRef.current = next;
          return next;
        });
        onError?.('팀 상세 조회 실패');
      }
    } finally {
      if (detailControllers.current.get(ymd) === controller) {
        detailControllers.current.delete(ymd);
      }
      onApiRequestChange?.(request, false);
    }
  }, [bridgeReady, cookie, days, onApiRequestChange, onAuthenticationExpired, onError, requestHtmlViaBridge]);

  const handleDaySelect = useCallback((ymd: string): void => {
    setSelectedYmd(ymd);
    void requestDayDetails(ymd);
  }, [requestDayDetails]);

  if (!cookie && !bridgeReady) {
    return (
      <InsaSetup
        onSubmit={handleSetup}
        onOpenAutomatic={handleOpenAutomatic}
        bridgeStatus={bridgeStatus}
        bookmarkletHref={createInsaBookmarklet(window.location.origin)}
      />
    );
  }

  return (
    <div className="insa-page">
      <div className="toolbar insa-toolbar">
        <div className="toolbar-left">
          <button type="button" className="btn" aria-label="이전 달" onClick={() => shiftMonth(-1)}>‹</button>
          <MonthPicker
            viewYear={viewYear}
            viewMonth={viewMonth}
            today={today}
            onSelect={selectMonth}
          />
          <button type="button" className="btn" aria-label="다음 달" onClick={() => shiftMonth(1)}>›</button>
        </div>
        <div className="toolbar-right">
          <LastFetchedLabel value={lastFetchedAt}/>
          <button
            type="button"
            className="btn btn-primary refresh-button"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="새로고침"
            title="새로고침"
          >
            <svg className="refresh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M20 11a8 8 0 0 0-14.7-4L4 9m0 0V5m0 4h4M4 13a8 8 0 0 0 14.7 4L20 15m0 0v4m0-4h-4" />
            </svg>
          </button>
        </div>
      </div>

      <InsaCalendar
        year={viewYear}
        month={viewMonth}
        today={today}
        days={days}
        onSelectDay={handleDaySelect}
        onRequestDayDetails={requestDayDetails}
        detailStates={detailStates}
        loading={loading}
      />

      {selectedYmd && <TeamDetailPanel ymd={selectedYmd} state={detailStates[selectedYmd]} />}
      <ExportMenu
        rows={exportRows}
        columns={INSA_EXPORT_COLUMNS}
        minDate={EXPORT_MIN_DATE}
        maxDate={EXPORT_MAX_DATE}
        initialDate={exportMinDate}
        fileName="신규인사시스템"
        disabled={loading || result === null}
        hideTrigger
        open={exportOpen}
        onOpenChange={setExportOpen}
        onRangeDataRequest={requestExportRows}
      />
    </div>
  );
}

export default InsaPage;
