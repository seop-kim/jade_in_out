import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {fetchAttendanceForMonth} from './api/jadeApi';
import {fetchInsaDayDetails, InsaMonthLoadResult, loadInsaMonth} from './api/insaApi';
import {JADE_BRIDGE_ATTENDANCE, JADE_BRIDGE_ORIGIN} from './lib/jadeBridge';
import {clearInsaCookie, saveInsaCookie} from './lib/insaStorage';
import {clearCredentials, saveCredentials} from './lib/storage';

jest.mock('./api/insaApi', () => ({
  fetchInsaDayDetails: jest.fn(),
  loadInsaMonth: jest.fn(),
}));
jest.mock('./api/jadeApi', () => ({
  fetchAttendanceForMonth: jest.fn(),
}));

const mockedLoadInsaMonth = loadInsaMonth as jest.MockedFunction<typeof loadInsaMonth>;
const mockedFetchInsaDayDetails = fetchInsaDayDetails as jest.MockedFunction<typeof fetchInsaDayDetails>;
const mockedFetchAttendanceForMonth = fetchAttendanceForMonth as jest.MockedFunction<typeof fetchAttendanceForMonth>;
const normalJadeResponse = '<SHEET><ETC-DATA><ETC KEY="YMD"><![CDATA[20260812]]></ETC><ETC KEY="EMP_ID"><![CDATA[20250304]]></ETC><ETC KEY="WORK_TYPE_NM"><![CDATA[기본근무]]></ETC></ETC-DATA></SHEET>';

function monthResult(year: number, month: number): InsaMonthLoadResult {
  const ymd = `${year}-${String(month + 1).padStart(2, '0')}-05`;
  return {
    home: {
      year,
      month: month + 1,
      days: {[ymd]: {ymd, vacationCount: 1, timeCount: 0}},
    },
    worktime: [],
    leave: {balances: [], records: []},
    errors: [],
  };
}

describe('App system tabs', () => {
  beforeEach(() => {
    clearCredentials();
    clearInsaCookie();
    jest.clearAllMocks();
    mockedFetchAttendanceForMonth.mockReturnValue(new Promise(() => undefined));
    mockedLoadInsaMonth.mockImplementation(async ({year, month}) => monthResult(year, month));
    mockedFetchInsaDayDetails.mockImplementation(async ({ymd}) => [{
      ymd,
      name: 'Synthetic Detail Person',
      scheduleLabel: 'Synthetic leave',
      durationLabel: '4 hours',
    }]);
  });

  afterEach(() => {
    clearCredentials();
    clearInsaCookie();
  });

  test('keeps Jade setup as the default and opens the independent INSA screen', async () => {
    render(<App />);

    const pageTitle = screen.getByRole('heading', {name: '출퇴근 기록'});
    const titleRow = pageTitle.closest('.app-title-row');
    if (!titleRow) throw new Error('App title row is missing');

    expect(screen.getByRole('tab', {name: '기존'})).toHaveAttribute('aria-selected', 'true');
    expect(titleRow).toContainElement(screen.getByRole('tab', {name: '기존'}));
    expect(titleRow).toContainElement(screen.getByRole('tab', {name: '신규'}));
    expect(screen.getByRole('heading', {name: 'Jade 인증 정보 입력'})).toBeInTheDocument();
    expect(screen.queryByLabelText('INSA Cookie')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', {name: '신규'}));

    expect(screen.getByRole('tab', {name: '신규'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('INSA Cookie')).toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Jade 인증 정보 입력'})).not.toBeInTheDocument();
  });

  test('shows the Jade credential reset only on the active Jade tab', async () => {
    saveCredentials({
      cookie: 'jade-session',
      body: 'S_STD_YMD=20260812',
      parsedBody: {},
    });
    render(<App />);

    expect(screen.getByRole('button', {name: '인증 정보 초기화'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', {name: '신규'}));

    expect(screen.queryByRole('button', {name: '인증 정보 초기화'})).not.toBeInTheDocument();
  });

  test('shows the INSA connection reset in the app header when the new system is connected', async () => {
    saveInsaCookie('synthetic-session');
    render(<App />);

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', {name: '신규'}));
      await Promise.resolve();
      await Promise.resolve();
    });
    await screen.findByText(/연차/);
    await act(async () => {
      await Promise.resolve();
    });

    const header = document.querySelector<HTMLElement>('.app-header');
    if (!header) throw new Error('App header is missing');
    const resetButton = await within(header).findByRole('button', {name: '인증 정보 초기화'});
    expect(screen.getAllByRole('button', {name: '인증 정보 초기화'})).toHaveLength(1);

    await userEvent.click(resetButton);

    expect(await screen.findByRole('heading', {name: '신규 인사시스템 연결'})).toBeInTheDocument();
    expect(within(header).queryByRole('button', {name: '인증 정보 초기화'})).not.toBeInTheDocument();
  });

  test('connects Jade through the logged-in tab without storing a Cookie', async () => {
    const jadeTab = {
      closed: false,
      postMessage: jest.fn(),
    } as unknown as Window;
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(jadeTab);

    render(<App />);
    await userEvent.click(screen.getByRole('button', {name: 'Jade 시스템 열기'}));

    expect(openSpy).toHaveBeenCalledWith('https://ehr.jadehr.co.kr/', '_blank');

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: JADE_BRIDGE_ORIGIN,
        source: jadeTab,
        data: {type: 'jade-bridge-ready', version: 1},
      }));
      window.dispatchEvent(new MessageEvent('message', {
        origin: JADE_BRIDGE_ORIGIN,
        source: jadeTab,
        data: {
          type: JADE_BRIDGE_ATTENDANCE,
          body: 'S_STD_YMD=20260812&S_EMP_ID=20250304&S_EMP_NM=홍길동',
          response: normalJadeResponse,
        },
      }));
    });

    await waitFor(() => expect(mockedFetchAttendanceForMonth).toHaveBeenCalledWith(expect.objectContaining({
      cookie: '',
      parsedBody: expect.objectContaining({S_STD_YMD: '20260812', S_EMP_ID: '20250304'}),
      transport: expect.any(Object),
    })));
    expect(screen.queryByRole('heading', {name: 'Jade 인증 정보 입력'})).not.toBeInTheDocument();
    openSpy.mockRestore();
  });

  test('shows that the Jade bookmarklet was executed while waiting for attendance XML', async () => {
    const jadeTab = {
      closed: false,
      postMessage: jest.fn(),
    } as unknown as Window;
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(jadeTab);

    render(<App />);
    await userEvent.click(screen.getByRole('button', {name: 'Jade 시스템 열기'}));

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: JADE_BRIDGE_ORIGIN,
        source: jadeTab,
        data: {type: 'jade-bridge-ready', version: 1},
      }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('Jade 연결이 실행되었습니다');
    openSpy.mockRestore();
  });

  test('does not restart the Jade calendar request when the bridge reports the same body again', async () => {
    const jadeTab = {
      closed: false,
      postMessage: jest.fn(),
    } as unknown as Window;
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(jadeTab);

    render(<App />);
    await userEvent.click(screen.getByRole('button', {name: 'Jade 시스템 열기'}));

    const bodyMessage = {
      origin: JADE_BRIDGE_ORIGIN,
      source: jadeTab,
      data: {
        type: JADE_BRIDGE_ATTENDANCE,
        body: 'S_STD_YMD=20260812&S_EMP_ID=20250304&S_EMP_NM=홍길동',
        response: normalJadeResponse,
      },
    };
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: JADE_BRIDGE_ORIGIN,
        source: jadeTab,
        data: {type: 'jade-bridge-ready', version: 1},
      }));
      window.dispatchEvent(new MessageEvent('message', bodyMessage));
    });

    await waitFor(() => expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', bodyMessage));
    });

    expect(mockedFetchAttendanceForMonth).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  test('shows a green toast while an INSA request is in flight and removes it on completion', async () => {
    saveInsaCookie('synthetic-session');
    let finishMonth!: () => void;
    mockedLoadInsaMonth.mockImplementation(({onRequestStart, onRequestEnd}) => {
      onRequestStart?.('home');
      onRequestStart?.('leave');
      onRequestStart?.('worktime');
      return new Promise<InsaMonthLoadResult>((resolve) => {
        finishMonth = () => {
          onRequestEnd?.('home');
          onRequestEnd?.('leave');
          onRequestEnd?.('worktime');
          resolve(monthResult(2026, new Date().getMonth()));
        };
      });
    });

    render(<App />);

    await userEvent.click(screen.getByRole('tab', {name: '신규'}));
    await screen.findByText('연차 정보를 불러오는 중 입니다.');
    await screen.findByText('출퇴근 정보를 불러오는 중 입니다.');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('alert').every((toast) => toast.classList.contains('toast-success'))).toBe(true);

    await act(async () => finishMonth());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('renders the attendance status even when the request completes immediately', async () => {
    saveInsaCookie('synthetic-session');
    mockedLoadInsaMonth.mockImplementation(async ({onRequestStart, onRequestEnd}) => {
      onRequestStart?.('worktime');
      onRequestEnd?.('worktime');
      return monthResult(2026, new Date().getMonth());
    });

    render(<App />);
    await act(async () => {
      await userEvent.click(screen.getByRole('tab', {name: '신규'}));
    });

    expect(await screen.findByText('출퇴근 정보를 불러오는 중 입니다.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('keeps one department leave toast and updates its count for another hovered day', async () => {
    saveInsaCookie('synthetic-session');
    const multiDayMonthResult: InsaMonthLoadResult = {
      ...monthResult(2026, new Date().getMonth()),
      home: {
        year: 2026,
        month: new Date().getMonth() + 1,
        days: {
          '2026-08-05': {ymd: '2026-08-05', vacationCount: 1, timeCount: 0},
          '2026-08-06': {ymd: '2026-08-06', vacationCount: 3, timeCount: 0},
        },
      },
    };
    let resolveMonth!: (result: InsaMonthLoadResult) => void;
    mockedLoadInsaMonth.mockReturnValue(new Promise((resolve) => {
      resolveMonth = resolve;
    }));
    const detailResolvers = new Map<string, (details: Awaited<ReturnType<typeof fetchInsaDayDetails>>) => void>();
    mockedFetchInsaDayDetails.mockImplementation(({ymd}) => new Promise((resolve) => {
      detailResolvers.set(ymd, resolve);
    }));

    render(<App />);
    await userEvent.click(screen.getByRole('tab', {name: '신규'}));
    await act(async () => resolveMonth(multiDayMonthResult));
    const firstDay = await screen.findByRole('button', {name: '2026년 8월 5일 상세'});
    const secondDay = await screen.findByRole('button', {name: '2026년 8월 6일 상세'});

    await userEvent.hover(firstDay);
    expect(await screen.findByText('부서 연차 정보를 불러오는 중 입니다. (1건)')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    await userEvent.hover(secondDay);
    expect(await screen.findByText('부서 연차 정보를 불러오는 중 입니다. (3건)')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    await act(async () => {
      detailResolvers.forEach((resolve) => resolve([]));
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('keeps both controlled tab panels in the DOM and hides the inactive panel', async () => {
    render(<App />);

    const jadeTab = screen.getByRole('tab', {name: '기존'});
    const insaTab = screen.getByRole('tab', {name: '신규'});
    const jadePanel = document.getElementById(jadeTab.getAttribute('aria-controls') ?? '');
    const insaPanel = document.getElementById(insaTab.getAttribute('aria-controls') ?? '');
    if (!jadePanel || !insaPanel) throw new Error('Controlled tab panel is missing');

    expect(jadeTab).toHaveAttribute('aria-selected', 'true');
    expect(jadeTab).toHaveAttribute('tabindex', '0');
    expect(insaTab).toHaveAttribute('aria-selected', 'false');
    expect(insaTab).toHaveAttribute('tabindex', '-1');
    expect(jadePanel).toHaveAttribute('id', 'jade-system-panel');
    expect(jadePanel).toHaveAttribute('role', 'tabpanel');
    expect(jadePanel).toHaveAttribute('aria-labelledby', jadeTab.id);
    expect(jadePanel).not.toHaveAttribute('hidden');
    expect(insaPanel).toHaveAttribute('id', 'insa-system-panel');
    expect(insaPanel).toHaveAttribute('role', 'tabpanel');
    expect(insaPanel).toHaveAttribute('aria-labelledby', insaTab.id);
    expect(insaPanel).toHaveAttribute('hidden');

    await act(async () => {
      await userEvent.click(insaTab);
    });

    expect(jadeTab).toHaveAttribute('aria-selected', 'false');
    expect(jadeTab).toHaveAttribute('tabindex', '-1');
    expect(insaTab).toHaveAttribute('aria-selected', 'true');
    expect(insaTab).toHaveAttribute('tabindex', '0');
    expect(jadePanel).toHaveAttribute('hidden');
    expect(insaPanel).not.toHaveAttribute('hidden');
  });

  test('moves tab selection and focus with ArrowLeft, ArrowRight, Home, and End', async () => {
    render(<App />);

    const jadeTab = screen.getByRole('tab', {name: '기존'});
    const insaTab = screen.getByRole('tab', {name: '신규'});
    jadeTab.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(insaTab).toHaveFocus();
    expect(insaTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    expect(jadeTab).toHaveFocus();
    expect(jadeTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{End}');
    expect(insaTab).toHaveFocus();
    expect(insaTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    expect(jadeTab).toHaveFocus();
    expect(jadeTab).toHaveAttribute('aria-selected', 'true');
  });

  test('wraps ArrowLeft and ArrowRight selection and focus at the tab boundaries', async () => {
    render(<App />);

    const jadeTab = screen.getByRole('tab', {name: '기존'});
    const insaTab = screen.getByRole('tab', {name: '신규'});
    jadeTab.focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(insaTab).toHaveFocus();
    expect(insaTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowRight}');
    expect(jadeTab).toHaveFocus();
    expect(jadeTab).toHaveAttribute('aria-selected', 'true');
  });

  test('lazily mounts INSA once and preserves both tabs transient state, selected month, and detail cache', async () => {
    saveInsaCookie('synthetic-session');
    render(<App />);
    const jadeDraft = screen.getByLabelText('cURL 명령어');
    await userEvent.type(jadeDraft, 'synthetic unsaved draft');
    expect(mockedLoadInsaMonth).not.toHaveBeenCalled();

    const jadeTab = screen.getByRole('tab', {name: '기존'});
    const insaTab = screen.getByRole('tab', {name: '신규'});
    await act(async () => {
      await userEvent.click(insaTab);
    });
    const current = new Date();
    await screen.findByRole('button', {name: '새로고침'});
    await screen.findByRole('button', {
      name: `${current.getFullYear()}년 ${current.getMonth() + 1}월 5일 상세`,
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', {name: '이전 달'}));
    });

    const previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    await screen.findByRole('button', {name: '새로고침'});
    await act(async () => {
      await userEvent.click(await screen.findByRole('button', {
        name: `${previousMonth.getFullYear()}년 ${previousMonth.getMonth() + 1}월 5일 상세`,
      }));
    });
    expect(await screen.findByText('Synthetic Detail Person', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();

    await userEvent.click(jadeTab);
    expect(screen.getByLabelText(/^cURL 명령어/)).toHaveValue('synthetic unsaved draft');
    await userEvent.click(insaTab);

    expect(screen.getByRole('button', {
      name: `${previousMonth.getFullYear()}년 ${previousMonth.getMonth() + 1}월 5일 상세`,
    })).toBeInTheDocument();
    expect(screen.getByText('Synthetic Detail Person', {selector: '.insa-detail-panel strong'})).toBeInTheDocument();
    expect(mockedFetchInsaDayDetails).toHaveBeenCalledTimes(1);
    expect(mockedLoadInsaMonth).toHaveBeenLastCalledWith(expect.objectContaining({
      year: previousMonth.getFullYear(),
      month: previousMonth.getMonth(),
    }));
  });
});
