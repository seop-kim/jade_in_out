import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  buildCsv,
  CsvColumn,
  CsvRow,
  downloadCsv,
  filterRowsByDateRange,
} from '../lib/csvExport';
import './ExportMenu.css';

interface ExportMenuProps {
  rows: CsvRow[];
  columns: CsvColumn[];
  minDate: string;
  maxDate: string;
  fileName: string;
  disabled?: boolean;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type RangeStep = 'start' | 'end';

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
  if (!value) return '';
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

function ExportMenu({
  rows,
  columns,
  minDate,
  maxDate,
  fileName,
  disabled = false,
  hideTrigger = false,
  open,
  onOpenChange,
}: ExportMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeStep, setRangeStep] = useState<RangeStep>('start');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isControlled = open !== undefined;
  const isOpen = open ?? internalOpen;
  const setIsOpen = useCallback((nextOpen: boolean): void => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [isControlled, onOpenChange]);

  useEffect(() => {
    setStartDate('');
    setEndDate('');
    setRangeStep('start');
    setSelectedKeys(columns.map((column) => column.key));
    setOrderedKeys(columns.map((column) => column.key));
    setError(null);
  }, [columns, maxDate, minDate]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleDocumentMouseDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isOpen, setIsOpen]);

  const calendarDays = useMemo(() => {
    const firstDay = parseDate(minDate);
    const dayCount = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
    const emptyCells: Array<string | null> = Array.from({length: firstDay.getDay()}, () => null);
    const dates = Array.from({length: dayCount}, (_, index) => {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1);
      return toDateKey(date);
    });
    return [...emptyCells, ...dates];
  }, [minDate]);

  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );
  const orderedColumns = orderedKeys
    .map((key) => columnsByKey.get(key))
    .filter((column): column is CsvColumn => Boolean(column));
  const selectedColumns = orderedColumns.filter((column) => selectedKeys.includes(column.key));
  const filteredRows = startDate && endDate
    ? filterRowsByDateRange(rows, 'date', startDate, endDate)
    : [];

  const selectDate = (date: string): void => {
    if (date < minDate || date > maxDate) return;
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

  const toggleColumn = (key: string): void => {
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
    setError(null);
  };

  const moveColumn = (key: string, offset: -1 | 1): void => {
    setOrderedKeys((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved !== undefined) next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const handleDownload = (): void => {
    if (!startDate || !endDate || startDate > endDate) {
      setError('먼저 달력에서 시작일과 종료일을 선택해주세요.');
      return;
    }
    if (selectedColumns.length === 0) {
      setError('내보낼 항목을 하나 이상 선택해주세요.');
      return;
    }

    downloadCsv(fileName, buildCsv(selectedColumns, filteredRows));
    setIsOpen(false);
  };

  const buttonDisabled = disabled || rows.length === 0 || columns.length === 0;

  return (
    <div className="export-menu" ref={containerRef}>
      {!hideTrigger && (
        <button
          type="button"
          className="btn export-button"
          aria-label="CSV 다운로드"
          title="CSV 다운로드"
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
        <div
          className="export-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div className="export-dialog" role="dialog" aria-modal="true" aria-label="CSV 다운로드 설정">
            <div className="export-popover-header">
              <div>
                <h2 className="export-title">파일 저장</h2>
                <p className="export-dialog-description">기간과 항목을 선택한 뒤 CSV 파일로 저장합니다.</p>
              </div>
              <button
                type="button"
                className="export-close-button"
                aria-label="CSV 다운로드 설정 닫기"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="export-settings-grid">
              <div className="export-date-picker-section">
              <div className="export-date-picker-heading">
                <div>
                  <strong>조회 기간</strong>
                  <span>첫 번째 날짜는 시작일, 두 번째 날짜는 종료일입니다.</span>
                </div>
                <div className="export-date-step-indicator" aria-label="기간 선택 단계">
                  <span className={rangeStep === 'start' ? 'is-active' : ''}>1 시작일</span>
                  <span className={rangeStep === 'end' ? 'is-active' : ''}>2 종료일</span>
                </div>
              </div>
              <div className="export-date-selection-status">
                <div className={`export-date-selection ${startDate ? 'is-selected' : ''}`}>
                  <span className="export-date-selection-label">시작일</span>
                  <strong>{startDate ? dateLabel(startDate) : '시작일을 선택하세요'}</strong>
                </div>
                <span className="export-date-arrow" aria-hidden="true">→</span>
                <div className={`export-date-selection ${endDate ? 'is-selected' : ''}`}>
                  <span className="export-date-selection-label">종료일</span>
                  <strong>{endDate ? dateLabel(endDate) : '종료일을 선택하세요'}</strong>
                </div>
              </div>

              <p className="export-date-instruction" role="status">
                {rangeStep === 'start' ? '달력에서 시작일을 선택하세요.' : '달력에서 종료일을 선택하세요.'}
              </p>
              <div className="export-calendar" aria-label="다운로드 기간 선택">
                <div className="export-calendar-title">
                  {parseDate(minDate).getFullYear()}년 {parseDate(minDate).getMonth() + 1}월
                </div>
                <div className="export-calendar-weekdays" aria-hidden="true">
                  {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <span key={weekday}>{weekday}</span>)}
                </div>
                <div className="export-calendar-grid">
                  {calendarDays.map((date, index) => date ? (
                    <button
                      type="button"
                      className={`export-calendar-day ${date === startDate ? 'is-start' : ''} ${date === endDate ? 'is-end' : ''} ${startDate && endDate && date > startDate && date < endDate ? 'is-in-range' : ''}`}
                      aria-label={dateButtonLabel(date)}
                      aria-pressed={date === startDate || date === endDate}
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
                  {orderedColumns.map((column, index) => (
                    <div className="export-column-row" key={column.key}>
                      <label className="export-column-check">
                        <input
                          type="checkbox"
                          aria-label={`${column.label} 포함`}
                          checked={selectedKeys.includes(column.key)}
                          onChange={() => toggleColumn(column.key)}
                        />
                        <span data-testid="export-column-label">{column.label}</span>
                      </label>
                      <span className="export-column-actions">
                        <button
                          type="button"
                          className="export-move-button"
                          aria-label={`${column.label} 위로 이동`}
                          disabled={index === 0}
                          onClick={() => moveColumn(column.key, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="export-move-button"
                          aria-label={`${column.label} 아래로 이동`}
                          disabled={index === orderedColumns.length - 1}
                          onClick={() => moveColumn(column.key, 1)}
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="export-preview-section" aria-label="CSV 미리보기">
              <div className="export-preview-heading">
                <span>미리보기</span>
                <span className="export-columns-hint">{startDate && endDate ? `${filteredRows.length}건` : '기간 선택 후 표시됩니다'}</span>
              </div>
              {startDate && endDate ? (
                <div className="export-preview-scroll">
                  <table className="export-preview-table">
                    <colgroup>
                      {selectedColumns.map((column) => <col className={columnClassName(column.key)} key={column.key} />)}
                    </colgroup>
                    <thead>
                      <tr>{selectedColumns.map((column) => <th className={columnClassName(column.key)} key={column.key} scope="col">{column.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredRows.length > 0 ? filteredRows.map((row, rowIndex) => (
                        <tr key={`${String(row.date)}-${rowIndex}`}>
                          {selectedColumns.map((column) => <td className={columnClassName(column.key)} key={column.key}>{cellText(row[column.key])}</td>)}
                        </tr>
                      )) : (
                        <tr><td className="export-preview-empty" colSpan={selectedColumns.length}>선택한 기간에 데이터가 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : <p className="export-preview-empty">기간을 선택하면 미리보기가 표시됩니다.</p>}
            </div>

            {error && <p className="export-error" role="alert">{error}</p>}

            <div className="export-actions">
              <button type="button" className="btn export-cancel" onClick={() => setIsOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownload}
                disabled={!startDate || !endDate || selectedColumns.length === 0}
              >
                파일 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportMenu;
