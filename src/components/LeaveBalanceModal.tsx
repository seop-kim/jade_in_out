import {KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
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

interface LeaveTableColumn {
  key: 'period' | 'date' | 'type' | 'reason' | 'hours' | 'source' | 'status' | 'finalDecision' | 'appliedHours' | 'manage';
  label: string;
  title: string;
}

type LeaveColumnDropPosition = 'before' | 'after';

const LEAVE_TABLE_COLUMNS: LeaveTableColumn[] = [
  {key: 'period', label: '발생기간', title: '이 휴가가 차감되는 발생 연차 기간입니다.'},
  {key: 'date', label: '날짜', title: '휴가를 사용한 날짜입니다.'},
  {key: 'type', label: '휴가 유형', title: '원 시스템에서 조회된 휴가 종류입니다.'},
  {key: 'reason', label: '사유', title: '휴가 신청 시 입력된 사유입니다.'},
  {key: 'hours', label: '시간', title: '사용한 휴가 시간 또는 시간차 정보입니다.'},
  {key: 'source', label: '출처', title: '해당 기록을 가져온 시스템입니다.'},
  {key: 'status', label: '승인상태', title: '원 시스템에서 표시한 승인 상태입니다.'},
  {key: 'finalDecision', label: '최종 판정', title: '자동: 자동 판정 결과 적용 / 차감: 연차에서 차감 / 차감 제외: 연차에서 제외 / 중복 제외: 중복 기록에서 제외'},
  {key: 'appliedHours', label: '반영시간', title: '최종 잔여시간 계산에 반영할 시간입니다.'},
  {key: 'manage', label: '관리', title: '사용 내역을 삭제합니다. 취소선이 없는 행은 확인 후 삭제됩니다.'},
];
const NON_REMOVABLE_LEAVE_COLUMN_KEYS = new Set<LeaveTableColumn['key']>(['date', 'hours', 'manage']);

const MAX_LEAVE_COLUMN_WIDTH = 600;
const MIN_LEAVE_COLUMN_WIDTHS: Record<LeaveTableColumn['key'], number> = {
  period: 118,
  date: 72,
  type: 122,
  reason: 78,
  hours: 92,
  source: 72,
  status: 94,
  finalDecision: 100,
  appliedHours: 90,
  manage: 72,
};
const DEFAULT_LEAVE_COLUMN_WIDTHS: Record<LeaveTableColumn['key'], number> = {
  period: 120,
  date: 100,
  type: 180,
  reason: 150,
  hours: 170,
  source: 90,
  status: 100,
  finalDecision: 120,
  appliedHours: 110,
  manage: 90,
};

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
  const [accruedHoursEditPeriodId, setAccruedHoursEditPeriodId] = useState<string | null>(null);
  const [accruedHoursDraft, setAccruedHoursDraft] = useState('');
  const [deleteDismissedDialogOpen, setDeleteDismissedDialogOpen] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [orderedColumnKeys, setOrderedColumnKeys] = useState<string[]>(() => LEAVE_TABLE_COLUMNS.map((column) => column.key));
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<LeaveColumnDropPosition>('before');
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => ({...DEFAULT_LEAVE_COLUMN_WIDTHS}));
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasRunRef = useRef(false);
  const previousOverflowRef = useRef('');
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({length: 3}, (_, index) => currentYear - index);
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
    setAccruedHoursEditPeriodId(null);
    setAccruedHoursDraft('');
    setDeleteDismissedDialogOpen(false);
    setDeleteRowId(null);
    setCloseConfirmOpen(false);
    setOrderedColumnKeys(LEAVE_TABLE_COLUMNS.map((column) => column.key));
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
    setColumnWidths({...DEFAULT_LEAVE_COLUMN_WIDTHS});
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
    setAccruedHoursEditPeriodId(null);
    setAccruedHoursDraft('');
    setDeleteDismissedDialogOpen(false);
    setDeleteRowId(null);
    setCloseConfirmOpen(false);
    setOrderedColumnKeys(LEAVE_TABLE_COLUMNS.map((column) => column.key));
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
    setColumnWidths({...DEFAULT_LEAVE_COLUMN_WIDTHS});
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
    setAccruedHoursEditPeriodId(null);
    setAccruedHoursDraft('');
    setDeleteDismissedDialogOpen(false);
    setCloseConfirmOpen(false);
    setOrderedColumnKeys(LEAVE_TABLE_COLUMNS.map((column) => column.key));
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
    setColumnWidths({...DEFAULT_LEAVE_COLUMN_WIDTHS});
    onClose();
  }, [onClose]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

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
        if (closeConfirmOpen) setCloseConfirmOpen(false);
        else if (accruedHoursEditPeriodId) handleCloseAccruedHoursEditor();
        else if (deleteDismissedDialogOpen) setDeleteDismissedDialogOpen(false);
        else if (deleteRowId) setDeleteRowId(null);
        else setCloseConfirmOpen(true);
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
  }, [accruedHoursEditPeriodId, closeConfirmOpen, deleteDismissedDialogOpen, deleteRowId, handleClose, open]);

  if (!open) return null;

  const isLoading = loading || requesting;
  const orderedColumns = orderedColumnKeys
    .map((key) => LEAVE_TABLE_COLUMNS.find((column) => column.key === key))
    .filter((column): column is LeaveTableColumn => Boolean(column));
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
  const handleOpenAccruedHoursEditor = (periodId: string, currentHours: number): void => {
    setAccruedHoursEditPeriodId(periodId);
    setAccruedHoursDraft(String(currentHours));
  };
  const handleCloseAccruedHoursEditor = (): void => {
    setAccruedHoursEditPeriodId(null);
    setAccruedHoursDraft('');
  };
  const handleSaveAccruedHours = (): void => {
    if (!accruedHoursEditPeriodId) return;
    const nextHours = Number(accruedHoursDraft);
    if (!Number.isFinite(nextHours) || nextHours < 0) return;
    setAccruedHoursByPeriodId((current) => ({...current, [accruedHoursEditPeriodId]: nextHours}));
    handleCloseAccruedHoursEditor();
  };
  const handleColumnDrop = (sourceKey: string, targetKey: string, position: LeaveColumnDropPosition): void => {
    setOrderedColumnKeys((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      if (sourceIndex < 0 || current.indexOf(targetKey) < 0 || sourceKey === targetKey) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const targetIndex = next.indexOf(targetKey);
      if (moved !== undefined) next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moved);
      return next;
    });
  };
  const handleColumnRemove = (columnKey: string): void => {
    if (NON_REMOVABLE_LEAVE_COLUMN_KEYS.has(columnKey as LeaveTableColumn['key'])) return;
    setOrderedColumnKeys((current) => current.length <= 1 ? current : current.filter((key) => key !== columnKey));
    setDragOverColumnKey(null);
  };
  const handleColumnReset = (): void => {
    setOrderedColumnKeys(LEAVE_TABLE_COLUMNS.map((column) => column.key));
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
    setDropPosition('before');
    setColumnWidths({...DEFAULT_LEAVE_COLUMN_WIDTHS});
  };
  const handleColumnResizeStart = (event: ReactMouseEvent<HTMLSpanElement>, key: LeaveTableColumn['key']): void => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const startWidth = columnWidths[key] ?? DEFAULT_LEAVE_COLUMN_WIDTHS[key];
    const startX = event.clientX;
    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const nextWidth = Math.min(
        MAX_LEAVE_COLUMN_WIDTH,
        Math.max(MIN_LEAVE_COLUMN_WIDTHS[key], startWidth + moveEvent.clientX - startX),
      );
      setColumnWidths((current) => ({...current, [key]: nextWidth}));
    };
    const handleMouseUp = (): void => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      resizeCleanupRef.current = null;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    resizeCleanupRef.current = handleMouseUp;
  };
  const handleColumnResizeKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>, key: LeaveTableColumn['key']): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 10 : -10;
    setColumnWidths((current) => ({
      ...current,
      [key]: Math.min(MAX_LEAVE_COLUMN_WIDTH, Math.max(MIN_LEAVE_COLUMN_WIDTHS[key], (current[key] ?? DEFAULT_LEAVE_COLUMN_WIDTHS[key]) + step)),
    }));
  };
  const handleDownloadExcel = (): void => {
    if (displayRows.length === 0) return;
    downloadExcel(
      buildExportFileName('휴가현황', `${year}-01-01`, `${year}-12-31`),
      orderedColumns
        .filter((column) => column.key !== 'manage')
        .map((column) => LEAVE_BALANCE_EXPORT_COLUMNS.find((exportColumn) => exportColumn.key === column.key)!)
        .filter(Boolean),
      buildLeaveBalanceExportRows(displayRows, decisionByRowId, hoursByRowId),
      columnWidths,
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
    setOrderedColumnKeys(LEAVE_TABLE_COLUMNS.map((column) => column.key));
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
    setColumnWidths({...DEFAULT_LEAVE_COLUMN_WIDTHS});
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
    setOrderedColumnKeys(LEAVE_TABLE_COLUMNS.map((column) => column.key));
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
    setColumnWidths({...DEFAULT_LEAVE_COLUMN_WIDTHS});
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
                        <span>발생 {hoursLabel(accruedHoursByPeriodId[period.id] ?? period.accruedHours)}</span>
                        <button type="button" className="leave-balance-period-edit" onClick={() => handleOpenAccruedHoursEditor(period.id, accruedHoursByPeriodId[period.id] ?? period.accruedHours)}>
                          수정
                        </button>
                      </div>
                    </div>
                    <div className="leave-balance-period-range">
                      <span>{period.period}</span>
                      {period.isNewHire && <span>입사 1년차</span>}
                    </div>
                    <div className="leave-balance-period-values">
                      <span>발생 <strong>{hoursLabel(accruedHoursByPeriodId[period.id] ?? period.accruedHours)}</strong></span>
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
                  <button type="button" className="leave-balance-column-reset" onClick={handleColumnReset}>
                    컬럼 초기화
                  </button>
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
                    <colgroup>
                      {orderedColumns.map((column) => <col key={column.key} style={{width: `${columnWidths[column.key] ?? DEFAULT_LEAVE_COLUMN_WIDTHS[column.key]}px`}} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        {orderedColumns.map((column) => (
                          <th
                            key={column.key}
                            data-tooltip={column.title}
                            aria-label={column.label}
                            style={{width: `${columnWidths[column.key] ?? DEFAULT_LEAVE_COLUMN_WIDTHS[column.key]}px`}}
                            draggable
                            className={[
                              draggedColumnKey === column.key && 'leave-balance-column-dragging',
                              dragOverColumnKey === column.key && draggedColumnKey !== column.key && `leave-balance-column-drop-${dropPosition}`,
                            ].filter(Boolean).join(' ') || undefined}
                            onDragStart={(event) => {
                              if (event.dataTransfer) {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', column.key);
                              }
                              setDraggedColumnKey(column.key);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              if (draggedColumnKey !== column.key) {
                                const bounds = event.currentTarget.getBoundingClientRect();
                                const pointerX = Number.isFinite(event.clientX) ? event.clientX : bounds.left;
                                const nextPosition: LeaveColumnDropPosition = pointerX <= bounds.left + (bounds.width / 2)
                                  ? 'before'
                                  : 'after';
                                setDragOverColumnKey(column.key);
                                setDropPosition(nextPosition);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverColumnKey === column.key) setDragOverColumnKey(null);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const sourceKey = draggedColumnKey || event.dataTransfer?.getData('text/plain') || '';
                              if (sourceKey) handleColumnDrop(sourceKey, column.key, dropPosition);
                              setDraggedColumnKey(null);
                              setDragOverColumnKey(null);
                            }}
                            onDragEnd={() => {
                              setDraggedColumnKey(null);
                              setDragOverColumnKey(null);
                            }}
                          >
                            <span className="leave-balance-column-heading">
                              <span className="leave-balance-column-drag-handle" role="img" aria-label={`${column.label} 열 이동 핸들`}>⠿</span>
                              <span className="leave-balance-column-label">{column.label}</span>
                            </span>
                            {!NON_REMOVABLE_LEAVE_COLUMN_KEYS.has(column.key) && (
                              <button
                                type="button"
                                className="leave-balance-column-remove"
                                aria-label={`컬럼 삭제 ${column.label}`}
                                disabled={orderedColumns.length <= 1}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleColumnRemove(column.key);
                                }}
                              >
                                ×
                              </button>
                            )}
                            <span
                              className="leave-balance-column-resizer"
                              role="separator"
                              aria-label={`${column.label} 열 너비 조절`}
                              tabIndex={0}
                              onMouseDown={(event) => handleColumnResizeStart(event, column.key)}
                              onKeyDown={(event) => handleColumnResizeKeyDown(event, column.key)}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => {
                        const selectedDecision = decisionByRowId[row.id] ?? 'auto';
                        const effective = selectedDecision === 'auto' ? row.autoDecision : selectedDecision;
                        const enteredHours = hoursByRowId[row.id];
                        const effectiveHours = typeof enteredHours === 'number' && enteredHours >= 0
                          ? enteredHours
                          : row.hours;
                        const rowLabel = `${row.ymd} ${sourceLabel(row.source)}`;
                        const rowIsDismissed = effective === 'exclude' || effective === 'duplicate';
                        const rowIsDuplicate = !rowIsDismissed && (activeDateCounts.get(row.ymd) ?? 0) > 1;
                        return (
                          <tr key={row.id} className={[rowIsDismissed && 'leave-balance-row-dismissed', rowIsDuplicate && 'leave-balance-row-duplicate'].filter(Boolean).join(' ') || undefined}>
                            {orderedColumns.map((column) => {
                              if (column.key === 'period') return <td key={column.key} title={row.periodLabel || '-'}>{row.periodLabel || '-'}</td>;
                              if (column.key === 'date') return <td key={column.key} title={row.ymd}>{row.ymd}</td>;
                              if (column.key === 'type') return <td key={column.key} title={row.type}>{row.type}</td>;
                              if (column.key === 'reason') return <td key={column.key} title={row.reason || '-'}>{row.reason || '-'}</td>;
                              if (column.key === 'hours') return <td key={column.key} title={row.durationLabel || hoursLabel(row.hours)}>{row.durationLabel || hoursLabel(row.hours)}</td>;
                              if (column.key === 'source') return <td key={column.key} title={sourceLabel(row.source)}>{sourceLabel(row.source)}</td>;
                              if (column.key === 'status') return <td key={column.key} title={row.status || '-'}>{row.status || '-'}</td>;
                              if (column.key === 'finalDecision') return (
                                <td key={column.key} title="최종 판정 선택값은 셀렉트 옵션 설명을 확인해주세요.">
                                  <select
                                    aria-label={`최종 판정 ${rowLabel}`}
                                    value={selectedDecision}
                                    onChange={(event) => {
                                      const nextDecision = event.target.value as LeaveDecision;
                                      setDecisionByRowId((current) => ({...current, [row.id]: nextDecision}));
                                    }}
                                  >
                                    <option value="auto">자동 ({decisionLabel(row.autoDecision)})</option>
                                    <option value="deduct">차감</option>
                                    <option value="exclude">차감 제외</option>
                                    <option value="duplicate">중복 제외</option>
                                  </select>
                                  {row.needsReview && <span className="leave-balance-review-needed">확인 필요</span>}
                                </td>
                              );
                              if (column.key === 'appliedHours') return (
                                <td key={column.key} title={`${effectiveHours === null ? '확인 필요' : `${effectiveHours}시간`} · 직접 수정 가능`}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    aria-label={`반영시간 ${rowLabel}`}
                                    value={enteredHours ?? effectiveHours ?? ''}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setHoursByRowId((current) => ({
                                        ...current,
                                        [row.id]: nextValue === '' ? undefined : Number(nextValue),
                                      }));
                                    }}
                                  />
                                  {effective === 'deduct' && effectiveHours === null && <span className="leave-balance-review-needed">확인 필요</span>}
                                </td>
                              );
                              return (
                                <td key={column.key}>
                                  <button
                                    type="button"
                                    className="leave-balance-delete"
                                    aria-label={`행 삭제 ${rowLabel}`}
                                    onClick={() => handleRequestRowDelete(row.id, rowIsDismissed)}
                                  >
                                    삭제
                                  </button>
                                </td>
                              );
                            })}
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
            {accruedHoursEditPeriodId && (
              <div className="leave-balance-confirm-backdrop">
                <div className="leave-balance-confirm-dialog" role="dialog" aria-modal="true" aria-label="발생시간 수정">
                  <h3>발생시간 수정</h3>
                  <label className="leave-balance-accrued-hours-editor">
                    발생시간
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      aria-label="발생시간 수정값"
                      value={accruedHoursDraft}
                      onChange={(event) => setAccruedHoursDraft(event.target.value)}
                    />
                    시간
                  </label>
                  <div className="leave-balance-confirm-actions">
                    <button type="button" onClick={handleCloseAccruedHoursEditor}>취소</button>
                    <button type="button" className="leave-balance-confirm-primary" onClick={handleSaveAccruedHours} disabled={!accruedHoursDraft || Number(accruedHoursDraft) < 0}>수정</button>
                  </div>
                </div>
              </div>
            )}
            {closeConfirmOpen && (
              <div className="leave-balance-confirm-backdrop">
                <div className="leave-balance-confirm-dialog" role="dialog" aria-modal="true" aria-label="휴가 현황 종료 확인">
                  <h3>휴가 현황 종료</h3>
                  <p>정말로 휴가 현황 창을 종료하시겠습니까?</p>
                  <div className="leave-balance-confirm-actions">
                    <button type="button" onClick={() => setCloseConfirmOpen(false)}>취소</button>
                    <button type="button" className="leave-balance-confirm-danger" onClick={handleClose}>종료</button>
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
