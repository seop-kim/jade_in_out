import {useCallback, useEffect, useMemo, useState} from 'react';
import Calendar from './Calendar';
import MonthPicker from './MonthPicker';
import {fetchAttendanceForMonth, ProgressInfo} from '../api/jadeApi';
import {AttendanceMap, buildAttendanceMap} from '../lib/transformAttendance';
import {Credentials} from '../lib/storage';

interface CalendarPageProps {
  credentials: Credentials;
}

function CalendarPage({credentials}: CalendarPageProps) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());

  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressInfo>({completed: 0, total: 0});
  const [reloadKey, setReloadKey] = useState<number>(0);

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
  const goToday = (): void => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };
  const refresh = useCallback((): void => setReloadKey((k) => k + 1), []);

  const handlePickerSelect = (year: number, month: number): void => {
    setViewYear(year);
    setViewMonth(month);
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);
    setAttendance({});
    setProgress({completed: 0, total: 0});

    fetchAttendanceForMonth({
      cookie: credentials.cookie,
      parsedBody: credentials.parsedBody,
      year: viewYear,
      month: viewMonth,
      signal: controller.signal,
      onProgress: (p) => {
        if (!cancelled) setProgress(p);
      },
    })
      .then((raw) => {
        if (cancelled) return;
        setAttendance(buildAttendanceMap(raw, today));
      })
      .catch((err: {name?: string; message?: string}) => {
        if (cancelled) return;
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setError(err.message ?? '조회 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewYear, viewMonth, credentials, reloadKey, today]);

  return (
    <>
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
          <button className="btn btn-ghost" onClick={goToday} disabled={loading}>오늘</button>
          <button className="btn btn-primary" onClick={refresh} disabled={loading}>
            {loading ? '조회 중…' : '새로고침'}
          </button>
        </div>
      </div>

      {loading && progress.total > 0 && (
        <div className="progress">
          <div
            className="progress-bar"
            style={{width: `${(progress.completed / progress.total) * 100}%`}}
          />
          <span className="progress-text">
            {progress.completed} / {progress.total} 일 조회 중
          </span>
        </div>
      )}

      {error && <div className="error-box">조회 실패: {error}</div>}

      <Calendar
        year={viewYear}
        month={viewMonth}
        today={today}
        attendance={attendance}
      />
    </>
  );
}

export default CalendarPage;
