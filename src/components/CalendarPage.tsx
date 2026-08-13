import {useCallback, useEffect, useMemo, useState} from 'react';
import Calendar from './Calendar';
import MonthPicker from './MonthPicker';
import {fetchAttendanceForMonth} from '../api/jadeApi';
import {
  AttendanceMap,
  buildDisplayRecord,
} from '../lib/transformAttendance';
import {Credentials} from '../lib/storage';
import {dateKey, ymdToKey} from '../lib/format';
import {JadeBridgeTransport} from '../lib/jadeBridge';

interface CalendarPageProps {
  credentials: Credentials;
  transport?: JadeBridgeTransport;
  onError?: (message: string) => void;
}

function buildLoadingMap(year: number, month: number): AttendanceMap {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const out: AttendanceMap = {};
  for (let day = 1; day <= lastDay; day++) {
    out[dateKey(year, month, day)] = {kind: 'loading'};
  }
  return out;
}

function CalendarPage({credentials, transport, onError}: CalendarPageProps) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());

  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [loading, setLoading] = useState<boolean>(false);
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
    setAttendance(buildLoadingMap(viewYear, viewMonth));

    fetchAttendanceForMonth({
      cookie: credentials.cookie,
      parsedBody: credentials.parsedBody,
      year: viewYear,
      month: viewMonth,
      signal: controller.signal,
      onDayResult: (ymd, result) => {
        if (cancelled) return;
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
      .catch((err: {name?: string; message?: string}) => {
        if (cancelled) return;
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        onError?.('출퇴근 기록 조회 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewYear, viewMonth, credentials, onError, reloadKey, today, transport]);

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
          <button className="btn btn-ghost" onClick={goToday} disabled={loading}>오늘</button>
          <button className="btn btn-primary" onClick={refresh} disabled={loading}>
            {loading ? '조회 중…' : '새로고침'}
          </button>
        </div>
      </div>

      <Calendar
        year={viewYear}
        month={viewMonth}
        today={today}
        attendance={attendance}
      />
    </div>
  );
}

export default CalendarPage;
