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
  const tags = getCellTags(record);
  const className = [
    'cell',
    cell.inMonth ? '' : 'out-month',
    isToday ? 'today' : '',
    dow === 0 ? 'sun' : '',
    dow === 6 ? 'sat' : '',
  ].join(' ').trim();

  return (
    <div className={className}>
      <div className="cell-header">
        <div className="cell-date">{cell.day}</div>
        {tags.map((tag, idx) => (
          <span key={`${tag.kind}-${idx}`} className={`cell-tag ${tag.kind}`}>{tag.label}</span>
        ))}
      </div>
      <CellBody record={record} inMonth={cell.inMonth}/>
    </div>
  );
}

export default CalendarCell;
