import {MouseEvent, useState} from 'react';
import {InsaCalendarDay} from '../../lib/transformInsa';
import type {DetailState} from './InsaPage';

interface InsaCalendarCellProps {
  year: number;
  month: number;
  day: number;
  isToday: boolean;
  dayData?: InsaCalendarDay;
  onSelectDay: (ymd: string) => void;
  onRequestDayDetails: (ymd: string) => void;
  detailState?: DetailState;
}

interface TooltipPos {
  top: number;
  left: number;
  above: boolean;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function TeamDetailsTooltip({
  state,
  pos,
  dateLabel,
}: {
  state?: DetailState;
  pos: TooltipPos;
  dateLabel: string;
}) {
  return (
    <div
      className={`insa-team-tooltip ${pos.above ? 'above' : ''}`.trim()}
      style={{top: pos.top, left: pos.left}}
      role="tooltip"
    >
      <div className="insa-team-tooltip-header">
        <span className="insa-team-tooltip-title">팀 일정 상세</span>
        <span className="insa-team-tooltip-date">{dateLabel}</span>
      </div>
      {!state || state.status === 'loading' ? (
        <p className="insa-team-tooltip-status" role="status">팀 일정 조회 중입니다.</p>
      ) : state.status === 'error' ? (
        <p className="insa-team-tooltip-error" role="alert">팀 일정 조회 실패: {state.message}</p>
      ) : state.details.length === 0 ? (
        <p className="insa-team-tooltip-status">등록된 팀 일정이 없습니다.</p>
      ) : (
        <ul className="insa-team-tooltip-list">
          {state.details.map((detail, index) => (
            <li className="insa-team-tooltip-row" key={`${detail.name}-${detail.scheduleLabel}-${index}`}>
              <span className="insa-team-tooltip-name">{detail.name}</span>
              <span className="insa-team-tooltip-meta">
                <span>{detail.scheduleLabel}</span>
                {detail.durationLabel && <span className="insa-team-tooltip-duration">{detail.durationLabel}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsaCalendarCell({
  year,
  month,
  day,
  isToday,
  dayData,
  onSelectDay,
  onRequestDayDetails,
  detailState,
}: InsaCalendarCellProps) {
  const [tooltip, setTooltip] = useState<TooltipPos | null>(null);
  const ymd = formatYmd(year, month, day);
  const worktime = dayData?.worktime;
  const ownLeave = dayData?.ownLeave ?? [];
  const vacationCount = dayData?.teamSchedule?.vacationCount ?? 0;
  const timeCount = dayData?.teamSchedule?.timeCount ?? 0;
  const hasTeamDetails = vacationCount > 0 || timeCount > 0;
  const dateLabel = `${year}년 ${month + 1}월 ${day}일`;

  const showTooltip = (target: HTMLElement): void => {
    if (!hasTeamDetails) return;
    const cell = target.closest<HTMLElement>('.insa-calendar-cell') ?? target;
    const rect = cell.getBoundingClientRect();
    const above = rect.bottom > window.innerHeight * 0.6;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
    setTooltip({left, top: above ? rect.top - 6 : rect.bottom + 6, above});
    onRequestDayDetails(ymd);
  };

  const handleMouseEnter = (event: MouseEvent<HTMLElement>): void => showTooltip(event.currentTarget);
  const handleMouseLeave = (): void => setTooltip(null);

  return (
    <article
      className={`insa-calendar-cell ${isToday ? 'is-today' : ''}`}
      data-ymd={ymd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <header className="insa-cell-header">
        {hasTeamDetails ? (
          <button
            type="button"
            className="insa-date-button"
            aria-label={`${dateLabel} 상세`}
            onClick={() => onSelectDay(ymd)}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={handleMouseLeave}
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
      {tooltip && hasTeamDetails && (
        <TeamDetailsTooltip
          state={detailState}
          pos={tooltip}
          dateLabel={`${month + 1}/${day} (${WEEKDAY_LABELS[new Date(year, month, day).getDay()]})`}
        />
      )}
    </article>
  );
}

export default InsaCalendarCell;
