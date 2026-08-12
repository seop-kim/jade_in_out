import {InsaCalendarDay} from '../../lib/transformInsa';

interface InsaCalendarCellProps {
  year: number;
  month: number;
  day: number;
  isToday: boolean;
  dayData?: InsaCalendarDay;
  onSelectDay: (ymd: string) => void;
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function InsaCalendarCell({
  year,
  month,
  day,
  isToday,
  dayData,
  onSelectDay,
}: InsaCalendarCellProps) {
  const ymd = formatYmd(year, month, day);
  const worktime = dayData?.worktime;
  const ownLeave = dayData?.ownLeave ?? [];
  const vacationCount = dayData?.teamSchedule?.vacationCount ?? 0;
  const timeCount = dayData?.teamSchedule?.timeCount ?? 0;
  const hasTeamDetails = vacationCount > 0 || timeCount > 0;
  const dateLabel = `${year}년 ${month + 1}월 ${day}일`;

  return (
    <article className={`insa-calendar-cell ${isToday ? 'is-today' : ''}`} data-ymd={ymd}>
      <header className="insa-cell-header">
        {hasTeamDetails ? (
          <button
            type="button"
            className="insa-date-button"
            aria-label={`${dateLabel} 상세`}
            onClick={() => onSelectDay(ymd)}
          >
            {day}
          </button>
        ) : (
          <time className="insa-date" dateTime={ymd} aria-label={dateLabel}>{day}</time>
        )}
      </header>

      <div className="insa-cell-content">
        {ownLeave.length > 0 ? ownLeave.map((leave, index) => (
          <div className="insa-own-leave" key={`${leave.type}-${leave.durationLabel}-${index}`}>
            {leave.type}{leave.durationLabel ? ` ${leave.durationLabel}` : ''}
          </div>
        )) : worktime?.leaveLabel ? (
          <div className="insa-own-leave is-fallback">{worktime.leaveLabel}</div>
        ) : null}

        {worktime?.actualIn && <div className="insa-attendance">출근 {worktime.actualIn}</div>}
        {worktime?.actualOut && <div className="insa-attendance">퇴근 {worktime.actualOut}</div>}
        {(worktime?.scheduledIn || worktime?.scheduledOut) && (
          <div className="insa-planned-time">
            예정 {worktime.scheduledIn || '—'}–{worktime.scheduledOut || '—'}
          </div>
        )}
        {worktime?.overtimeLabel && <div className="insa-overtime">OT {worktime.overtimeLabel}</div>}

        {(vacationCount > 0 || timeCount > 0) && (
          <div className="insa-team-counts" aria-label="팀 일정 수">
            {vacationCount > 0 && <span className="insa-team-badge vacation">팀 휴가 {vacationCount}</span>}
            {timeCount > 0 && <span className="insa-team-badge time">팀 시간 {timeCount}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

export default InsaCalendarCell;
