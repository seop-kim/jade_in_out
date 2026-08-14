import {MouseEvent, useState} from 'react';
import {InsaWorktimeRecord} from '../../api/insaParsers';
import {InsaCalendarDay} from '../../lib/transformInsa';
import type {DetailState} from './InsaPage';

interface InsaCalendarCellProps {
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  dayData?: InsaCalendarDay;
  onSelectDay: (ymd: string) => void;
  onRequestDayDetails: (ymd: string) => void;
  detailState?: DetailState;
  disabled?: boolean;
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

function displayLeaveName(name: string, scheduleLabel: string): string {
  return name.trim().endsWith(':') ? scheduleLabel : name;
}

function TeamDetailsContent({state}: {state?: DetailState}) {
  if (!state || state.status === 'loading') {
    return <p className="insa-team-tooltip-status" role="status">팀 일정 조회 중입니다.</p>;
  }
  if (state.status === 'error') {
    return <p className="insa-team-tooltip-error" role="alert">팀 일정 조회 실패: {state.message}</p>;
  }
  if (state.details.length === 0) {
    return <p className="insa-team-tooltip-status">등록된 팀 일정이 없습니다.</p>;
  }
  return (
    <ul className="insa-team-tooltip-list insa-team-tooltip-list-right">
      {state.details.map((detail, index) => (
        <li className="insa-team-tooltip-row" key={`${detail.name}-${detail.scheduleLabel}-${index}`}>
          <span className="insa-team-tooltip-name">
            {displayLeaveName(detail.name, detail.scheduleLabel)}
            {detail.durationLabel ? ` ${detail.durationLabel}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TeamDetailsTooltip({
  id,
  state,
  pos,
  dateLabel,
  hasTeamDetails,
  worktime,
  scheduledIn,
  scheduledOut,
}: {
  id: string;
  state?: DetailState;
  pos: TooltipPos;
  dateLabel: string;
  hasTeamDetails: boolean;
  worktime?: InsaWorktimeRecord;
  scheduledIn?: string;
  scheduledOut?: string;
}) {
  return (
    <div
      className={`insa-team-tooltip ${pos.above ? 'above' : ''}`.trim()}
      id={id}
      style={{top: pos.top, left: pos.left}}
      role="tooltip"
    >
      <div className="insa-team-tooltip-header">
        <span className="insa-team-tooltip-title">근무 상세</span>
        <span className="insa-team-tooltip-date">{dateLabel}</span>
      </div>
      {(scheduledIn || scheduledOut) && (
        <div className="insa-team-tooltip-scheduled">
          <span className="insa-team-tooltip-title">예정 시간</span>
          <span className="insa-team-tooltip-scheduled-value">
            {scheduledIn || '—'}–{scheduledOut || '—'}
          </span>
        </div>
      )}
      {worktime && (
        <div className="insa-team-tooltip-worktime">
          <div className="insa-team-tooltip-worktime-row">
            <span className="insa-team-tooltip-title">출근 시간</span>
            <span className="insa-team-tooltip-worktime-value">{worktime.actualIn || '--:--'}</span>
          </div>
          <div className="insa-team-tooltip-worktime-row">
            <span className="insa-team-tooltip-title">퇴근 시간</span>
            <span className="insa-team-tooltip-worktime-value">{worktime.actualOut || '--:--'}</span>
          </div>
          {worktime.overtimeLabel && (
            <div className="insa-team-tooltip-worktime-row">
              <span className="insa-team-tooltip-title">연장 시간</span>
              <span className="insa-team-tooltip-worktime-value">{worktime.overtimeLabel}</span>
            </div>
          )}
        </div>
      )}
      {hasTeamDetails && (
        <div className="insa-team-tooltip-leave-section">
          <div className="insa-team-tooltip-list-title">연차 목록</div>
          <TeamDetailsContent state={state} />
        </div>
      )}
    </div>
  );
}

function InsaCalendarCell({
  year,
  month,
  day,
  inMonth,
  isToday,
  dayData,
  onSelectDay,
  onRequestDayDetails,
  detailState,
  disabled = false,
}: InsaCalendarCellProps) {
  const [tooltip, setTooltip] = useState<TooltipPos | null>(null);
  const ymd = formatYmd(year, month, day);
  const worktime = dayData?.worktime;
  const ownLeave = dayData?.ownLeave ?? [];
  const vacationCount = dayData?.teamSchedule?.vacationCount ?? 0;
  const timeCount = dayData?.teamSchedule?.timeCount ?? 0;
  const hasTeamDetails = vacationCount > 0 || timeCount > 0;
  const hasOwnLeave = ownLeave.length > 0 || Boolean(worktime?.leaveLabel);
  const departmentLeaveCount = vacationCount + timeCount;
  const otherLeaveCount = Math.max(0, departmentLeaveCount - (hasOwnLeave ? 1 : 0));
  const leaveBadgeLabel = hasOwnLeave
    ? otherLeaveCount > 0 ? `연차 (본인 외 ${otherLeaveCount})` : '연차 (본인)'
    : `연차 (${departmentLeaveCount})`;
  const hasLeaveBadge = hasTeamDetails || hasOwnLeave;
  const isHoliday = Boolean(worktime) && !worktime?.scheduledIn && !worktime?.scheduledOut;
  const hasActualAttendance = Boolean(worktime?.actualIn || worktime?.actualOut);
  const hasTooltipContent = hasTeamDetails || Boolean(worktime);
  const dayOfWeek = new Date(year, month, day).getDay();
  const dateLabel = `${year}년 ${month + 1}월 ${day}일`;
  const tooltipId = `insa-team-tooltip-${ymd}`;
  const cellClassName = [
    'insa-calendar-cell',
    !inMonth ? 'is-out-month' : '',
    isToday ? 'is-today' : '',
    dayOfWeek === 0 ? 'sun' : '',
    dayOfWeek === 6 ? 'sat' : '',
  ].filter(Boolean).join(' ');

  const showTooltip = (target: HTMLElement): void => {
    if (disabled || !hasTooltipContent) return;
    const cell = target.closest<HTMLElement>('.insa-calendar-cell') ?? target;
    const rect = cell.getBoundingClientRect();
    const above = rect.bottom > window.innerHeight * 0.6;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
    setTooltip({left, top: above ? rect.top - 6 : rect.bottom + 6, above});
    if (hasTeamDetails) onRequestDayDetails(ymd);
  };

  const handleMouseEnter = (event: MouseEvent<HTMLElement>): void => showTooltip(event.currentTarget);
  const handleMouseLeave = (): void => setTooltip(null);

  return (
    <article
      className={cellClassName}
      data-ymd={ymd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <header className="insa-cell-header">
        {hasTeamDetails ? (
          <button
            type="button"
            className={`insa-date-button ${isToday ? 'is-today-date' : ''}`.trim()}
            disabled={disabled}
            aria-label={`${dateLabel} 상세`}
            aria-describedby={tooltip ? tooltipId : undefined}
            onClick={() => onSelectDay(ymd)}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onBlur={handleMouseLeave}
          >
            {day}
          </button>
        ) : (
          <time
            className={`insa-date ${isToday ? 'is-today-date' : ''}`.trim()}
            dateTime={ymd}
            aria-label={dateLabel}
          >
            {day}
          </time>
        )}
        {isHoliday ? (
          <span className="insa-holiday-badge">휴일</span>
        ) : hasLeaveBadge && (
          <span className="insa-team-badge">{leaveBadgeLabel}</span>
        )}
      </header>

      <div className="insa-cell-content">
        {(!isHoliday || hasActualAttendance) && worktime && (
          <>
            <div className="insa-attendance-row">
              <span className="insa-attendance-label in">출근</span>
              <span className="insa-attendance-time">{worktime.actualIn || '--:--'}</span>
            </div>
            <div className="insa-attendance-row">
              <span className="insa-attendance-label out">퇴근</span>
              <span className="insa-attendance-time">{worktime.actualOut || '--:--'}</span>
            </div>
          </>
        )}
        {(!isHoliday || hasActualAttendance) && worktime?.overtimeLabel && (
          <div className="insa-overtime">OT {worktime.overtimeLabel}</div>
        )}

      </div>
      {tooltip && hasTooltipContent && (
        <TeamDetailsTooltip
          id={tooltipId}
          state={detailState}
          pos={tooltip}
          dateLabel={`${month + 1}/${day} (${WEEKDAY_LABELS[new Date(year, month, day).getDay()]})`}
          hasTeamDetails={hasTeamDetails}
          worktime={worktime}
          scheduledIn={worktime?.scheduledIn}
          scheduledOut={worktime?.scheduledOut}
        />
      )}
    </article>
  );
}

export default InsaCalendarCell;
