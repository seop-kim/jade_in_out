import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  calculateLeaveBalanceSummary,
  LeaveBalanceResult,
  LeaveDecision,
  LeaveDecisionByRowId,
  LeaveHoursByRowId,
  LeaveReviewRow,
} from '../lib/leaveBalance';
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

function sourceLabel(source: LeaveBalanceResult['records'][number]['source'] | LeaveReviewRow['source']): string {
  if (source === 'both') return 'Jade + 신규';
  return source === 'jade' ? 'Jade' : '신규';
}

function decisionLabel(decision: LeaveDecision): string {
  if (decision === 'auto') return '자동';
  if (decision === 'deduct') return '차감';
  if (decision === 'duplicate') return '중복 제외';
  return '차감 제외';
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
  const [decisionByRowId, setDecisionByRowId] = useState<LeaveDecisionByRowId>({});
  const [hoursByRowId, setHoursByRowId] = useState<LeaveHoursByRowId>({});
  const controllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
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

  const displayResult = hasRunRef.current ? localResult : (result ?? localResult);

  useEffect(() => {
    if (!displayResult) return;
    setDecisionByRowId({});
    setHoursByRowId({});
  }, [displayResult]);

  useEffect(() => {
    if (open) return;
    hasRunRef.current = false;
    setLocalResult(result);
    setLocalError(null);
    setLocalProgress(null);
    setRequesting(false);
    setDecisionByRowId({});
    setHoursByRowId({});
  }, [open, result]);

  const handleClose = useCallback((): void => {
    requestSequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRequesting(false);
    setDecisionByRowId({});
    setHoursByRowId({});
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setRequesting(false);
      return undefined;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const initialFocus = dialogRef.current?.querySelector<HTMLButtonElement>('[aria-label="닫기"]');
    (initialFocus ?? dialogRef.current)?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      controllerRef.current?.abort();
      controllerRef.current = null;
      previousFocusRef.current?.focus();
    };
  }, [handleClose, open]);

  if (!open) return null;

  const isLoading = loading || requesting;
  const displayError = localError ?? error;
  const displayProgress = localProgress ?? progress;
  const displaySummary = displayResult
    ? calculateLeaveBalanceSummary(displayResult, decisionByRowId, hoursByRowId)
    : null;
  const progressPercent = displayProgress && displayProgress.total > 0
    ? Math.min(100, Math.round((displayProgress.completed / displayProgress.total) * 100))
    : null;

  const handleLoad = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    hasRunRef.current = true;
    setRequesting(true);
    setLocalResult(null);
    setLocalError(null);
    setLocalProgress(null);
    setDecisionByRowId({});
    setHoursByRowId({});
    try {
      const handleProgress = (nextProgress: LeaveBalanceProgress): void => {
        if (requestSequenceRef.current === requestId && !controller.signal.aborted) {
          setLocalProgress(nextProgress);
        }
      };
      const nextResult = await onLoad(year, controller.signal, handleProgress);
      if (requestSequenceRef.current === requestId && !controller.signal.aborted) setLocalResult(nextResult);
    } catch (reason) {
      if (requestSequenceRef.current === requestId && !controller.signal.aborted) {
        setLocalError('휴가 현황을 불러오지 못했습니다. 다시 연결을 확인해주세요.');
      }
    } finally {
      if (requestSequenceRef.current === requestId && !controller.signal.aborted) setRequesting(false);
    }
  };

  const handleYearChange = (nextYear: number): void => {
    requestSequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    hasRunRef.current = true;
    setYear(nextYear);
    setLocalResult(null);
    setLocalError(null);
    setLocalProgress(null);
    setRequesting(false);
    setDecisionByRowId({});
    setHoursByRowId({});
  };

  return (
    <div className="leave-balance-backdrop">
      <div ref={dialogRef} className="leave-balance-dialog" role="dialog" aria-modal="true" aria-label="휴가 현황" tabIndex={-1}>
        <div className="leave-balance-header">
          <div>
            <p className="leave-balance-eyebrow">연차 조회</p>
            <h2>휴가 현황</h2>
          </div>
          <button type="button" className="leave-balance-close" aria-label="닫기" onClick={handleClose}>×</button>
        </div>

        <div className="leave-balance-controls">
          <label htmlFor="leave-balance-year">조회 연도</label>
          <select id="leave-balance-year" value={year} onChange={(event) => handleYearChange(Number(event.target.value))} disabled={isLoading}>
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

        {!isLoading && !displayError && displayResult && displaySummary && (
          <div className="leave-balance-content">
            <div className="leave-balance-summary" aria-label="휴가 합계">
              <div><span>발생</span><strong>{hoursLabel(displayResult.accruedHours)}</strong></div>
              <div><span>Jade 사용</span><strong>{hoursLabel(displayResult.jadeUsedHours)}</strong></div>
              <div><span>신규 사용</span><strong>{hoursLabel(displayResult.insaUsedHours)}</strong></div>
              <div><span>중복 제외</span><strong>{hoursLabel(displaySummary.duplicateHours)}</strong></div>
              <div><span>최종 사용</span><strong>{hoursLabel(displaySummary.usedHours)}</strong></div>
              <div className="leave-balance-summary-primary"><span>잔여 시간</span><strong>{hoursLabel(displaySummary.remainingHours)}</strong></div>
            </div>

            {displaySummary.unresolved.length > 0 && (
              <p className="leave-balance-warning" role="alert">확인되지 않은 사용 내역이 있습니다.</p>
            )}

            <div className="leave-balance-records">
              <h3>사용 내역</h3>
              {displayResult.reviewRows.length === 0 ? (
                <p className="leave-balance-empty">사용 내역이 없습니다.</p>
              ) : (
                <div className="leave-balance-table-wrap">
                  <table>
                    <thead><tr><th>날짜</th><th>휴가 유형</th><th>사유</th><th>시간</th><th>출처</th><th>승인상태</th><th>자동 판정</th><th>최종 판정</th><th>반영시간</th></tr></thead>
                    <tbody>
                      {displayResult.reviewRows.map((row) => {
                        const selectedDecision = decisionByRowId[row.id] ?? 'auto';
                        const effective = selectedDecision === 'auto' ? row.autoDecision : selectedDecision;
                        const enteredHours = hoursByRowId[row.id];
                        const effectiveHours = typeof enteredHours === 'number' && enteredHours > 0
                          ? enteredHours
                          : row.hours;
                        const rowLabel = `${row.ymd} ${sourceLabel(row.source)}`;
                        return (
                        <tr key={row.id}>
                          <td>{row.ymd}</td>
                          <td>{row.type}</td>
                          <td>{row.reason || '-'}</td>
                          <td>{row.durationLabel || hoursLabel(row.hours)}</td>
                          <td>{sourceLabel(row.source)}</td>
                          <td>{row.status || '-'}</td>
                          <td>{decisionLabel(row.autoDecision)}</td>
                          <td>
                            <select
                              aria-label={`최종 판정 ${rowLabel}`}
                              value={selectedDecision}
                              onChange={(event) => {
                                const nextDecision = event.target.value as LeaveDecision;
                                setDecisionByRowId((current) => ({...current, [row.id]: nextDecision}));
                              }}
                            >
                              <option value="auto">자동</option>
                              <option value="deduct">차감</option>
                              <option value="exclude">차감 제외</option>
                              <option value="duplicate">중복 제외</option>
                            </select>
                          </td>
                          <td>
                            {row.hours === null ? (
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                aria-label={`반영시간 ${rowLabel}`}
                                value={enteredHours ?? ''}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setHoursByRowId((current) => ({
                                    ...current,
                                    [row.id]: nextValue === '' ? undefined : Number(nextValue),
                                  }));
                                }}
                              />
                            ) : hoursLabel(effectiveHours)}
                            {effective === 'deduct' && effectiveHours === null && <span className="leave-balance-review-needed">확인 필요</span>}
                          </td>
                        </tr>
                        );
                      })}
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
