import {InsaCalendarMap} from '../../lib/transformInsa';
import type {DetailState} from './InsaPage';
import InsaCalendarCell from './InsaCalendarCell';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface InsaCalendarProps {
  year: number;
  month: number;
  today: Date;
  days: InsaCalendarMap;
  onSelectDay: (ymd: string) => void;
  onRequestDayDetails: (ymd: string) => void;
  detailStates: Record<string, DetailState>;
  loading?: boolean;
}

function isTodayDate(today: Date, year: number, month: number, day: number): boolean {
  return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
}

interface CalendarCellDate {
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
}

function buildCalendarCells(year: number, month: number): CalendarCellDate[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const previousMonthLastDate = new Date(year, month, 0).getDate();
  const cells: CalendarCellDate[] = [];

  for (let offset = firstDay - 1; offset >= 0; offset -= 1) {
    const date = new Date(year, month - 1, previousMonthLastDate - offset);
    cells.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      inMonth: false,
    });
  }

  for (let day = 1; day <= lastDate; day += 1) {
    cells.push({year, month, day, inMonth: true});
  }

  while (cells.length % 7 !== 0) {
    const previous = cells[cells.length - 1];
    if (!previous) break;
    const date = new Date(previous.year, previous.month, previous.day + 1);
    cells.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      inMonth: false,
    });
  }

  return cells;
}

function InsaCalendar({
  year,
  month,
  today,
  days,
  onSelectDay,
  onRequestDayDetails,
  detailStates,
  loading = false,
}: InsaCalendarProps) {
  const cells = buildCalendarCells(year, month);

  return (
    <section
      className={`insa-calendar-shell ${loading ? 'is-loading' : ''}`.trim()}
      aria-label={`${year}년 ${month + 1}월 달력`}
      aria-busy={loading}
    >
      <div className="insa-calendar-scroll">
        <div className="insa-calendar">
          <div className="insa-calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday, index) => (
              <div
                key={weekday}
                className={`insa-weekday ${index === 0 ? 'sun' : ''} ${index === 6 ? 'sat' : ''}`.trim()}
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className="insa-calendar-grid">
            {cells.map((cell) => {
              const ymd = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
              return (
                <InsaCalendarCell
                  key={ymd}
                  year={cell.year}
                  month={cell.month}
                  day={cell.day}
                  inMonth={cell.inMonth}
                  isToday={isTodayDate(today, cell.year, cell.month, cell.day)}
                  dayData={cell.inMonth ? days[ymd] : undefined}
                  onSelectDay={onSelectDay}
                  onRequestDayDetails={onRequestDayDetails}
                  detailState={detailStates[ymd]}
                  disabled={loading}
                />
              );
            })}
          </div>
        </div>
      </div>
      {loading && (
        <div className="insa-calendar-loading-overlay" role="status" aria-live="polite">
          <div className="insa-calendar-loading-indicator">
            <span className="insa-calendar-loading-spinner" aria-hidden="true" />
            <span>데이터를 불러오는 중입니다.</span>
          </div>
        </div>
      )}
    </section>
  );
}

export default InsaCalendar;
