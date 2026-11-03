import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  calculateLeaveBalanceSummary,
  LeaveBalanceResult,
  LeaveDecision,
  LeaveDecisionByRowId,
  LeaveHoursByRowId,
  LeaveReviewRow,
} from '../lib/leaveBalance';
import {buildExportFileName, downloadExcel} from '../lib/csvExport';
import {buildLeaveBalanceExportRows, LEAVE_BALANCE_EXPORT_COLUMNS} from '../lib/leaveBalanceExport';
import './LeaveBalanceModal.css';

export interface LeaveBalanceProgress {
  year?: number;
  completed: number;
  total: number;
}

export type LeaveBalanceLoad = (
  year: number,
  signal: AbortSignal,
  onProgress: (progress: LeaveBalanceProgress) => void,
  includePreviousPeriod?: boolean
) => Promise<LeaveBalanceResult>;

interface LeaveBalanceModalProps {
  open: boolean;
  onClose: () => void;
  onLoad: LeaveBalanceLoad;
  result: LeaveBalanceResult | null;
  error: string | null;
  errorDetails?: string[] | null;
  loading: boolean;
  progress: LeaveBalanceProgress[] | null;
  canIncludePreviousPeriod?: boolean;
  previousPeriodEligibleYear?: number | null;
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
  errorDetails,
  loading,
  progress,
  canIncludePreviousPeriod = true,
  previousPeriodEligibleYear = null,
}: LeaveBalanceModalProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [requesting, setRequesting] = useState(false);
  const [localResult, setLocalResult] = useState<LeaveBalanceResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<LeaveBalanceProgress[] | null>(null);
  const [decisionByRowId, setDecisionByRowId] = useState<LeaveDecisionByRowId>({});
  const [hoursByRowId, setHoursByRowId] = useState<LeaveHoursByRowId>({});
  const [deletedRowIds, setDeletedRowIds] = useState<ReadonlySet<string>>(new Set());
  const [includePreviousPeriod, setIncludePreviousPeriod] = useState(false);
  const [accruedHoursByPeriodId, setAccruedHoursByPeriodId] = useState<Record<string, number | undefined>>({});
  const [deleteDismissedDialogOpen, setDeleteDismissedDialogOpen] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
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
  const canSelectPreviousPeriod = canIncludePreviousPeriod
    && (previousPeriodEligibleYear === null || previousPeriodEligibleYear === year);

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
    setDeletedRowIds(new Set());
    setIncludePreviousPeriod(displayResult.includePreviousPeriod && canSelectPreviousPeriod);
    setAccruedHoursByPeriodId({});
    setDeleteDismissedDialogOpen(false);
    setDeleteRowId(null);
  }, [canSelectPreviousPeriod, displayResult]);

  useEffect(() => {
    if (open) return;
    hasRunRef.current = false;
    setLocalResult(result);
    setLocalError(null);
    setLocalProgress(null);
    setRequesting(false);
    setDecisionByRowId({});
    setHoursByRowId({});
    setDeletedRowIds(new Set());
    setIncludePreviousPeriod(false);
    setAccruedHoursByPeriodId({});
    setDeleteDismissedDialogOpen(false);
    setDeleteRowId(null);
  }, [open, result]);

  const handleClose = useCallback((): void => {
    requestSequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRequesting(false);
    setDecisionByRowId({});
    setHoursByRowId({});
    setDeletedRowIds(new Set());
    setIncludePreviousPeriod(false);
    setAccruedHoursByPeriodId({});
    setDeleteDismissedDialogOpen(false);
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
  const displayRows = displayResult
    ? displayResult.reviewRows.filter((row) => !deletedRowIds.has(row.id))
    : [];
  const selectedPeriods = displayResult
    ? displayResult.periods.map((period) => {
      const accruedHours = accruedHoursByPeriodId[period.id] ?? period.accruedHours;
      return {
        ...period,
        accruedHours,
        remainingHours: accruedHours - period.usedHours,
      };
    })
    : [];
  const summaryResult = displayResult
    ? {
      ...displayResult,
      accruedHours: selectedPeriods.reduce((total, period) => total + period.accruedHours, 0),
      periods: selectedPeriods,
      reviewRows: displayRows,
    }
    : null;
  const displaySummary = summaryResult
    ? calculateLeaveBalanceSummary(summaryResult, decisionByRowId, hoursByRowId)
    : null;
  const dismissibleRowIds = displayRows
    .filter((row) => {
      const selectedDecision = decisionByRowId[row.id] ?? 'auto';
      const effective = selectedDecision === 'auto' ? row.autoDecision : selectedDecision;
      return effective === 'exclude' || effective === 'duplicate';
    })
    .map((row) => row.id);
  const activeDateCounts = displayRows.reduce((counts, row) => {
    const selectedDecision = decisionByRowId[row.id] ?? 'auto';
    const effective = selectedDecision === 'auto' ? row.autoDecision : selectedDecision;
    if (effective !== 'exclude' && effective !== 'duplicate') {
      counts.set(row.ymd, (counts.get(row.ymd) ?? 0) + 1);
    }
    return counts;
  }, new Map<string, number>());
  const handleOpenDeleteDismissedDialog = (): void => {
    setDeleteDismissedDialogOpen(true);
  };
  const handleConfirmDeleteDismissedRows = (): void => {
    setDeletedRowIds((current) => new Set([...current, ...dismissibleRowIds]));
    setDeleteDismissedDialogOpen(false);
  };
  const handleRequestRowDelete = (rowId: string, rowIsDismissed: boolean): void => {
    if (rowIsDismissed) {
      setDeletedRowIds((current) => new Set([...current, rowId]));
      return;
    }
    setDeleteRowId(rowId);
  };
  const handleConfirmDeleteRow = (): void => {
    if (deleteRowId) setDeletedRowIds((current) => new Set([...current, deleteRowId]));
    setDeleteRowId(null);
  };
  const handleDownloadExcel = (): void => {
    if (displayRows.length === 0) return;
    downloadExcel(
      buildExportFileName('휴가현황', `${year}-01-01`, `${year}-12-31`),
      LEAVE_BALANCE_EXPORT_COLUMNS,
      buildLeaveBalanceExportRows(displayRows, decisionByRowId, hoursByRowId),
    );
  };
  const handleLoad = async (requestedIncludePreviousPeriod = includePreviousPeriod): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    hasRunRef.current = true;
    setRequesting(true);
    setLocalResult(null);
    setLocalError(null);
    setLocalProgress([]);
    setDecisionByRowId({});
    setHoursByRowId({});
    setDeletedRowIds(new Set());
    const includePrevious = canSelectPreviousPeriod && requestedIncludePreviousPeriod;
    setIncludePreviousPeriod(includePrevious);
    try {
      const handleProgress = (nextProgress: LeaveBalanceProgress): void => {
        if (requestSequenceRef.current === requestId && !controller.signal.aborted) {
          const progressYear = nextProgress.year ?? year;
          setLocalProgress((previous) => {
            const next = [...(previous ?? [])];
            const index = next.findIndex((entry) => (entry.year ?? year) === progressYear);
            const normalized = {...nextProgress, year: progressYear};
            if (index >= 0) next[index] = normalized;
            else next.push(normalized);
            return next.sort((left, right) => (left.year ?? year) - (right.year ?? year));
          });
        }
      };
      const nextResult = await onLoad(year, controller.signal, handleProgress, includePrevious);
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
    setDeletedRowIds(new Set());
    setIncludePreviousPeriod(false);
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
          {canSelectPreviousPeriod && (
            <label className="leave-balance-previous-toggle">
              <input
                type="checkbox"
                checked={includePreviousPeriod}
                disabled={isLoading}
                onChange={(event) => setIncludePreviousPeriod(event.target.checked)}
              />
              신입휴가 포함 (전년도 포함)
            </label>
          )}
          <button type="button" className="leave-balance-load" onClick={() => void handleLoad()} disabled={isLoading}>
            {isLoading ? '조회 중...' : '조회'}
          </button>
        </div>

        {isLoading && (
          <div className="leave-balance-loading" role="status">
            <strong>휴가 현황을 불러오는 중입니다.</strong>
            {displayProgress?.map((entry) => {
              const percent = entry.total > 0
                ? Math.min(100, Math.round((entry.completed / entry.total) * 100))
                : 0;
              const label = entry.year ? `${entry.year}년 휴가 정보` : '휴가 정보';
              return (
                <div className="leave-balance-progress-item" key={entry.year ?? 'current'}>
                  <div className="leave-balance-progress-label">
                    <span>{label}</span>
                    <span>{percent}%</span>
                  </div>
                  <div
                    className="leave-balance-progress-track"
                    role="progressbar"
                    aria-label={`${label} 조회 진행률`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span style={{width: `${percent}%`}} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && displayError && (
          <div className="leave-balance-error" role="alert">
            <p>{displayError}</p>
            {errorDetails && errorDetails.length > 0 && (
              <details className="leave-balance-error-details">
                <summary>자세히 보기</summary>
                <ul>
                  {errorDetails.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {!isLoading && !displayError && displayResult && displaySummary && (
          <div className="leave-balance-content">
            <div className="leave-balance-summary" aria-label="휴가 합계">
              <div><span>발생</span><strong>{hoursLabel(summaryResult?.accruedHours ?? displayResult.accruedHours)}</strong></div>
              <div><span>Jade 사용</span><strong>{hoursLabel(displaySummary.jadeUsedHours)}</strong></div>
              <div><span>신규 사용</span><strong>{hoursLabel(displaySummary.insaUsedHours)}</strong></div>
              <div><span>중복 제외</span><strong>{hoursLabel(displaySummary.duplicateHours)}</strong></div>
              <div><span>최종 사용</span><strong>{hoursLabel(displaySummary.usedHours)}</strong></div>
              <div className="leave-balance-summary-primary"><span>잔여 시간</span><strong>{hoursLabel(displaySummary.remainingHours)}</strong></div>
            </div>

            {summaryResult && summaryResult.periods.length > 0 && (
              <div className="leave-balance-periods" aria-label="휴가 발생기간">
                {summaryResult.periods.map((period) => (
                  <div className="leave-balance-period" key={period.id}>
                    <div className="leave-balance-period-heading">
                      <strong>{period.isNewHire ? `${period.year} 신입휴가` : `${period.year} 연차`}</strong>
                      <div className="leave-balance-period-meta">
                        <label>
                          발생시간
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            aria-label={`발생시간 ${period.year}년`}
                            value={accruedHoursByPeriodId[period.id] ?? period.accruedHours}
                            onChange={(event) => setAccruedHoursByPeriodId((current) => ({
                              ...current,
                              [period.id]: event.target.value === '' ? undefined : Number(event.target.value),
                            }))}
                          />
                          시간
                        </label>
                        {period.isNewHire && <span>입사 1년차</span>}
                      </div>
                    </div>
                    <span>{period.period}</span>
                    <div className="leave-balance-period-values">
                      <span>발생 <strong>{hoursLabel(period.accruedHours)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {displaySummary.unresolved.length > 0 && (
              <p className="leave-balance-warning" role="alert">확인되지 않은 사용 내역이 있습니다.</p>
            )}

            <div className="leave-balance-records">
              <div className="leave-balance-records-heading">
                <h3>사용 내역</h3>
                <div className="leave-balance-records-actions">
                  <button type="button" className="leave-balance-export" onClick={handleDownloadExcel} disabled={displayRows.length === 0}>
                    엑셀 다운로드
                  </button>
                  <button type="button" className="leave-balance-delete-all" onClick={handleOpenDeleteDismissedDialog}>
                    취소선 데이터 일괄 삭제{dismissibleRowIds.length > 0 ? ` (${dismissibleRowIds.length})` : ''}
                  </button>
                </div>
              </div>
              {displayRows.length === 0 ? (
                <p className="leave-balance-empty">사용 내역이 없습니다.</p>
              ) : (
                <div className="leave-balance-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th title="이 휴가가 차감되는 발생 연차 기간입니다.">발생기간</th>
                        <th title="휴가를 사용한 날짜입니다.">날짜</th>
                        <th title="원 시스템에서 조회된 휴가 종류입니다.">휴가 유형</th>
                        <th title="휴가 신청 시 입력된 사유입니다.">사유</th>
                        <th title="사용한 휴가 시간 또는 시간차 정보입니다.">시간</th>
                        <th title="해당 기록을 가져온 시스템입니다.">출처</th>
                        <th title="원 시스템에서 표시한 승인 상태입니다.">승인상태</th>
                        <th title="중복·비차감 휴가 여부를 자동으로 판정한 결과입니다.">자동 판정</th>
                        <th title="자동 판정을 확인하고 직접 변경할 수 있는 최종 처리값입니다.">최종 판정</th>
                        <th title="최종 잔여시간 계산에 반영할 시간입니다.">반영시간</th>
                        <th title="사용 내역을 삭제합니다. 취소선이 없는 행은 확인 후 삭제됩니다.">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => {
                        const selectedDecision = decisionByRowId[row.id] ?? 'auto';
                        const effective = selectedDecision === 'auto' ? row.autoDecision : selectedDecision;
                        const enteredHours = hoursByRowId[row.id];
                        const effectiveHours = typeof enteredHours === 'number' && enteredHours > 0
                          ? enteredHours
                          : row.hours;
                        const rowLabel = `${row.ymd} ${sourceLabel(row.source)}`;
                        const rowIsDismissed = effective === 'exclude' || effective === 'duplicate';
                        const rowIsDuplicate = !rowIsDismissed && (activeDateCounts.get(row.ymd) ?? 0) > 1;
                        return (
                        <tr key={row.id} className={[rowIsDismissed && 'leave-balance-row-dismissed', rowIsDuplicate && 'leave-balance-row-duplicate'].filter(Boolean).join(' ') || undefined}>
                          <td>{row.periodLabel || '-'}</td>
                          <td>{row.ymd}</td>
                          <td>{row.type}</td>
                          <td>{row.reason || '-'}</td>
                          <td>{row.durationLabel || hoursLabel(row.hours)}</td>
                          <td>{sourceLabel(row.source)}</td>
                          <td>{row.status || '-'}</td>
                          <td>
                            <span>{decisionLabel(row.autoDecision)}</span>
                            {row.needsReview && <span className="leave-balance-review-needed">확인 필요</span>}
                          </td>
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
                          <td>
                            <button
                              type="button"
                              className="leave-balance-delete"
                              aria-label={`행 삭제 ${rowLabel}`}
                              onClick={() => handleRequestRowDelete(row.id, rowIsDismissed)}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {deleteDismissedDialogOpen && (
              <div className="leave-balance-confirm-backdrop">
                <div className="leave-balance-confirm-dialog" role="dialog" aria-modal="true" aria-label="취소선 데이터 삭제 확인">
                  <h3>취소선 데이터 일괄 삭제</h3>
                  {dismissibleRowIds.length > 0 ? (
                    <p>취소선 데이터 {dismissibleRowIds.length}건을 삭제할까요?</p>
                  ) : (
                    <p>삭제할 취소선 데이터가 없습니다.</p>
                  )}
                  <div className="leave-balance-confirm-actions">
                    {dismissibleRowIds.length > 0 ? (
                      <>
                        <button type="button" onClick={() => setDeleteDismissedDialogOpen(false)}>취소</button>
                        <button type="button" className="leave-balance-confirm-danger" onClick={handleConfirmDeleteDismissedRows}>삭제</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setDeleteDismissedDialogOpen(false)}>확인</button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {deleteRowId && (
              <div className="leave-balance-confirm-backdrop">
                <div className="leave-balance-confirm-dialog" role="dialog" aria-modal="true" aria-label="행 삭제 확인">
                  <h3>행 삭제</h3>
                  <p>취소선이 없는 사용 내역을 삭제할까요?</p>
                  <div className="leave-balance-confirm-actions">
                    <button type="button" onClick={() => setDeleteRowId(null)}>취소</button>
                    <button type="button" className="leave-balance-confirm-danger" onClick={handleConfirmDeleteRow}>삭제</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaveBalanceModal;
