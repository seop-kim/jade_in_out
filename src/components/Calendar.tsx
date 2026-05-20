import './Calendar.css';
import {dateKey} from '../lib/format';
import {AttendanceMap} from '../lib/transformAttendance';
import CalendarCell, {Cell} from './CalendarCell';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarProps {
  year: number;
  month: number;
  today: Date;
  attendance: AttendanceMap;
}

function buildCells(year: number, month: number): Cell[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLast = new Date(year, month, 0).getDate();

  const cells: Cell[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({
      year: month === 0 ? year - 1 : year,
      month: month === 0 ? 11 : month - 1,
      day: prevLast - i,
      inMonth: false,
    });
  }

  for (let d = 1; d <= lastDate; d++) {
    cells.push({year, month, day: d, inMonth: true});
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    if (!last) break;
    const next = new Date(last.year, last.month, last.day + 1);
    cells.push({
      year: next.getFullYear(),
      month: next.getMonth(),
      day: next.getDate(),
      inMonth: false,
    });
  }

  return cells;
}

function isSameDate(a: Date, year: number, month: number, day: number): boolean {
  return a.getFullYear() === year && a.getMonth() === month && a.getDate() === day;
}

function Calendar({year, month, today, attendance}: CalendarProps) {
  const cells = buildCells(year, month);

  return (
    <div className="calendar">
      <div className="calendar-weekdays">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`weekday ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, idx) => {
          const dow = idx % 7;
          const key = dateKey(cell.year, cell.month, cell.day);
          const record = cell.inMonth ? attendance[key] : undefined;
          const isToday = isSameDate(today, cell.year, cell.month, cell.day);

          return (
            <CalendarCell
              key={key + (cell.inMonth ? '' : '-out')}
              cell={cell}
              record={record}
              isToday={isToday}
              dow={dow}
            />
          );
        })}
      </div>
    </div>
  );
}

export default Calendar;
