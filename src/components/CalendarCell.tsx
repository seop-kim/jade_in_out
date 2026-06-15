import {MouseEvent, useState} from 'react';
import {WorkListRow} from '../api/jadeApi';
import {DisplayRecord, DisplayWork} from '../lib/transformAttendance';

export interface Cell {
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
}

interface CalendarCellProps {
  cell: Cell;
  record: DisplayRecord | undefined;
  isToday: boolean;
  dow: number;
}

interface CellTag {
  kind: 'holiday' | 'vacation' | 'dayoff';
  label: string;
}

function getWorkList(record: DisplayRecord | undefined): WorkListRow[] {
  if (!record) return [];
  if (record.kind === 'loading' || record.kind === 'error') return [];
  return record.workList ?? [];
}

interface TooltipPos {
  top: number;
  left: number;
  above: boolean;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function WorkTooltip({
  rows,
  pos,
  dateLabel,
}: {
  rows: WorkListRow[];
  pos: TooltipPos;
  dateLabel: string;
}) {
  return (
    <div
      className={`work-tooltip ${pos.above ? 'above' : ''}`.trim()}
      style={{top: pos.top, left: pos.left}}
      role="tooltip"
    >
      <div className="work-tooltip-header">
        <span className="work-tooltip-title">근무 상세</span>
        <span className="work-tooltip-date">{dateLabel}</span>
      </div>
      <ul className="work-tooltip-list">
        {rows.map((row, idx) => (
          <li key={`${row.type}-${idx}`} className="work-tooltip-row">
            <span className="work-tooltip-type">{row.type}</span>
            <span className="work-tooltip-meta">
              {row.time && <span className="work-tooltip-time">{row.time}</span>}
              {row.duration && <span className="work-tooltip-dur">{row.duration}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getCellTags(record: DisplayRecord | undefined): CellTag[] {
  if (!record) return [];
  switch (record.kind) {
    case 'holiday':
      return [{kind: 'holiday', label: record.label}];
    case 'vacation':
      return [{kind: 'vacation', label: record.label}];
    case 'remote':
      if (record.vacation) {
        return [{
          kind: 'vacation',
          label: `${record.vacation.type} ${record.vacation.duration}`,
        }];
      }
      return [];
    case 'work':
      if (record.dayOffWork) return [{kind: 'dayoff', label: '휴일근무'}];
      if (record.vacation) {
        return [{
          kind: 'vacation',
          label: `${record.vacation.type} ${record.vacation.duration}`,
        }];
      }
      return [];
    case 'error':
    case 'loading':
      return [];
  }
}

function clockInLabel(record: DisplayWork): string {
  if (record.clockInLocal) return '현출';
  if (record.clockInChanged) return '출근 변경';
  return '출근';
}

function clockOutLabel(record: DisplayWork): string {
  if (record.clockOutLocal) return '현퇴';
  if (record.clockOutChanged) return '퇴근 변경';
  return '퇴근';
}

function clockInClass(record: DisplayWork): string {
  if (record.clockInLocal) return 'local';
  if (record.clockInChanged) return 'changed';
  return '';
}

function clockOutClass(record: DisplayWork): string {
  if (record.clockOutLocal) return 'local';
  if (record.clockOutChanged) return 'changed';
  return '';
}

function WorkRecord({record}: {record: DisplayWork}) {
  return (
    <div className="cell-record">
      <div className="record-row">
        {record.clockInMissing ? (
          <span className="record-label in missing">출근 누락</span>
        ) : (
          <>
            <span className={`record-label in ${clockInClass(record)}`.trim()}>
              {clockInLabel(record)}
            </span>
            <span className="record-time">{record.clockIn || '--:--'}</span>
          </>
        )}
      </div>
      <div className="record-row">
        {record.clockOutMissing ? (
          <span className="record-label out missing">퇴근 누락</span>
        ) : (
          <>
            <span className={`record-label out ${clockOutClass(record)}`.trim()}>
              {clockOutLabel(record)}
            </span>
            <span className="record-time">{record.clockOut || '--:--'}</span>
          </>
        )}
      </div>
      {record.overtime && (
        <div className="record-row">
          <span className="record-label overtime">연장</span>
          <span className="record-time">{record.overtime.duration}</span>
        </div>
      )}
    </div>
  );
}

function CellBody({record, inMonth}: {record: DisplayRecord | undefined; inMonth: boolean}) {
  if (!record) {
    return inMonth ? <div className="cell-empty">—</div> : null;
  }
  switch (record.kind) {
    case 'loading':
      return (
        <div className="cell-loading" aria-label="조회 중">
          <span className="spinner" role="status" aria-hidden="true"/>
        </div>
      );
    case 'error':
      return <div className="cell-error" title={record.error}>{record.error}</div>;
    case 'work':
      return <WorkRecord record={record}/>;
    case 'remote':
      return (
        <div className="cell-record">
          <div className="record-row">
            <span className="record-label remote">재택근무</span>
          </div>
        </div>
      );
    case 'holiday':
    case 'vacation':
      return null;
  }
}

function CalendarCell({cell, record, isToday, dow}: CalendarCellProps) {
  const [tooltip, setTooltip] = useState<TooltipPos | null>(null);
  const tags = getCellTags(record);
  const workList = getWorkList(record);
  const className = [
    'cell',
    cell.inMonth ? '' : 'out-month',
    isToday ? 'today' : '',
    dow === 0 ? 'sun' : '',
    dow === 6 ? 'sat' : '',
  ].join(' ').trim();

  const handleEnter = (e: MouseEvent<HTMLDivElement>): void => {
    if (workList.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const above = rect.bottom > window.innerHeight * 0.6;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
    setTooltip({
      left,
      top: above ? rect.top - 6 : rect.bottom + 6,
      above,
    });
  };
  const handleLeave = (): void => setTooltip(null);

  return (
    <div className={className} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div className="cell-header">
        <div className="cell-date">{cell.day}</div>
        {tags.map((tag, idx) => (
          <span key={`${tag.kind}-${idx}`} className={`cell-tag ${tag.kind}`}>{tag.label}</span>
        ))}
      </div>
      <CellBody record={record} inMonth={cell.inMonth}/>
      {tooltip && workList.length > 0 && (
        <WorkTooltip
          rows={workList}
          pos={tooltip}
          dateLabel={`${cell.month + 1}/${cell.day} (${WEEKDAY_LABELS[dow]})`}
        />
      )}
    </div>
  );
}

export default CalendarCell;
