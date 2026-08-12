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
}

function isTodayDate(today: Date, year: number, month: number, day: number): boolean {
  return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
}

function InsaCalendar({year, month, today, days, onSelectDay, onRequestDayDetails, detailStates}: InsaCalendarProps) {
  const leadingDays = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((leadingDays + dayCount) / 7) * 7;

  return (
    <section className="insa-calendar-shell" aria-label={`${year}년 ${month + 1}월 달력`}>
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
            {Array.from({length: totalCells}, (_, index) => {
              const day = index - leadingDays + 1;
              if (day < 1 || day > dayCount) {
                return <div className="insa-calendar-cell is-placeholder" aria-hidden="true" key={`blank-${index}`} />;
              }
              const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return (
                <InsaCalendarCell
                  key={ymd}
                  year={year}
                  month={month}
                  day={day}
                  isToday={isTodayDate(today, year, month, day)}
                  dayData={days[ymd]}
                  onSelectDay={onSelectDay}
                  onRequestDayDetails={onRequestDayDetails}
                  detailState={detailStates[ymd]}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default InsaCalendar;
