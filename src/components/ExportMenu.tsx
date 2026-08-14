import {useEffect, useMemo, useRef, useState} from 'react';
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
}

function DownloadIcon() {
  return (
    <svg className="export-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function ExportMenu({rows, columns, minDate, maxDate, fileName, disabled = false}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setStartDate(minDate);
    setEndDate(maxDate);
    setSelectedKeys(columns.map((column) => column.key));
    setOrderedKeys(columns.map((column) => column.key));
    setError(null);
  }, [columns, maxDate, minDate]);

  useEffect(() => {
    if (!open) return undefined;

    const handleDocumentMouseDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [open]);

  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );
  const orderedColumns = orderedKeys
    .map((key) => columnsByKey.get(key))
    .filter((column): column is CsvColumn => Boolean(column));
  const selectedColumns = orderedColumns.filter((column) => selectedKeys.includes(column.key));

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
      setError('조회 기간을 확인해주세요.');
      return;
    }
    if (selectedColumns.length === 0) {
      setError('내보낼 항목을 하나 이상 선택해주세요.');
      return;
    }

    const filteredRows = filterRowsByDateRange(rows, 'date', startDate, endDate);
    downloadCsv(fileName, buildCsv(selectedColumns, filteredRows));
    setOpen(false);
  };

  const buttonDisabled = disabled || rows.length === 0 || columns.length === 0;

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        type="button"
        className="btn export-button"
        aria-label="CSV 다운로드"
        title="CSV 다운로드"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={buttonDisabled}
        onClick={() => {
          setError(null);
          setOpen((current) => !current);
        }}
      >
        <DownloadIcon />
      </button>

      {open && (
        <div className="export-popover" role="dialog" aria-label="CSV 다운로드 설정">
          <div className="export-popover-header">
            <h2 className="export-title">CSV 다운로드</h2>
            <button
              type="button"
              className="export-close-button"
              aria-label="CSV 다운로드 설정 닫기"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="export-date-fields">
            <label>
              <span>시작일</span>
              <input
                type="date"
                aria-label="시작일"
                value={startDate}
                min={minDate}
                max={maxDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>종료일</span>
              <input
                type="date"
                aria-label="종료일"
                value={endDate}
                min={minDate}
                max={maxDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

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

          {error && <p className="export-error" role="alert">{error}</p>}

          <div className="export-actions">
            <button type="button" className="btn export-cancel" onClick={() => setOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={handleDownload}>
              다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportMenu;
