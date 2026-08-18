import {DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  CsvColumn,
  CsvRow,
  buildExportFileName,
  downloadExcel,
  ExportColumnWidths,
  filterRowsByDateRange,
} from '../lib/csvExport';
import MonthPicker from './MonthPicker';
import './ExportMenu.css';

interface ExportMenuProps {
  rows: CsvRow[];
  columns: CsvColumn[];
  minDate: string;
  maxDate: string;
  fileName: string;
  initialDate?: string;
  disabled?: boolean;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRangeDataRequest?: (startDate: string, endDate: string, signal?: AbortSignal) => Promise<CsvRow[]>;
}

type RangeStep = 'start' | 'end';
type ExportProgressPhase = 'loading' | 'creating' | 'complete' | 'error';

interface ExportProgressState {
  phase: ExportProgressPhase;
  progress: number;
}

function DownloadIcon() {
  return (
    <svg className="export-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateLabel(value: string): string {
  const date = parseDate(value);
  return `${date.getFullYear()}. ${pad(date.getMonth() + 1)}. ${pad(date.getDate())}`;
}

function dateButtonLabel(value: string): string {
  const date = parseDate(value);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function cellText(value: CsvRow[string]): string {
  return value === null || value === undefined ? '' : String(value);
}

function columnClassName(key: string): string {
  if (key === 'date') return 'export-preview-column-date';
  if (key === 'workType') return 'export-preview-column-work-type';
  if (key === 'workList') return 'export-preview-column-work-list';
  return '';
}

const MIN_EXPORT_COLUMN_WIDTH = 90;
const MAX_EXPORT_COLUMN_WIDTH = 600;
const DEFAULT_EXPORT_COLUMN_WIDTHS: Record<string, number> = {
  date: 140,
  weekday: 90,
  workDay: 90,
  holiday: 140,
  departmentLeave: 170,
  departmentTime: 170,
  workType: 160,
  clockIn: 120,
  clockOut: 120,
  scheduledIn: 150,
  scheduledOut: 150,
  actualIn: 120,
  actualOut: 120,
  vacation: 180,
  leave: 220,
  overtime: 140,
  correctionIn: 140,
  correctionOut: 140,
  correctionStatus: 140,
  dayOffWork: 140,
  remoteWork: 140,
  note: 260,
  workList: 360,
  status: 140,
};

function defaultColumnWidth(key: string): number {
  return DEFAULT_EXPORT_COLUMN_WIDTHS[key] ?? 160;
}

const PREVIEW_ROWS: CsvRow[] = [
  {
    date: '2026-08-05',
    weekday: '수',
    workDay: '(수)',
    workType: '기본근무',
    clockIn: '09:00',
    clockOut: '18:00',
    scheduledIn: '09:00',
    scheduledOut: '18:00',
    actualIn: '08:51',
    actualOut: '18:00',
    vacation: '',
    leave: '',
    overtime: '2시간',
    workList: '연장 2시간 (18:00~20:00)',
    departmentLeave: '연차 (2)',
    departmentTime: '',
    status: '정상',
  },
  {
    date: '2026-08-06',
    weekday: '목',
    workDay: '(목)',
    workType: '기본근무',
    clockIn: '09:00',
    clockOut: '18:00',
    scheduledIn: '09:00',
    scheduledOut: '18:00',
    actualIn: '09:02',
    actualOut: '18:00',
    vacation: '',
    leave: '',
    overtime: '',
    workList: '',
    departmentLeave: '',
    departmentTime: '',
    status: '정상',
  },
];

function ExportMenu({
  rows,
  columns,
  minDate,
  maxDate,
  fileName,
  initialDate,
  disabled = false,
  hideTrigger = false,
  open,
  onOpenChange,
  onRangeDataRequest,
}: ExportMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeStep, setRangeStep] = useState<RangeStep>('start');
  const [calendarYear, setCalendarYear] = useState(() => parseDate(initialDate ?? minDate).getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => parseDate(initialDate ?? minDate).getMonth());
  const calendarToday = useMemo(() => new Date(), []);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [columnWidths, setColumnWidths] = useState<ExportColumnWidths>(() => Object.fromEntries(
    columns.map((column) => [column.key, defaultColumnWidth(column.key)]),
  ));
  const [error, setError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const exportOperationRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const isControlled = open !== undefined;
  const isOpen = open ?? internalOpen;
  const setIsOpen = useCallback((nextOpen: boolean): void => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [isControlled, onOpenChange]);

  const cancelExport = useCallback((): void => {
    exportOperationRef.current += 1;
    exportControllerRef.current?.abort();
    exportControllerRef.current = null;
    setRangeLoading(false);
    setError(null);
    setExportProgress(null);
  }, []);

  useEffect(() => {
    setStartDate('');
    setEndDate('');
    setRangeStep('start');
    const nextCalendarDate = parseDate(initialDate ?? minDate);
    setCalendarYear(nextCalendarDate.getFullYear());
    setCalendarMonth(nextCalendarDate.getMonth());
    setRangeLoading(false);
    setSelectedKeys(columns.map((column) => column.key));
    setOrderedKeys(columns.map((column) => column.key));
    setColumnWidths((current) => Object.fromEntries(
      columns.map((column) => [column.key, current[column.key] ?? defaultColumnWidth(column.key)]),
    ));
    setError(null);
  }, [columns, initialDate, maxDate, minDate]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (exportProgress) cancelExport();
      else setIsOpen(false);
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [cancelExport, exportProgress, isOpen, setIsOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [isOpen]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const dayCount = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const emptyCells: Array<string | null> = Array.from({length: firstDay.getDay()}, () => null);
    const dates = Array.from({length: dayCount}, (_, index) => {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1);
      return toDateKey(date);
    });
    return [...emptyCells, ...dates];
  }, [calendarMonth, calendarYear]);

  const minCalendarDate = parseDate(minDate);
  const maxCalendarDate = parseDate(maxDate);
  const minMonthValue = minCalendarDate.getFullYear() * 12 + minCalendarDate.getMonth();
  const maxMonthValue = maxCalendarDate.getFullYear() * 12 + maxCalendarDate.getMonth();
  const calendarMonthValue = calendarYear * 12 + calendarMonth;

  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );
  const orderedColumns = orderedKeys
    .map((key) => columnsByKey.get(key))
    .filter((column): column is CsvColumn => Boolean(column));
  const selectedColumns = orderedColumns.filter((column) => selectedKeys.includes(column.key));

  const selectDate = (date: string): void => {
    if (rangeLoading || date < minDate || date > maxDate) return;
    setError(null);

    if (rangeStep === 'start' || !startDate) {
      setStartDate(date);
      setEndDate('');
      setRangeStep('end');
      return;
    }

    if (date < startDate) {
      setStartDate(date);
      setEndDate('');
      setRangeStep('end');
      return;
    }

    setEndDate(date);
    setRangeStep('start');
  };

  const clearDateRange = (): void => {
    setStartDate('');
    setEndDate('');
    setRangeStep('start');
    setError(null);
  };

  const toggleColumn = (key: string): void => {
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
    setError(null);
  };

  const reorderColumn = (sourceKey: string, targetKey: string): void => {
    setOrderedKeys((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      const targetIndex = current.indexOf(targetKey);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (moved !== undefined) {
        const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        next.splice(insertIndex, 0, moved);
      }
      return next;
    });
  };

  const handleDragStart = (event: DragEvent<HTMLSpanElement>, key: string): void => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
    }
    setDraggedColumnKey(key);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetKey: string): void => {
    event.preventDefault();
    const sourceKey = draggedColumnKey || event.dataTransfer?.getData('text/plain') || '';
    if (sourceKey) reorderColumn(sourceKey, targetKey);
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  };

  const handleColumnResizeStart = (event: ReactMouseEvent<HTMLSpanElement>, key: string): void => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const startWidth = columnWidths[key] ?? defaultColumnWidth(key);
    const startX = event.clientX;
    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const nextWidth = Math.min(
        MAX_EXPORT_COLUMN_WIDTH,
        Math.max(MIN_EXPORT_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX),
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

  const handleColumnResizeKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>, key: string): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 10 : -10;
    setColumnWidths((current) => ({
      ...current,
      [key]: Math.min(
        MAX_EXPORT_COLUMN_WIDTH,
        Math.max(MIN_EXPORT_COLUMN_WIDTH, (current[key] ?? defaultColumnWidth(key)) + step),
      ),
    }));
  };

  const handleDownload = async (): Promise<void> => {
    if (!startDate || !endDate || startDate > endDate) {
      setError('먼저 달력에서 시작일과 종료일을 선택해주세요.');
      return;
    }
    if (selectedColumns.length === 0) {
      setError('내보낼 항목을 하나 이상 선택해주세요.');
      return;
    }

    const controller = new AbortController();
    const operationId = exportOperationRef.current + 1;
    exportOperationRef.current = operationId;
    exportControllerRef.current = controller;
    setError(null);
    setRangeLoading(true);
    setExportProgress({phase: 'loading', progress: 25});

    try {
      const nextRows = onRangeDataRequest
        ? await onRangeDataRequest(startDate, endDate, controller.signal)
        : filterRowsByDateRange(rows, 'date', startDate, endDate);
      if (controller.signal.aborted || operationId !== exportOperationRef.current) return;

      setExportProgress({phase: 'creating', progress: 75});
      const filteredExportRows = filterRowsByDateRange(nextRows, 'date', startDate, endDate);
      downloadExcel(buildExportFileName(fileName, startDate, endDate), selectedColumns, filteredExportRows, columnWidths);
      if (controller.signal.aborted || operationId !== exportOperationRef.current) return;

      clearDateRange();
      setExportProgress({phase: 'complete', progress: 100});
      window.setTimeout(() => {
        if (operationId !== exportOperationRef.current) return;
        setExportProgress(null);
        setIsOpen(false);
      }, 700);
    } catch {
      if (controller.signal.aborted || operationId !== exportOperationRef.current) return;
      setError('선택한 기간의 데이터를 조회하지 못했습니다.');
      setExportProgress({phase: 'error', progress: 100});
    } finally {
      if (exportControllerRef.current === controller) exportControllerRef.current = null;
      if (operationId === exportOperationRef.current && !controller.signal.aborted) setRangeLoading(false);
    }
  };

  const buttonDisabled = disabled || rangeLoading || (rows.length === 0 && !onRangeDataRequest) || columns.length === 0;

  return (
    <div className="export-menu">
      {!hideTrigger && (
        <button
          type="button"
          className="btn export-button"
          aria-label="엑셀 다운로드"
          title="엑셀 다운로드"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          disabled={buttonDisabled}
          onClick={() => {
            setError(null);
            setIsOpen(!isOpen);
          }}
        >
          <DownloadIcon />
        </button>
      )}

      {isOpen && (
        <div className="export-modal-backdrop">
          <div className="export-dialog" role="dialog" aria-modal="true" aria-label="엑셀 다운로드 설정">
            <div className="export-popover-header">
              <div>
                <h2 className="export-title">파일 저장</h2>
                <p className="export-dialog-description">기간과 항목을 선택한 뒤 Excel 파일로 저장합니다.</p>
              </div>
              <button
                type="button"
                className="export-close-button"
                aria-label="엑셀 다운로드 설정 닫기"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="export-settings-grid">
              <div className="export-date-picker-section export-date-picker-panel">
              <div className="export-date-picker-heading">
                <div>
                  <strong>조회 기간</strong>
                  <span>첫 번째 날짜는 시작일, 두 번째 날짜는 종료일입니다.</span>
                </div>
                <div
                  className="export-date-range-display"
                  data-testid="export-date-range-display"
                  aria-label="선택한 기간"
                >
                  <span className={`export-date-range-value ${startDate ? 'is-selected' : ''}`}>
                    {startDate ? dateLabel(startDate) : '시작일'}
                  </span>
                  <span className="export-date-range-arrow" aria-hidden="true">→</span>
                  <span className={`export-date-range-value ${endDate ? 'is-selected' : ''}`}>
                    {endDate ? dateLabel(endDate) : '종료일'}
                  </span>
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      className="export-date-range-clear"
                      aria-label="선택한 기간 초기화"
                      onClick={clearDateRange}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="export-calendar" aria-label="다운로드 기간 선택">
                <div className="export-calendar-toolbar">
                  <button
                    type="button"
                    className="btn"
                    aria-label="이전 달"
                    disabled={rangeLoading || calendarMonthValue <= minMonthValue}
                    onClick={() => {
                      const previous = new Date(calendarYear, calendarMonth - 1, 1);
                      setCalendarYear(previous.getFullYear());
                      setCalendarMonth(previous.getMonth());
                    }}
                  >
                    ‹
                  </button>
                  <MonthPicker
                    viewYear={calendarYear}
                    viewMonth={calendarMonth}
                    today={calendarToday}
                    disabled={rangeLoading}
                    minMonth={{year: minCalendarDate.getFullYear(), month: minCalendarDate.getMonth()}}
                    maxMonth={{year: maxCalendarDate.getFullYear(), month: maxCalendarDate.getMonth()}}
                    onSelect={(year, month) => {
                      setCalendarYear(year);
                      setCalendarMonth(month);
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    aria-label="다음 달"
                    disabled={rangeLoading || calendarMonthValue >= maxMonthValue}
                    onClick={() => {
                      const next = new Date(calendarYear, calendarMonth + 1, 1);
                      setCalendarYear(next.getFullYear());
                      setCalendarMonth(next.getMonth());
                    }}
                  >
                    ›
                  </button>
                </div>
                <div className="export-calendar-weekdays" aria-hidden="true">
                  {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <span key={weekday}>{weekday}</span>)}
                </div>
                <div className="export-calendar-grid">
                  {calendarDays.map((date, index) => date ? (
                    <button
                      type="button"
                      className={`export-calendar-day ${date === toDateKey(calendarToday) ? 'is-today' : ''} ${date === startDate ? 'is-start' : ''} ${date === endDate ? 'is-end' : ''} ${startDate && endDate && date > startDate && date < endDate ? 'is-in-range' : ''}`}
                      aria-label={dateButtonLabel(date)}
                      aria-pressed={date === startDate || date === endDate}
                      disabled={rangeLoading || date < minDate || date > maxDate}
                      key={date}
                      onClick={() => selectDate(date)}
                    >
                      {Number(date.slice(-2))}
                    </button>
                  ) : <span className="export-calendar-empty" key={`empty-${index}`} />)}
                </div>
              </div>
              </div>

              <div className="export-columns-panel">
                <div className="export-columns-heading">
                  <span>내보낼 항목</span>
                  <span className="export-columns-hint">순서대로 저장됩니다</span>
                </div>
                <div className="export-column-list">
                  {orderedColumns.map((column) => (
                    <div
                      className={`export-column-row ${draggedColumnKey === column.key ? 'is-dragging' : ''} ${dragOverColumnKey === column.key && draggedColumnKey !== column.key ? 'is-drag-over' : ''}`}
                      data-testid={`export-column-row-${column.key}`}
                      key={column.key}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (draggedColumnKey !== column.key) setDragOverColumnKey(column.key);
                      }}
                      onDrop={(event) => handleDrop(event, column.key)}
                    >
                      <label className="export-column-check">
                        <input
                          type="checkbox"
                          aria-label={`${column.label} 포함`}
                          checked={selectedKeys.includes(column.key)}
                          onChange={() => toggleColumn(column.key)}
                        />
                        <span data-testid="export-column-label">{column.label}</span>
                      </label>
                      <span
                        className="export-drag-handle"
                        role="button"
                        tabIndex={0}
                        draggable
                        aria-label={`${column.label} 순서 변경`}
                        onDragStart={(event) => handleDragStart(event, column.key)}
                        onDragEnd={() => {
                          setDraggedColumnKey(null);
                          setDragOverColumnKey(null);
                        }}
                      >
                        <span aria-hidden="true">⠿</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="export-preview-section" aria-label="Excel 미리보기 예시">
              <div className="export-preview-heading">
                <span>미리보기 예시</span>
                <span className="export-columns-hint">실제 조회 결과는 파일 저장 시 반영됩니다</span>
              </div>
              <div className="export-preview-scroll">
                <table className="export-preview-table">
                  <colgroup>
                    {selectedColumns.map((column) => (
                      <col
                        className={columnClassName(column.key)}
                        key={column.key}
                        style={{width: `${columnWidths[column.key] ?? defaultColumnWidth(column.key)}px`}}
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>{selectedColumns.map((column) => {
                      const width = columnWidths[column.key] ?? defaultColumnWidth(column.key);
                      return (
                        <th className={columnClassName(column.key)} key={column.key} scope="col" style={{width: `${width}px`}}>
                          <span>{column.label}</span>
                          <span
                            className="export-preview-resizer"
                            role="separator"
                            tabIndex={0}
                            aria-label={`${column.label} 너비 조절`}
                            aria-orientation="vertical"
                            aria-valuemin={MIN_EXPORT_COLUMN_WIDTH}
                            aria-valuemax={MAX_EXPORT_COLUMN_WIDTH}
                            aria-valuenow={width}
                            onMouseDown={(event) => handleColumnResizeStart(event, column.key)}
                            onKeyDown={(event) => handleColumnResizeKeyDown(event, column.key)}
                          />
                        </th>
                      );
                    })}</tr>
                  </thead>
                  <tbody>
                    {PREVIEW_ROWS.map((row, rowIndex) => (
                      <tr key={`${String(row.date)}-${rowIndex}`}>
                        {selectedColumns.map((column) => (
                          <td
                            className={columnClassName(column.key)}
                            key={column.key}
                            style={{width: `${columnWidths[column.key] ?? defaultColumnWidth(column.key)}px`}}
                          >
                            {cellText(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <p className="export-error" role="alert">{error}</p>}

            <div className="export-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownload}
                disabled={buttonDisabled || !startDate || !endDate || selectedColumns.length === 0}
              >
                파일 저장
              </button>
            </div>
          </div>
          {exportProgress && (
            <div className="export-progress-backdrop">
              <div className="export-progress-dialog" role="dialog" aria-modal="true" aria-label="다운로드 진행 상황">
                <div className="export-progress-heading">
                  <strong>파일 저장 중</strong>
                  <span>{exportProgress.progress}%</span>
                </div>
                <div
                  className="export-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={exportProgress.progress}
                >
                  <span style={{width: `${exportProgress.progress}%`}} />
                </div>
                <p className="export-progress-message" role="status">
                  {exportProgress.phase === 'loading' && '선택한 기간의 데이터를 조회하고 있습니다.'}
                  {exportProgress.phase === 'creating' && '파일을 생성하고 있습니다.'}
                  {exportProgress.phase === 'complete' && '다운로드가 완료되었습니다.'}
                  {exportProgress.phase === 'error' && '다운로드에 실패했습니다.'}
                </p>
                {(exportProgress.phase === 'loading' || exportProgress.phase === 'creating') && (
                  <button type="button" className="btn export-progress-cancel" onClick={cancelExport}>
                    다운로드 취소
                  </button>
                )}
                {exportProgress.phase === 'error' && (
                  <button type="button" className="btn export-progress-cancel" onClick={cancelExport}>
                    닫기
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ExportMenu;
