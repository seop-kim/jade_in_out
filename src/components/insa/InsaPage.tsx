import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  fetchInsaDayDetails,
  InsaMonthLoadResult,
  InsaMonthSource,
  loadInsaMonth,
} from '../../api/insaApi';
import {InsaTeamDetail} from '../../api/insaParsers';
import {clearInsaCookie, loadInsaCookie, saveInsaCookie} from '../../lib/insaStorage';
import {buildInsaCalendarMap} from '../../lib/transformInsa';
import MonthPicker from '../MonthPicker';
import InsaCalendar from './InsaCalendar';
import InsaSetup from './InsaSetup';
import './Insa.css';

export type DetailState =
  | {status: 'loading'}
  | {status: 'loaded'; details: InsaTeamDetail[]}
  | {status: 'error'; message: string};

const SOURCE_LABELS: Record<InsaMonthSource, string> = {
  home: '팀 일정',
  worktime: '근태',
  leave: '휴가',
};

function safeMessage(reason: unknown, cookie: string): string {
  const message = reason instanceof Error ? reason.message : String(reason || '조회 실패');
  return cookie ? message.replaceAll(cookie, '[redacted]') : message;
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

function InsaPage() {
  const [today, setToday] = useState(() => new Date());
  const [cookie, setCookie] = useState<string | null>(() => loadInsaCookie());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<InsaMonthLoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [detailStates, setDetailStates] = useState<Record<string, DetailState>>({});
  const detailStatesRef = useRef<Record<string, DetailState>>({});
  const detailControllers = useRef(new Map<string, AbortController>());

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
  }, []);

  useEffect(() => {
    if (!cookie) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setPageError(null);
    setResult(null);
    setSelectedYmd(null);

    loadInsaMonth({
      cookie,
      year: viewYear,
      month: viewMonth,
      today,
      signal: controller.signal,
    })
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .catch((error: {name?: string} | unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPageError(safeMessage(error, cookie));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cookie, reloadKey, today, viewMonth, viewYear]);

  const days = useMemo(() => buildInsaCalendarMap(
    viewYear,
    viewMonth,
    result?.home ?? null,
    result?.worktime ?? [],
    result?.leave?.records ?? []
  ), [result, viewMonth, viewYear]);

  const balance = result?.leave?.balances.find((item) => item.year === viewYear);

  const selectMonth = (year: number, month: number): void => {
    setViewYear(year);
    setViewMonth(month);
  };

  const shiftMonth = (offset: number): void => {
    const next = new Date(viewYear, viewMonth + offset, 1);
    selectMonth(next.getFullYear(), next.getMonth());
  };

  const handleSetup = (nextCookie: string): void => {
    saveInsaCookie(nextCookie);
    setCookie(nextCookie);
  };

  const handleReset = (): void => {
    invalidateDayDetails();
    clearInsaCookie();
    setCookie(null);
    setResult(null);
    setPageError(null);
  };

  const handleToday = (): void => {
    const nextToday = new Date();
    setToday(nextToday);
    selectMonth(nextToday.getFullYear(), nextToday.getMonth());
  };

  const handleRefresh = (): void => {
    invalidateDayDetails();
    setToday(new Date());
    setReloadKey((key) => key + 1);
  };

  const requestDayDetails = useCallback(async (ymd: string): Promise<void> => {
    if (!cookie) return;
    if (detailStatesRef.current[ymd]?.status === 'loaded' || detailControllers.current.has(ymd)) return;

    const controller = new AbortController();
    detailControllers.current.set(ymd, controller);
    setDetailStates((previous) => {
      const next = {...previous, [ymd]: {status: 'loading'} as DetailState};
      detailStatesRef.current = next;
      return next;
    });
    try {
      const details = await fetchInsaDayDetails({cookie, ymd, signal: controller.signal});
      if (!controller.signal.aborted) {
        setDetailStates((previous) => {
          const next = {...previous, [ymd]: {status: 'loaded', details} as DetailState};
          detailStatesRef.current = next;
          return next;
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setDetailStates((previous) => {
          const next = {
            ...previous,
            [ymd]: {status: 'error', message: safeMessage(error, cookie)} as DetailState,
          };
          detailStatesRef.current = next;
          return next;
        });
      }
    } finally {
      if (detailControllers.current.get(ymd) === controller) {
        detailControllers.current.delete(ymd);
      }
    }
  }, [cookie]);

  const handleDaySelect = useCallback((ymd: string): void => {
    setSelectedYmd(ymd);
    void requestDayDetails(ymd);
  }, [requestDayDetails]);

  if (!cookie) return <InsaSetup onSubmit={handleSetup} />;

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
          <button type="button" className="btn btn-ghost" onClick={handleToday}>
            오늘
          </button>
          <button type="button" className="btn btn-primary" onClick={handleRefresh} disabled={loading}>
            {loading ? '조회 중…' : '새로고침'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset}>연결 재설정</button>
        </div>
      </div>

      {loading && <p className="insa-page-status" role="status">월간 정보를 조회 중입니다.</p>}
      {pageError && <div className="insa-error-box" role="alert">월간 조회 실패: {pageError}</div>}
      {result?.errors.map((error) => (
        <div className="insa-error-box" role="alert" key={error.source}>
          {SOURCE_LABELS[error.source]} 조회 실패: {safeMessage(error.message, cookie)}
        </div>
      ))}

      {result?.leave && (
        <section className="insa-card insa-balance" aria-labelledby="insa-balance-title">
          <h2 id="insa-balance-title" className="insa-section-title">{viewYear}년 휴가 현황</h2>
          {balance ? (
            <div className="insa-balance-values">
              <span>발생 {balance.accruedHours}시간</span>
              <span>사용 {balance.usedHours}시간</span>
              <strong>잔여 {balance.remainingHours}시간</strong>
            </div>
          ) : (
            <p className="insa-detail-empty">해당 연도의 휴가 현황이 없습니다.</p>
          )}
        </section>
      )}

      <InsaCalendar
        year={viewYear}
        month={viewMonth}
        today={today}
        days={days}
        onSelectDay={handleDaySelect}
        onRequestDayDetails={requestDayDetails}
        detailStates={detailStates}
      />

      {selectedYmd && <TeamDetailPanel ymd={selectedYmd} state={detailStates[selectedYmd]} />}
    </div>
  );
}

export default InsaPage;
