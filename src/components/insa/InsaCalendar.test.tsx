import {fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {InsaCalendarMap} from '../../lib/transformInsa';
import InsaCalendar from './InsaCalendar';

const days: InsaCalendarMap = {
  '2026-08-05': {
    ymd: '2026-08-05',
    ownLeave: [{
      ymd: '2026-08-05',
      durationLabel: '(후4)',
      type: '연차휴가(시간제)',
      reason: '개인 사유',
      appliedAt: '2026-08-01',
      approvalStatus: '승인',
    }],
    worktime: {
      ymd: '2026-08-05',
      scheduledIn: '09:00',
      scheduledOut: '18:00',
      actualIn: '08:51',
      actualOut: '18:12',
      leaveLabel: '근태 휴가 대체값',
      overtimeLabel: '1시간',
      correctionIn: '',
      correctionOut: '',
      correctionStatus: '',
      note: '',
    },
    teamSchedule: {
      ymd: '2026-08-05',
      vacationCount: 1,
      timeCount: 2,
    },
  },
  '2026-08-06': {
    ymd: '2026-08-06',
    ownLeave: [],
    worktime: {
      ymd: '2026-08-06',
      scheduledIn: '',
      scheduledOut: '',
      actualIn: '',
      actualOut: '',
      leaveLabel: '근태 휴가 대체값',
      overtimeLabel: '',
      correctionIn: '',
      correctionOut: '',
      correctionStatus: '',
      note: '',
    },
  },
};

describe('InsaCalendar', () => {
  test('renders own attendance, detailed leave, overtime, and one combined department leave badge', () => {
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
    />
    );

    const leaveCell = document.querySelector<HTMLElement>('[data-ymd="2026-08-05"]');
    if (!leaveCell) throw new Error('Leave cell is missing');
    expect(within(leaveCell).getByText('출근')).toHaveClass('insa-attendance-label', 'in');
    expect(within(leaveCell).getByText('08:51')).toHaveClass('insa-attendance-time');
    expect(within(leaveCell).getByText('퇴근')).toHaveClass('insa-attendance-label', 'out');
    expect(within(leaveCell).getByText('18:12')).toHaveClass('insa-attendance-time');
    expect(screen.queryByText('연차휴가(시간제) (후4)')).not.toBeInTheDocument();
    expect(screen.queryByText('근태 휴가 대체값', {selector: '[data-ymd="2026-08-05"] *'})).not.toBeInTheDocument();
    expect(screen.queryByText('예정 09:00–18:00')).not.toBeInTheDocument();
    expect(screen.getByText('OT 1시간')).toBeInTheDocument();
    expect(within(leaveCell).getByText('연차 (본인 외 2)')).toHaveClass('insa-team-badge');
    expect(screen.queryByText('팀 휴가 1')).not.toBeInTheDocument();
    expect(screen.queryByText('팀 시간 2')).not.toBeInTheDocument();
  });

  test('renders a plain department leave badge when no own leave is present', () => {
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={{
          '2026-08-07': {
            ymd: '2026-08-07',
            ownLeave: [],
            teamSchedule: {ymd: '2026-08-07', vacationCount: 1, timeCount: 0},
          },
        }}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    expect(screen.getByText('연차 (1)')).toHaveClass('insa-team-badge');
  });

  test('uses the worktime leave label only for the own leave badge', () => {
    const workdayWithLeaveLabel = days['2026-08-06']!;
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={{
          '2026-08-06': {
            ...workdayWithLeaveLabel,
            worktime: {
              ...workdayWithLeaveLabel.worktime!,
              scheduledIn: '09:00',
              scheduledOut: '18:00',
            },
          },
        }}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    const leaveCell = document.querySelector<HTMLElement>('[data-ymd="2026-08-06"]');
    if (!leaveCell) throw new Error('Leave cell is missing');
    expect(within(leaveCell).getByText('연차 (본인)')).toHaveClass('insa-team-badge');
    expect(within(leaveCell).queryByText('근태 휴가 대체값')).not.toBeInTheDocument();
  });

  test('shows placeholders when a worktime record has no attendance times', () => {
    const workdayWithoutAttendance = days['2026-08-06']!;
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={{
          '2026-08-06': {
            ...workdayWithoutAttendance,
            worktime: {
              ...workdayWithoutAttendance.worktime!,
              scheduledIn: '09:00',
              scheduledOut: '18:00',
              leaveLabel: '',
            },
          },
        }}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    const cell = document.querySelector<HTMLElement>('[data-ymd="2026-08-06"]');
    if (!cell) throw new Error('Attendance cell is missing');
    expect(within(cell).getAllByText('--:--')).toHaveLength(2);
  });

  test('shows a holiday badge instead of attendance on days without a regular schedule', () => {
    const holidayDay = days['2026-08-06']!;
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={{
          '2026-08-06': {
            ...holidayDay,
            worktime: {...holidayDay.worktime!, leaveLabel: ''},
          },
        }}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    const cell = document.querySelector<HTMLElement>('[data-ymd="2026-08-06"]');
    if (!cell) throw new Error('Holiday cell is missing');
    expect(within(cell).getByText('휴일')).toHaveClass('insa-holiday-badge');
    expect(within(cell).queryByText('출근')).not.toBeInTheDocument();
    expect(within(cell).queryByText('퇴근')).not.toBeInTheDocument();
    expect(within(cell).queryByText('--:--')).not.toBeInTheDocument();
  });

  test('shows actual attendance on a holiday when attendance was recorded', () => {
    const holidayWithAttendance = days['2026-08-06']!;
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={{
          '2026-08-06': {
            ...holidayWithAttendance,
            worktime: {
              ...holidayWithAttendance.worktime!,
              actualIn: '08:55',
              actualOut: '13:10',
              leaveLabel: '',
            },
          },
        }}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    const cell = document.querySelector<HTMLElement>('[data-ymd="2026-08-06"]');
    if (!cell) throw new Error('Holiday attendance cell is missing');
    expect(within(cell).getByText('휴일')).toBeInTheDocument();
    expect(within(cell).getByText('08:55')).toBeInTheDocument();
    expect(within(cell).getByText('13:10')).toBeInTheDocument();
  });

  test('renders adjacent month dates like the Jade calendar', () => {
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    expect(screen.getByLabelText('2026년 7월 31일')).toBeInTheDocument();
    expect(screen.getByLabelText('2026년 9월 1일')).toBeInTheDocument();
    expect(document.querySelector('[data-ymd="2026-07-31"]')).toHaveClass('is-out-month');
    expect(document.querySelector('[data-ymd="2026-09-01"]')).toHaveClass('is-out-month');
    expect(document.querySelectorAll('.insa-calendar-cell.is-placeholder')).toHaveLength(0);
  });

  test('makes only dates with team counts selectable', async () => {
    const onSelectDay = jest.fn();
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={onSelectDay}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    await userEvent.click(screen.getByRole('button', {name: '2026년 8월 5일 상세'}));

    expect(onSelectDay).toHaveBeenCalledWith('2026-08-05');
    expect(screen.queryByRole('button', {name: '2026년 8월 6일 상세'})).not.toBeInTheDocument();
  });

  test('marks weekend cells so their date colors follow the Jade calendar', () => {
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    expect(document.querySelector('[data-ymd="2026-08-08"]')).toHaveClass('sat');
    expect(document.querySelector('[data-ymd="2026-08-09"]')).toHaveClass('sun');
  });

  test('marks today with the calendar today class and date element', () => {
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    const todayCell = document.querySelector<HTMLElement>('[data-ymd="2026-08-12"]');
    if (!todayCell) throw new Error('Today cell is missing');
    expect(todayCell).toHaveClass('is-today');
    expect(within(todayCell).getByLabelText('2026년 8월 12일')).toHaveClass('insa-date', 'is-today-date');
  });

  test('requests and shows team details in a tooltip when the date button receives focus', () => {
    const onRequestDayDetails = jest.fn();
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={jest.fn()}
        onRequestDayDetails={onRequestDayDetails}
        detailStates={{'2026-08-05': {status: 'loading'}}}
      />
    );

    const dayButton = screen.getByRole('button', {name: /2026.*8.*5/});
    expect(dayButton).not.toHaveAttribute('aria-describedby');
    fireEvent.focus(dayButton);

    expect(onRequestDayDetails).toHaveBeenCalledWith('2026-08-05');
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveAttribute('id', 'insa-team-tooltip-2026-08-05');
    expect(dayButton).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toContainElement(screen.getByRole('status'));

    fireEvent.blur(dayButton);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(dayButton).not.toHaveAttribute('aria-describedby');

    fireEvent.focus(dayButton);
    expect(screen.getByRole('tooltip')).toHaveAttribute('id', 'insa-team-tooltip-2026-08-05');
  });

  test('shows an annual leave list with names and duration labels', () => {
    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={days}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{
          '2026-08-05': {
            status: 'loaded',
            details: [
              {ymd: '2026-08-05', name: '휴가 :', scheduleLabel: '연차휴가', durationLabel: '(오전)'},
              {ymd: '2026-08-05', name: '시간 :', scheduleLabel: '오후반차', durationLabel: '(후4)'},
            ],
          },
        }}
      />
    );

    const dayButton = screen.getByRole('button', {name: /2026.*8.*5/});
    expect(screen.queryByText('예정 09:00–18:00')).not.toBeInTheDocument();

    fireEvent.focus(dayButton);

    const tooltip = screen.getByRole('tooltip');
    const leaveSection = within(tooltip).getByText('연차 목록').closest('.insa-team-tooltip-leave-section');
    expect(leaveSection).toBeInTheDocument();
    expect(leaveSection?.querySelector('.insa-team-tooltip-list')).toHaveClass('insa-team-tooltip-list-right');
    expect(leaveSection).toContainElement(within(tooltip).getByText('연차휴가 (오전)'));
    expect(leaveSection).toContainElement(within(tooltip).getByText('오후반차 (후4)'));
    expect(within(tooltip).queryByText('연차휴가(시간제) (후4)')).not.toBeInTheDocument();
    expect(within(tooltip).getByText('예정 시간')).toBeInTheDocument();
    expect(within(tooltip).getByText('09:00–18:00')).toBeInTheDocument();
    expect(within(tooltip).queryByText('휴가')).not.toBeInTheDocument();
    expect(within(tooltip).queryByText('시간')).not.toBeInTheDocument();
    expect(within(tooltip).queryByText('휴가 :')).not.toBeInTheDocument();
    expect(within(tooltip).queryByText('시간 :')).not.toBeInTheDocument();
  });

  test('shows planned time in a tooltip even when the day has no department leave', () => {
    const plannedDay = days['2026-08-06']!;
    const daysWithPlannedTime: InsaCalendarMap = {
      ...days,
      '2026-08-06': {
        ...plannedDay,
        worktime: {
          ...plannedDay.worktime!,
          scheduledIn: '09:00',
          scheduledOut: '18:00',
        },
      },
    };

    render(
      <InsaCalendar
        year={2026}
        month={7}
        today={new Date(2026, 7, 12)}
        days={daysWithPlannedTime}
        onSelectDay={jest.fn()}
        onRequestDayDetails={jest.fn()}
        detailStates={{}}
      />
    );

    fireEvent.mouseEnter(screen.getByLabelText('2026년 8월 6일').closest('[data-ymd]')!);

    const tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText('근무 상세')).toBeInTheDocument();
    expect(within(tooltip).queryByText('팀 일정 상세')).not.toBeInTheDocument();
    expect(within(tooltip).getByText('예정 시간')).toBeInTheDocument();
    expect(within(tooltip).getByText('09:00–18:00')).toBeInTheDocument();
  });
});
