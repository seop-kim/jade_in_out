import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fetchInsaDayDetails,
  InsaMonthLoadResult,
  loadInsaMonth,
} from '../../api/insaApi';
import {INSA_COOKIE_STORAGE_KEY} from '../../lib/insaStorage';
import InsaPage from './InsaPage';

jest.mock('../../api/insaApi', () => ({
  fetchInsaDayDetails: jest.fn(),
  loadInsaMonth: jest.fn(),
}));

const mockedLoadInsaMonth = loadInsaMonth as jest.MockedFunction<typeof loadInsaMonth>;
const mockedFetchInsaDayDetails = fetchInsaDayDetails as jest.MockedFunction<typeof fetchInsaDayDetails>;

const monthResult: InsaMonthLoadResult = {
  home: {
    year: 2026,
    month: 8,
    days: {
      '2026-08-05': {ymd: '2026-08-05', vacationCount: 1, timeCount: 0},
    },
  },
  worktime: [],
  leave: {
    balances: [
      {year: 2025, period: '2025', accruedHours: 80, usedHours: 40, remainingHours: 40},
      {year: 2026, period: '2026', accruedHours: 120, usedHours: 16, remainingHours: 104},
    ],
    records: [],
  },
  errors: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

describe('InsaPage', () => {
  beforeEach(() => {
    localStorage.removeItem(INSA_COOKIE_STORAGE_KEY);
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 12, 9));
    mockedLoadInsaMonth.mockResolvedValue(monthResult);
    mockedFetchInsaDayDetails.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.removeItem(INSA_COOKIE_STORAGE_KEY);
  });

  test('shows separate cookie setup when no INSA cookie is stored', () => {
    render(<InsaPage />);

    expect(screen.getByRole('heading', {name: '신규 인사시스템 연결'})).toBeInTheDocument();
    expect(screen.getByLabelText('INSA Cookie')).toHaveAttribute('type', 'password');
    expect(mockedLoadInsaMonth).not.toHaveBeenCalled();
  });

  test('stores the independent cookie and loads the current INSA month', async () => {
    render(<InsaPage />);
    await userEvent.type(screen.getByLabelText('INSA Cookie'), '  private-session  ');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '저장하고 달력 보기'}));
    });

    expect(localStorage.getItem(INSA_COOKIE_STORAGE_KEY)).toBe('private-session');
    await waitFor(() => expect(mockedLoadInsaMonth).toHaveBeenCalledWith(expect.objectContaining({
      cookie: 'private-session',
      year: 2026,
      month: 7,
    })));
    expect(await screen.findByText('잔여 104시간')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/private-session/)).not.toBeInTheDocument();
  });

  test('shows partial source errors without hiding successful balance and calendar data', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    mockedLoadInsaMonth.mockResolvedValue({
      ...monthResult,
      worktime: null,
      errors: [{source: 'worktime', message: 'HTTP 500 private-session'}],
    });

    render(<InsaPage />);

    expect(await screen.findByText('근태 조회 실패: HTTP 500 [redacted]')).toBeInTheDocument();
    expect(screen.getByText('잔여 104시간')).toBeInTheDocument();
    expect(screen.queryByText('잔여 40시간')).not.toBeInTheDocument();
    expect(screen.getByText('팀 휴가 1')).toBeInTheDocument();
    expect(screen.queryByText(/private-session/)).not.toBeInTheDocument();
  });

  test('aborts a stale monthly request when the viewed month changes', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const firstRequest = deferred<InsaMonthLoadResult>();
    mockedLoadInsaMonth
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValue(monthResult);

    render(<InsaPage />);
    await waitFor(() => expect(mockedLoadInsaMonth).toHaveBeenCalledTimes(1));
    const firstSignal = mockedLoadInsaMonth.mock.calls[0]?.[0].signal;

    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '다음 달'}));
    });

    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(mockedLoadInsaMonth).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('월간 정보를 조회 중입니다.')).not.toBeInTheDocument());
  });

  test('loads team details only after selection and reuses cached details', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    mockedFetchInsaDayDetails.mockResolvedValue([{
      ymd: '2026-08-05',
      name: '홍길동',
      scheduleLabel: '연차휴가',
      durationLabel: '종일',
    }]);

    render(<InsaPage />);
    expect(mockedFetchInsaDayDetails).not.toHaveBeenCalled();
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});

    await userEvent.click(dayButton);
    expect(await screen.findByText('홍길동', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();
    expect(screen.getByText('연차휴가 · 종일')).toBeInTheDocument();
    await userEvent.click(dayButton);

    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(1);
  });

  test('previews synthetic team details on hover without selecting the day and reuses the result on click', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');
    const detailRequest = deferred<Awaited<ReturnType<typeof fetchInsaDayDetails>>>();
    mockedFetchInsaDayDetails.mockReturnValue(detailRequest.promise);

    const {container} = render(<InsaPage />);
    const dayButton = await screen.findByRole('button', {name: /2026.*8.*5/});

    await userEvent.hover(dayButton);

    const loadingTooltip = screen.getByRole('tooltip');
    expect(within(loadingTooltip).getByRole('status')).toBeInTheDocument();
    expect(container.querySelector('.insa-detail-panel')).not.toBeInTheDocument();
    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(1);

    await act(async () => detailRequest.resolve([{
      ymd: '2026-08-05',
      name: 'Synthetic Hover Person',
      scheduleLabel: 'Synthetic schedule',
      durationLabel: '4 hours',
    }]));

    const loadedTooltip = await screen.findByRole('tooltip');
    expect(within(loadedTooltip).getByText('Synthetic Hover Person')).toBeInTheDocument();
    expect(within(loadedTooltip).getByText('Synthetic schedule')).toBeInTheDocument();
    expect(within(loadedTooltip).getByText('4 hours')).toBeInTheDocument();

    await userEvent.unhover(dayButton);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(container.querySelector('.insa-detail-panel')).not.toBeInTheDocument();

    await userEvent.click(dayButton);

    expect(await screen.findByText('Synthetic Hover Person', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();
    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(1);
  });

  test('shows team-detail loading and empty states', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const detailRequest = deferred<Awaited<ReturnType<typeof fetchInsaDayDetails>>>();
    mockedFetchInsaDayDetails.mockReturnValue(detailRequest.promise);

    render(<InsaPage />);
    await userEvent.click(await screen.findByRole('button', {name: '2026년 8월 5일 상세'}));
    expect(screen.getByText(/팀 상세 조회 중/)).toHaveAttribute('role', 'status');

    await act(async () => detailRequest.resolve([]));

    expect(await screen.findByText('등록된 팀 일정이 없습니다.', {selector: '.insa-detail-panel p'})).toBeInTheDocument();
  });

  test('redacts the cookie from team-detail errors', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    mockedFetchInsaDayDetails.mockRejectedValue(new Error('failed private-session'));

    render(<InsaPage />);
    await userEvent.click(await screen.findByRole('button', {name: '2026년 8월 5일 상세'}));

    expect(await screen.findByText('팀 상세 조회 실패: failed [redacted]')).toBeInTheDocument();
    expect(screen.queryByText(/private-session/)).not.toBeInTheDocument();
  });

  test('retries team details after a failed request', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const retryRequest = deferred<Awaited<ReturnType<typeof fetchInsaDayDetails>>>();
    mockedFetchInsaDayDetails
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockReturnValueOnce(retryRequest.promise);

    render(<InsaPage />);
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    await userEvent.click(dayButton);
    expect(await screen.findByText('팀 상세 조회 실패: temporary failure')).toBeInTheDocument();

    await userEvent.click(dayButton);
    expect(screen.getByText(/팀 상세 조회 중/)).toHaveAttribute('role', 'status');

    await act(async () => retryRequest.resolve([{
      ymd: '2026-08-05',
      name: '재시도 사용자',
      scheduleLabel: '시간휴가',
      durationLabel: '2시간',
    }]));

    expect(await screen.findByText('재시도 사용자', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();
    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(2);
  });

  test('does not reuse a stale detail response after the Cookie is reset', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const oldDetailRequest = deferred<Awaited<ReturnType<typeof fetchInsaDayDetails>>>();
    mockedFetchInsaDayDetails
      .mockReturnValueOnce(oldDetailRequest.promise)
      .mockResolvedValueOnce([{
        ymd: '2026-08-05',
        name: '새 세션 사용자',
        scheduleLabel: '시간휴가',
        durationLabel: '2시간',
      }]);

    render(<InsaPage />);
    await userEvent.click(await screen.findByRole('button', {name: '2026년 8월 5일 상세'}));
    await userEvent.click(screen.getByRole('button', {name: '연결 재설정'}));

    await userEvent.type(screen.getByLabelText('INSA Cookie'), 'new-session');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '저장하고 달력 보기'}));
    });
    const newSessionDay = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});

    await act(async () => oldDetailRequest.resolve([{
      ymd: '2026-08-05',
      name: '이전 세션 사용자',
      scheduleLabel: '연차휴가',
      durationLabel: '종일',
    }]));
    await userEvent.click(newSessionDay);

    expect(await screen.findByText('새 세션 사용자', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();
    expect(screen.queryByText('이전 세션 사용자')).not.toBeInTheDocument();
    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(2);
    expect(mockedFetchInsaDayDetails).toHaveBeenLastCalledWith(expect.objectContaining({
      cookie: 'new-session',
      ymd: '2026-08-05',
    }));
  });
});
