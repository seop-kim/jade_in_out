import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarPage from './CalendarPage';
import {fetchAttendanceForMonth} from '../api/jadeApi';
import {ConnectionStatus} from '../lib/connectionStatus';

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

  it('reuses a completed month when navigating away and back', async () => {
    mockedFetchAttendanceForMonth.mockResolvedValue({});
    render(
      <CalendarPage
        credentials={{cookie: 'test-cookie', body: 'test-body', parsedBody: {}}}
      />,
    );

    await waitFor(() => expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(1));
    await screen.findByText(/^최근 조회/);
    await waitFor(() => expect(screen.getByRole('button', {name: '다음 달'})).toBeEnabled());
    await userEvent.click(screen.getByRole('button', {name: '다음 달'}));
    await waitFor(() => expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', {name: '이전 달'}));

    await waitFor(() => expect(screen.getByRole('button', {name: '새로고침'})).toBeEnabled());
    expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(2);
  });

  it('bypasses the month cache when refresh is clicked', async () => {
    mockedFetchAttendanceForMonth.mockResolvedValue({});
    render(
      <CalendarPage
        credentials={{cookie: 'test-cookie', body: 'test-body', parsedBody: {}}}
      />,
    );

    await waitFor(() => expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(1));
    await screen.findByText(/^최근 조회/);
    await waitFor(() => expect(screen.getByRole('button', {name: '새로고침'})).toBeEnabled());
    await userEvent.click(screen.getByRole('button', {name: '새로고침'}));

    await waitFor(() => expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(2));
  });

  it('reports checking and connected states with the latest successful fetch time', async () => {
    mockedFetchAttendanceForMonth.mockResolvedValue({});
    const statuses: ConnectionStatus[] = [];
    const onConnectionStatusChange = jest.fn((status: ConnectionStatus) => statuses.push(status));
    const onLastFetchedChange = jest.fn();

    render(
      <CalendarPage
        credentials={{cookie: 'test-cookie', body: 'test-body', parsedBody: {}}}
        onConnectionStatusChange={onConnectionStatusChange}
        onLastFetchedChange={onLastFetchedChange}
      />,
    );

    await waitFor(() => expect(onConnectionStatusChange).toHaveBeenLastCalledWith('connected'));
    expect(statuses).toContain('checking');
    expect(onLastFetchedChange).toHaveBeenLastCalledWith(expect.any(Date));
  });
});
