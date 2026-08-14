import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fetchInsaDayDetails,
  InsaMonthLoadResult,
  loadInsaMonth,
} from '../../api/insaApi';
import {INSA_BRIDGE_ORIGIN} from '../../lib/insaBridge';
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
    expect(screen.getByRole('button', {name: '인사시스템 열기'})).toBeInTheDocument();
    const bookmarkletLink = screen.getByRole('link', {name: '인사 연결'});
    expect(bookmarkletLink).toHaveAttribute('href', expect.stringMatching(/^javascript:/));
    expect(bookmarkletLink).not.toHaveAttribute('href', expect.stringContaining('React has blocked'));
    expect(screen.getByText('인사 연결을 북마크에 끌어다 놓아 저장합니다.')).toBeInTheDocument();
    expect(screen.getByText('인사시스템 열기를 클릭하여 엽니다.')).toBeInTheDocument();
    expect(screen.getByText('달력에 휴가·출퇴근 정보가 표시되면 연결이 완료됩니다.')).toBeInTheDocument();
    expect(screen.getByText('인사시스템 브라우저를 종료하지 말아주세요.')).toBeInTheDocument();
    expect(screen.queryByText('위 순서대로 인사 연결을 설정해주세요.')).not.toBeInTheDocument();
    expect(screen.getByText('인사시스템 브라우저를 종료하지 말아주세요.').closest('section')).toHaveClass('insa-auto-connect-card');
    expect(screen.getByRole('tab', {name: '자동인증'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', {name: '수동인증'})).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByLabelText('INSA Cookie')).not.toBeInTheDocument();
    expect(mockedLoadInsaMonth).not.toHaveBeenCalled();
  });

  test('shows only the manual Cookie setup after selecting manual authentication', async () => {
    render(<InsaPage />);

    await userEvent.click(screen.getByRole('tab', {name: '수동인증'}));

    expect(screen.getByLabelText('INSA Cookie')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button', {name: '인사시스템 열기'})).not.toBeInTheDocument();
    expect(screen.getByRole('tab', {name: '수동인증'})).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', {name: '자동인증'}));

    expect(screen.queryByLabelText('INSA Cookie')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: '인사시스템 열기'})).toBeInTheDocument();
  });

  test('explains the bookmarklet drag action when its setup link is clicked directly', async () => {
    render(<InsaPage />);

    await userEvent.click(screen.getByRole('link', {name: '인사 연결'}));

    expect(screen.getByRole('status')).toHaveTextContent('즐겨찾기 바');
  });

  test('loads through the logged-in INSA popup after the bookmarklet sends a ready message', async () => {
    const popup = {
      closed: false,
      postMessage: jest.fn(),
    } as unknown as Window;
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup);

    render(<InsaPage />);
    await userEvent.click(screen.getByRole('button', {name: '인사시스템 열기'}));

    expect(openSpy).toHaveBeenCalledWith('https://insa.kwe.co.kr/', 'insa-system-window');

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: INSA_BRIDGE_ORIGIN,
        source: popup,
        data: {type: 'insa-bridge-ready', version: 1},
      }));
    });

    await waitFor(() => expect(mockedLoadInsaMonth).toHaveBeenCalledWith(expect.objectContaining({
      cookie: undefined,
      requestHtml: expect.any(Function),
    })));
    expect(screen.queryByLabelText('INSA Cookie')).not.toBeInTheDocument();
    openSpy.mockRestore();
  });

  test('stores the independent cookie and loads the current INSA month', async () => {
    render(<InsaPage />);
    await userEvent.click(screen.getByRole('tab', {name: '수동인증'}));
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
    expect(await screen.findByText(/연차/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/private-session/)).not.toBeInTheDocument();
  });

  test('does not show the annual INSA leave balance card', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');

    render(<InsaPage />);

    expect(await screen.findByText(/연차/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: '2026년 휴가 현황'})).not.toBeInTheDocument();
  });

  test('shows partial source errors without hiding successful balance and calendar data', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const onError = jest.fn();
    mockedLoadInsaMonth.mockResolvedValue({
      ...monthResult,
      worktime: null,
      errors: [{source: 'worktime', message: 'HTTP 500 private-session'}],
    });

    render(<InsaPage onError={onError} />);

    await screen.findByText(/연차/);
    expect(onError).toHaveBeenCalledWith('근태 조회 실패');
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('HTTP 500'));
    expect(screen.queryByText('근태 조회 실패: HTTP 500 [redacted]')).not.toBeInTheDocument();
    expect(screen.getByText(/연차/)).toBeInTheDocument();
    expect(screen.queryByText(/private-session/)).not.toBeInTheDocument();
  });

  test('visually locks the calendar while monthly data is loading', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const monthRequest = deferred<InsaMonthLoadResult>();
    mockedLoadInsaMonth.mockReturnValue(monthRequest.promise);

    render(<InsaPage />);

    const calendar = document.querySelector<HTMLElement>('.insa-calendar-shell');
    if (!calendar) throw new Error('INSA calendar is missing');
    await waitFor(() => expect(calendar).toHaveClass('is-loading'));
    expect(calendar).toHaveAttribute('aria-busy', 'true');
    expect(within(calendar).getByRole('status')).toHaveTextContent('데이터를 불러오는 중입니다.');
    expect(screen.queryByText('월간 정보를 조회 중입니다.')).not.toBeInTheDocument();

    await act(async () => monthRequest.resolve(monthResult));

    await waitFor(() => expect(calendar).not.toHaveClass('is-loading'));
    expect(calendar).toHaveAttribute('aria-busy', 'false');
    expect(within(calendar).queryByRole('status')).not.toBeInTheDocument();
  });

  test('reports the department leave count while a day-detail request is pending', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'private-session');
    const detailRequest = deferred<Awaited<ReturnType<typeof fetchInsaDayDetails>>>();
    const onApiRequestChange = jest.fn();
    mockedFetchInsaDayDetails.mockReturnValue(detailRequest.promise);

    render(<InsaPage onApiRequestChange={onApiRequestChange} />);
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});

    await userEvent.click(dayButton);
    await waitFor(() => expect(onApiRequestChange).toHaveBeenCalledWith({
      key: 'department-leave',
      message: '부서 연차 정보를 불러오는 중 입니다. (1건)',
    }, true));

    await act(async () => detailRequest.resolve([]));
    await waitFor(() => expect(onApiRequestChange).toHaveBeenCalledWith({
      key: 'department-leave',
      message: '부서 연차 정보를 불러오는 중 입니다. (1건)',
    }, false));
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

  test('refresh aborts an in-flight detail request', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');
    const detailRequest = deferred<Awaited<ReturnType<typeof fetchInsaDayDetails>>>();
    mockedFetchInsaDayDetails.mockReturnValue(detailRequest.promise);

    render(<InsaPage />);
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    await screen.findByRole('button', {name: '새로고침'});
    await userEvent.click(dayButton);
    const detailSignal = mockedFetchInsaDayDetails.mock.calls[0]?.[0].signal;

    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '새로고침'}));
    });

    expect(detailSignal?.aborted).toBe(true);
    await act(async () => detailRequest.reject(new DOMException('Aborted', 'AbortError')));
    await screen.findByRole('button', {name: '새로고침'});
  });

  test('refresh clears successful detail cache so the next request refetches', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');
    mockedFetchInsaDayDetails.mockResolvedValue([{
      ymd: '2026-08-05',
      name: 'Synthetic Cached Person',
      scheduleLabel: 'Synthetic schedule',
      durationLabel: '4 hours',
    }]);

    render(<InsaPage />);
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    await screen.findByRole('button', {name: '새로고침'});
    await userEvent.click(dayButton);
    expect(await screen.findByText('Synthetic Cached Person', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '새로고침'}));
    });
    await screen.findByRole('button', {name: '새로고침'});
    await userEvent.click(await screen.findByRole('button', {name: '2026년 8월 5일 상세'}));

    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Synthetic Cached Person', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();
  });

  test('refresh recomputes the current date across a month boundary', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');
    jest.setSystemTime(new Date(2026, 7, 31, 23, 59));

    render(<InsaPage />);
    await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    await screen.findByRole('button', {name: '새로고침'});
    jest.setSystemTime(new Date(2026, 8, 1, 0, 1));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '새로고침'}));
    });
    expect(mockedLoadInsaMonth).toHaveBeenLastCalledWith(expect.objectContaining({
      year: 2026,
      month: 7,
      today: new Date(2026, 8, 1, 0, 1),
    }));
    await screen.findByRole('button', {name: '새로고침'});
  });

  test('removes the Today action and uses the accessible refresh icon', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');

    const {container} = render(<InsaPage />);
    await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    expect(screen.queryByRole('button', {name: '오늘'})).not.toBeInTheDocument();
    const refreshButton = await screen.findByRole('button', {name: '새로고침'});
    expect(refreshButton.querySelector('svg')).toHaveClass('refresh-icon');
    expect(container.querySelector('.toolbar-right')).toContainElement(refreshButton);
    expect(container.querySelector('.toolbar-left')).not.toContainElement(refreshButton);
  });

  test('shows attendance and overtime values in the day tooltip', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');
    mockedLoadInsaMonth.mockResolvedValue({
      ...monthResult,
      worktime: [{
        ymd: '2026-08-05',
        scheduledIn: '09:00',
        scheduledOut: '18:00',
        actualIn: '08:51',
        actualOut: '',
        leaveLabel: '',
        overtimeLabel: '12h',
        correctionIn: '',
        correctionOut: '',
        correctionStatus: '',
        note: '',
      }],
    });

    render(<InsaPage />);
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    await userEvent.hover(dayButton);

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('출근 시간')).toBeInTheDocument();
    expect(within(tooltip).getByText('08:51')).toBeInTheDocument();
    expect(within(tooltip).getByText('퇴근 시간')).toBeInTheDocument();
    expect(within(tooltip).getByText('--:--')).toBeInTheDocument();
    expect(within(tooltip).getByText('연장 시간')).toBeInTheDocument();
    expect(within(tooltip).getByText('12h')).toBeInTheDocument();
  });

  test('omits the overtime row when no overtime value exists', async () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'synthetic-session');
    mockedLoadInsaMonth.mockResolvedValue({
      ...monthResult,
      worktime: [{
        ymd: '2026-08-05',
        scheduledIn: '09:00',
        scheduledOut: '18:00',
        actualIn: '08:51',
        actualOut: '18:00',
        leaveLabel: '',
        overtimeLabel: '',
        correctionIn: '',
        correctionOut: '',
        correctionStatus: '',
        note: '',
      }],
    });

    render(<InsaPage />);
    const dayButton = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    await userEvent.hover(dayButton);

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).queryByText('연장 시간')).not.toBeInTheDocument();
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
    expect(within(loadedTooltip).getByText('Synthetic Hover Person 4 hours')).toBeInTheDocument();
    expect(within(loadedTooltip).queryByText('Synthetic schedule')).not.toBeInTheDocument();

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
    const onError = jest.fn();
    mockedFetchInsaDayDetails.mockRejectedValue(new Error('failed private-session'));

    render(<InsaPage onError={onError} />);
    await userEvent.click(await screen.findByRole('button', {name: '2026년 8월 5일 상세'}));

    expect(await screen.findByText('팀 상세 조회 실패: failed [redacted]')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith('팀 상세 조회 실패');
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('failed'));
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

    const {rerender} = render(<InsaPage resetRequest={0} />);
    await userEvent.click(await screen.findByRole('button', {name: '2026년 8월 5일 상세'}));
    rerender(<InsaPage resetRequest={1} />);

    await userEvent.click(screen.getByRole('tab', {name: '수동인증'}));
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
