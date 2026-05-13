import './Calendar.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function buildCells(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLast = new Date(year, month, 0).getDate();

  const cells = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({
      year: month === 0 ? year - 1 : year,
      month: month === 0 ? 11 : month - 1,
      day: prevLast - i,
      inMonth: false,
    });
  }

  for (let d = 1; d <= lastDate; d++) {
    cells.push({ year, month, day: d, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
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

function isSameDate(a, year, month, day) {
  return (
    a.getFullYear() === year &&
    a.getMonth() === month &&
    a.getDate() === day
  );
}

function Calendar({ year, month, today, attendance }) {
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
          const key = formatKey(cell.year, cell.month, cell.day);
          const record = cell.inMonth ? attendance[key] : null;
          const isToday = isSameDate(today, cell.year, cell.month, cell.day);

          const tagKind =
            record?.kind === 'holiday'
              ? 'holiday'
              : record?.kind === 'work' && record.dayOffWork
              ? 'dayoff'
              : record?.kind === 'vacation' || (record?.kind === 'work' && record.vacation)
              ? 'vacation'
              : null;
          const tagLabel =
            record?.kind === 'holiday' || record?.kind === 'vacation'
              ? record.label
              : record?.kind === 'work' && record.dayOffWork
              ? '휴일근무'
              : record?.kind === 'work' && record.vacation
              ? `${record.vacation.type} ${record.vacation.duration}`
              : null;

          return (
            <div
              key={key + (cell.inMonth ? '' : '-out')}
              className={[
                'cell',
                cell.inMonth ? '' : 'out-month',
                isToday ? 'today' : '',
                dow === 0 ? 'sun' : '',
                dow === 6 ? 'sat' : '',
              ].join(' ').trim()}
            >
              <div className="cell-header">
                <div className="cell-date">{cell.day}</div>
                {tagLabel && (
                  <span className={`cell-tag ${tagKind}`}>{tagLabel}</span>
                )}
              </div>
              {record && record.error ? (
                <div className="cell-error" title={record.error}>
                  오류
                  <div className="cell-error-msg">{record.error}</div>
                </div>
              ) : record && record.kind === 'work' ? (
                <div className="cell-record">
                  <div className="record-row">
                    {record.clockInMissing ? (
                      <span className="record-label in missing">출근 누락</span>
                    ) : (
                      <>
                        <span className={`record-label in ${record.clockInChanged ? 'changed' : ''}`.trim()}>
                          {record.clockInChanged ? '출근 변경' : '출근'}
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
                        <span className={`record-label out ${record.clockOutChanged ? 'changed' : ''}`.trim()}>
                          {record.clockOutChanged ? '퇴근 변경' : '퇴근'}
                        </span>
                        <span className="record-time">{record.clockOut || '--:--'}</span>
                      </>
                    )}
                  </div>
                  {record.overtime && (
                    <div className="record-row">
                      <span className="record-label overtime">야근</span>
                      <span className="record-time">{record.overtime.duration}</span>
                    </div>
                  )}
                </div>
              ) : !record && cell.inMonth ? (
                <div className="cell-empty">—</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Calendar;
