import {useEffect, useRef, useState} from 'react';
import {pad} from '../lib/format';

interface MonthPickerProps {
  viewYear: number;
  viewMonth: number;
  today: Date;
  disabled?: boolean;
  minMonth?: {year: number; month: number};
  maxMonth?: {year: number; month: number};
  onSelect: (year: number, month: number) => void;
}

function monthValue(year: number, month: number): number {
  return year * 12 + month;
}

function MonthPicker({
  viewYear,
  viewMonth,
  today,
  disabled,
  minMonth,
  maxMonth,
  onSelect,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(viewYear);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minMonthValue = minMonth ? monthValue(minMonth.year, minMonth.month) : Number.NEGATIVE_INFINITY;
  const maxMonthValue = maxMonth ? monthValue(maxMonth.year, maxMonth.month) : Number.POSITIVE_INFINITY;

  const openPicker = (): void => {
    setPickerYear(viewYear);
    setOpen(true);
  };
  const closePicker = (): void => setOpen(false);

  const selectMonth = (month: number): void => {
    onSelect(pickerYear, month);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="month-picker" ref={containerRef}>
      <button
        type="button"
        className="month-title month-title-btn"
        onClick={open ? closePicker : openPicker}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {viewYear}년 {pad(viewMonth + 1)}월
      </button>
      {open && (
        <div className="month-picker-popover" role="dialog">
          <div className="month-picker-year">
            <button
              type="button"
              className="btn"
              onClick={() => setPickerYear((y) => y - 1)}
              aria-label="이전 연도"
              disabled={disabled || monthValue(pickerYear - 1, 11) < minMonthValue}
            >
              ‹
            </button>
            <span className="month-picker-year-label">{pickerYear}년</span>
            <button
              type="button"
              className="btn"
              onClick={() => setPickerYear((y) => y + 1)}
              aria-label="다음 연도"
              disabled={disabled || monthValue(pickerYear + 1, 0) > maxMonthValue}
            >
              ›
            </button>
          </div>
          <div className="month-picker-grid">
            {Array.from({length: 12}, (_, i) => {
              const isCurrent = pickerYear === viewYear && i === viewMonth;
              const isToday =
                pickerYear === today.getFullYear() && i === today.getMonth();
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    'month-picker-cell',
                    isCurrent ? 'is-current' : '',
                    isToday ? 'is-today' : '',
                  ].join(' ').trim()}
                  onClick={() => selectMonth(i)}
                  disabled={disabled || monthValue(pickerYear, i) < minMonthValue || monthValue(pickerYear, i) > maxMonthValue}
                >
                  {i + 1}월
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default MonthPicker;
