import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Calendar from './Calendar';
import MonthPicker from './MonthPicker';
import LastFetchedLabel from './LastFetchedLabel';
import ExportMenu from './ExportMenu';
import {AttendanceResult, fetchAttendanceForMonth} from '../api/jadeApi';
import {
  AttendanceMap,
  buildDisplayRecord,
} from '../lib/transformAttendance';
import {Credentials} from '../lib/storage';
import {dateKey, ymdToKey} from '../lib/format';
import {JadeBridgeTransport} from '../lib/jadeBridge';
import {ConnectionStatus} from '../lib/connectionStatus';
import {isMonthCacheFresh} from '../lib/monthCache';
import {JADE_EXPORT_COLUMNS, buildJadeExportRows} from '../lib/exportRows';
import {CsvRow, filterRowsByDateRange} from '../lib/csvExport';

const EXPORT_MIN_DATE = '2000-01-01';
const EXPORT_MAX_DATE = '2099-12-31';

interface CalendarPageProps {
  credentials: Credentials;
  transport?: JadeBridgeTransport;
  onError?: (message: string) => void;
  onAuthenticationExpired?: () => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onLastFetchedChange?: (value: Date | null) => void;
  onExportReady?: (opener: (() => void) | null) => void;
}

interface CachedMonth {
  attendance: AttendanceMap;
  results: Record<string, AttendanceResult>;
  fetchedAt: Date;
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function buildAttendanceMap(results: Record<string, AttendanceResult>, today: Date): AttendanceMap {
  const attendance: AttendanceMap = {};
  Object.entries(results).forEach(([ymd, result]) => {
    const display = buildDisplayRecord(ymd, result, today);
    if (display) attendance[ymdToKey(ymd)] = display;
  });
  return attendance;
}

function hasAttendanceErrors(results: Record<string, AttendanceResult>): boolean {
  return Object.values(results).some((result) => 'error' in result);
}

function hasAuthenticationErrors(results: Record<string, AttendanceResult>): boolean {
  return Object.values(results).some((result) => 'authError' in result && result.authError === true);
}

function buildLoadingMap(year: number, month: number): AttendanceMap {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const out: AttendanceMap = {};
  for (let day = 1; day <= lastDay; day++) {
    out[dateKey(year, month, day)] = {kind: 'loading'};
  }
  return out;
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

function CalendarPage({
  credentials,
  transport,
  onError,
  onAuthenticationExpired,
  onConnectionStatusChange,
  onLastFetchedChange,
  onExportReady,
}: CalendarPageProps) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());

  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [attendanceResults, setAttendanceResults] = useState<Record<string, AttendanceResult>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const monthCache = useRef(new Map<string, CachedMonth>());

  useEffect(() => {
    onExportReady?.(() => setExportOpen(true));
    return () => onExportReady?.(null);
  }, [onExportReady]);

  const goPrev = (): void => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNext = (): void => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const refresh = useCallback((): void => {
    monthCache.current.delete(monthKey(viewYear, viewMonth));
    setReloadKey((k) => k + 1);
  }, [viewMonth, viewYear]);

  const handlePickerSelect = (year: number, month: number): void => {
    setViewYear(year);
    setViewMonth(month);
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const key = monthKey(viewYear, viewMonth);
    const cachedEntry = monthCache.current.get(key);
    const cached = cachedEntry && isMonthCacheFresh(cachedEntry.fetchedAt) ? cachedEntry : undefined;
    if (cachedEntry && !cached) monthCache.current.delete(key);

    setLoading(true);
    setAttendance(buildLoadingMap(viewYear, viewMonth));
    setAttendanceResults({});
    setLastFetchedAt(null);
    onLastFetchedChange?.(null);
    onConnectionStatusChange?.('checking');

    if (cached) {
      setAttendance(cached.attendance);
      setAttendanceResults(cached.results);
      setLastFetchedAt(cached.fetchedAt);
      onLastFetchedChange?.(cached.fetchedAt);
      onConnectionStatusChange?.('connected');
      setLoading(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    fetchAttendanceForMonth({
      cookie: credentials.cookie,
      parsedBody: credentials.parsedBody,
      year: viewYear,
      month: viewMonth,
      signal: controller.signal,
      onDayResult: (ymd, result) => {
        if (cancelled) return;
        setAttendanceResults((previous) => ({...previous, [ymd]: result}));
        const display = buildDisplayRecord(ymd, result, today);
        const key = ymdToKey(ymd);
        setAttendance((prev) => {
          const next = {...prev};
          if (display) {
            next[key] = display;
          } else {
            delete next[key];
          }
          return next;
        });
      },
      transport,
    })
      .then((results) => {
        if (cancelled) return;
        const nextAttendance = buildAttendanceMap(results, today);
        setAttendance(nextAttendance);
        setAttendanceResults(results);
        if (hasAuthenticationErrors(results)) {
          onConnectionStatusChange?.('error');
          onAuthenticationExpired?.();
          return;
        }
        if (hasAttendanceErrors(results)) {
          onConnectionStatusChange?.('error');
          return;
        }
        const fetchedAt = new Date();
        monthCache.current.set(key, {attendance: nextAttendance, results, fetchedAt});
        setLastFetchedAt(fetchedAt);
        onLastFetchedChange?.(fetchedAt);
        onConnectionStatusChange?.('connected');
      })
      .catch((err: {name?: string; message?: string}) => {
        if (cancelled) return;
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        onConnectionStatusChange?.('error');
        onError?.('출퇴근 기록 조회 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewYear, viewMonth, credentials, onAuthenticationExpired, onConnectionStatusChange, onError, onLastFetchedChange, reloadKey, today, transport]);

  const exportRows = useMemo(() => buildJadeExportRows(attendanceResults), [attendanceResults]);
  const exportMinDate = dateKey(viewYear, viewMonth, 1);
  const requestExportRows = useCallback(async (startDate: string, endDate: string): Promise<CsvRow[]> => {
    const results: Record<string, AttendanceResult> = {};
    for (const month of exportMonths(startDate, endDate)) {
      const monthResults = await fetchAttendanceForMonth({
        cookie: credentials.cookie,
        parsedBody: credentials.parsedBody,
        year: month.year,
        month: month.month,
        transport,
      });
      Object.assign(results, monthResults);
      if (hasAuthenticationErrors(monthResults)) {
        onAuthenticationExpired?.();
        throw new Error('Jade authentication expired');
      }
    }
    return filterRowsByDateRange(buildJadeExportRows(results), 'date', startDate, endDate);
  }, [credentials, onAuthenticationExpired, transport]);

  return (
    <div className="jade-calendar-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="btn" onClick={goPrev} aria-label="이전 달" disabled={loading}>‹</button>
          <MonthPicker
            viewYear={viewYear}
            viewMonth={viewMonth}
            today={today}
            disabled={loading}
            onSelect={handlePickerSelect}
          />
          <button className="btn" onClick={goNext} aria-label="다음 달" disabled={loading}>›</button>
        </div>
        <div className="toolbar-right">
          <LastFetchedLabel value={lastFetchedAt}/>
          <button
            type="button"
            className="btn btn-primary refresh-button"
            onClick={refresh}
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

      <Calendar
        year={viewYear}
        month={viewMonth}
        today={today}
        attendance={attendance}
      />
      <ExportMenu
        rows={exportRows}
        columns={JADE_EXPORT_COLUMNS}
        minDate={EXPORT_MIN_DATE}
        maxDate={EXPORT_MAX_DATE}
        initialDate={exportMinDate}
        fileName="jade-근태-기간.csv"
        disabled={loading}
        hideTrigger
        open={exportOpen}
        onOpenChange={setExportOpen}
        onRangeDataRequest={requestExportRows}
      />
    </div>
  );
}

export default CalendarPage;
