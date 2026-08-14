import {render, screen, waitFor} from '@testing-library/react';
import CalendarPage from './CalendarPage';
import {fetchAttendanceForMonth} from '../api/jadeApi';

jest.mock('../api/jadeApi', () => ({
  fetchAttendanceForMonth: jest.fn(),
}));

const mockedFetchAttendanceForMonth = fetchAttendanceForMonth as jest.MockedFunction<
  typeof fetchAttendanceForMonth
>;

describe('CalendarPage layout', () => {
  it('wraps the Jade toolbar and calendar in the spaced page layout', () => {
    mockedFetchAttendanceForMonth.mockReturnValue(new Promise(() => undefined));

    const {container} = render(
      <CalendarPage
        credentials={{
          cookie: 'test-cookie',
          body: 'test-body',
          parsedBody: {},
        }}
      />,
    );

    expect(container.querySelector('.jade-calendar-page')).toBeInTheDocument();
  });

  it('uses an accessible refresh icon and removes the Today action', () => {
    mockedFetchAttendanceForMonth.mockReturnValue(new Promise(() => undefined));

    const {container} = render(
      <CalendarPage
        credentials={{
          cookie: 'test-cookie',
          body: 'test-body',
          parsedBody: {},
        }}
      />,
    );

    expect(screen.queryByRole('button', {name: '오늘'})).not.toBeInTheDocument();
    const refreshButton = screen.getByRole('button', {name: '새로고침'});
    expect(refreshButton).toBeInTheDocument();
    expect(refreshButton.querySelector('svg')).toHaveClass('refresh-icon');
    expect(container.querySelector('.toolbar-right')).toContainElement(refreshButton);
    expect(container.querySelector('.toolbar-left')).not.toContainElement(refreshButton);
  });

  it('sends attendance errors to the toast callback', async () => {
    const onError = jest.fn();
    mockedFetchAttendanceForMonth.mockRejectedValue(new Error('Jade request failed'));

    render(
      <CalendarPage
        credentials={{
          cookie: 'test-cookie',
          body: 'test-body',
          parsedBody: {},
        }}
        onError={onError}
      />
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith('출퇴근 기록 조회 실패'));
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('Jade request failed'));
  });
});
