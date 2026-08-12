import {fireEvent, render, screen} from '@testing-library/react';
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
  test('renders own attendance, detailed leave, planned time, overtime, and team counts separately', () => {
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

    expect(screen.getByText('출근 08:51')).toBeInTheDocument();
    expect(screen.getByText('퇴근 18:12')).toBeInTheDocument();
    expect(screen.getByText('연차휴가(시간제) (후4)')).toBeInTheDocument();
    expect(screen.queryByText('근태 휴가 대체값', {selector: '[data-ymd="2026-08-05"] *'})).not.toBeInTheDocument();
    expect(screen.getByText('예정 09:00–18:00')).toBeInTheDocument();
    expect(screen.getByText('OT 1시간')).toBeInTheDocument();
    expect(screen.getByText('팀 휴가 1')).toBeInTheDocument();
    expect(screen.getByText('팀 시간 2')).toBeInTheDocument();
  });

  test('uses the worktime leave label only when detailed own leave is absent', () => {
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

    expect(screen.getByText('근태 휴가 대체값')).toBeInTheDocument();
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
});
