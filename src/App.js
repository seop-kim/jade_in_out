import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Calendar from './components/Calendar';
import Setup from './components/Setup';
import { fetchAttendanceForMonth } from './api/jadeApi';

const STORAGE_KEY = 'jade_in_out_credentials_v1';

function loadCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.cookie || !parsed.body) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCredentials(creds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {}
}

function clearCredentials() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function App() {
  const [credentials, setCredentials] = useState(() => loadCredentials());

  const handleSetupSubmit = (creds) => {
    saveCredentials(creds);
    setCredentials(creds);
  };

  const handleResetCredentials = () => {
    clearCredentials();
    setCredentials(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1 className="app-title">Jade 출퇴근 기록</h1>
            <p className="app-subtitle">
              {credentials
                ? `${credentials.parsedBody?.S_EMP_NM ?? ''} ${
                    credentials.parsedBody?.S_EMP_ID
                      ? `(${credentials.parsedBody.S_EMP_ID})`
                      : ''
                  }`.trim() || '날짜별 출근/퇴근 시간을 한눈에 확인하세요'
                : '시작하려면 먼저 Jade 인증 정보를 입력해주세요'}
            </p>
          </div>
          {credentials && (
            <button className="btn btn-ghost" onClick={handleResetCredentials}>
              인증 정보 재설정
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {credentials ? (
          <CalendarPage credentials={credentials} />
        ) : (
          <Setup onSubmit={handleSetupSubmit} />
        )}
      </main>
    </div>
  );
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymdToKey(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function formatHm(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`;
  if (digits.length === 6) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return value;
}

function CalendarPage({ credentials }) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [reloadKey, setReloadKey] = useState(0);

  const goPrev = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNext = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);
    setAttendance({});
    setProgress({ completed: 0, total: 0 });

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
        const out = {};
        for (const [ymd, data] of Object.entries(raw)) {
          const key = ymdToKey(ymd);
          if (data.error) {
            out[key] = { error: data.error };
            continue;
          }
          const clockIn = formatHm(data.clockIn);
          const clockOut = formatHm(data.clockOut);
          if (clockIn || clockOut) {
            out[key] = { clockIn, clockOut, workDay: data.workDay };
          }
        }
        setAttendance(out);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setError(err.message || '조회 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewYear, viewMonth, credentials, reloadKey]);

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="btn" onClick={goPrev} aria-label="이전 달" disabled={loading}>‹</button>
          <h2 className="month-title">
            {viewYear}년 {pad(viewMonth + 1)}월
          </h2>
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
            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
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

export default App;
