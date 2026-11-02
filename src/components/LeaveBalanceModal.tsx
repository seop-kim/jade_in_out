import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LeaveBalanceResult} from '../lib/leaveBalance';
import './LeaveBalanceModal.css';

export interface LeaveBalanceProgress {
  completed: number;
  total: number;
}

export type LeaveBalanceLoad = (
  year: number,
  signal: AbortSignal,
  onProgress: (progress: LeaveBalanceProgress) => void
) => Promise<LeaveBalanceResult>;

interface LeaveBalanceModalProps {
  open: boolean;
  onClose: () => void;
  onLoad: LeaveBalanceLoad;
  result: LeaveBalanceResult | null;
  error: string | null;
  loading: boolean;
  progress: LeaveBalanceProgress | null;
}

function hoursLabel(hours: number | null): string {
  return hours === null ? '확인 필요' : `${hours}시간`;
}

function sourceLabel(source: LeaveBalanceResult['records'][number]['source']): string {
  if (source === 'both') return 'Jade + 신규';
  return source === 'jade' ? 'Jade' : '신규';
}

function LeaveBalanceModal({
  open,
  onClose,
  onLoad,
  result,
  error,
  loading,
  progress,
}: LeaveBalanceModalProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [requesting, setRequesting] = useState(false);
  const [localResult, setLocalResult] = useState<LeaveBalanceResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<LeaveBalanceProgress | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const hasRunRef = useRef(false);
  const previousOverflowRef = useRef('');
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({length: 7}, (_, index) => currentYear - 3 + index);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflowRef.current;
    };
  }, [open]);

  useEffect(() => {
    if (result) setLocalResult(result);
    else if (!hasRunRef.current) setLocalResult(null);
  }, [result]);

  useEffect(() => {
    if (open) return;
    hasRunRef.current = false;
    setLocalResult(result);
    setLocalError(null);
    setLocalProgress(null);
    setRequesting(false);
  }, [open, result]);

  useEffect(() => () => {
    controllerRef.current?.abort();
  }, []);

  const handleClose = useCallback((): void => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRequesting(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, open]);

  if (!open) return null;

  const isLoading = loading || requesting;
  const displayResult = hasRunRef.current ? localResult : (result ?? localResult);
  const displayError = localError ?? error;
  const displayProgress = localProgress ?? progress;
  const progressPercent = displayProgress && displayProgress.total > 0
    ? Math.min(100, Math.round((displayProgress.completed / displayProgress.total) * 100))
    : null;

  const handleLoad = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    hasRunRef.current = true;
    setRequesting(true);
    setLocalResult(null);
    setLocalError(null);
    setLocalProgress(null);
    try {
      const nextResult = await onLoad(year, controller.signal, setLocalProgress);
      if (!controller.signal.aborted) setLocalResult(nextResult);
    } catch (reason) {
      if (!controller.signal.aborted) setLocalError('휴가 현황을 불러오지 못했습니다. 다시 연결을 확인해주세요.');
    } finally {
      if (!controller.signal.aborted) setRequesting(false);
    }
  };

  return (
    <div className="leave-balance-backdrop">
      <div className="leave-balance-dialog" role="dialog" aria-modal="true" aria-label="휴가 현황">
        <div className="leave-balance-header">
          <div>
            <p className="leave-balance-eyebrow">연차 조회</p>
            <h2>휴가 현황</h2>
          </div>
          <button type="button" className="leave-balance-close" aria-label="닫기" onClick={handleClose}>×</button>
        </div>

        <div className="leave-balance-controls">
          <label htmlFor="leave-balance-year">조회 연도</label>
          <select id="leave-balance-year" value={year} onChange={(event) => setYear(Number(event.target.value))} disabled={isLoading}>
            {years.map((option) => <option key={option} value={option}>{option}년</option>)}
          </select>
          <button type="button" className="leave-balance-load" onClick={handleLoad} disabled={isLoading}>
            {isLoading ? '조회 중...' : '조회'}
          </button>
        </div>

        {isLoading && (
          <div className="leave-balance-loading" role="status">
            <strong>휴가 현황을 불러오는 중입니다.</strong>
            {progressPercent !== null && (
              <>
                <div className="leave-balance-progress-track"><span style={{width: `${progressPercent}%`}} /></div>
                <span>{progressPercent}%</span>
              </>
            )}
          </div>
        )}

        {!isLoading && displayError && <p className="leave-balance-error" role="alert">{displayError}</p>}

        {!isLoading && !displayError && displayResult && (
          <div className="leave-balance-content">
            <div className="leave-balance-summary" aria-label="휴가 합계">
              <div><span>발생</span><strong>{hoursLabel(displayResult.accruedHours)}</strong></div>
              <div><span>Jade 사용</span><strong>{hoursLabel(displayResult.jadeUsedHours)}</strong></div>
              <div><span>신규 사용</span><strong>{hoursLabel(displayResult.insaUsedHours)}</strong></div>
              <div><span>중복 제외</span><strong>{hoursLabel(displayResult.duplicateHours)}</strong></div>
              <div><span>최종 사용</span><strong>{hoursLabel(displayResult.usedHours)}</strong></div>
              <div className="leave-balance-summary-primary"><span>잔여 시간</span><strong>{hoursLabel(displayResult.remainingHours)}</strong></div>
            </div>

            {displayResult.unresolved.length > 0 && (
              <p className="leave-balance-warning" role="alert">확인되지 않은 사용 내역이 있습니다.</p>
            )}

            <div className="leave-balance-records">
              <h3>사용 내역</h3>
              {displayResult.records.length === 0 ? (
                <p className="leave-balance-empty">사용 내역이 없습니다.</p>
              ) : (
                <div className="leave-balance-table-wrap">
                  <table>
                    <thead><tr><th>날짜</th><th>구분</th><th>시간</th><th>출처</th><th>상태</th></tr></thead>
                    <tbody>
                      {displayResult.records.map((record) => (
                        <tr key={`${record.ymd}-${record.source}-${record.durationLabel}`}>
                          <td>{record.ymd}</td>
                          <td>{record.type}</td>
                          <td>{record.durationLabel || hoursLabel(record.hours)}</td>
                          <td>{sourceLabel(record.source)}</td>
                          <td>{record.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaveBalanceModal;
