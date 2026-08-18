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
  isInsaAuthenticationError: jest.fn(() => false),
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
    localStorage.removeItem('jade_in_out_theme_v1');
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
    localStorage.removeItem('jade_in_out_theme_v1');
  });

  test('keeps Jade setup as the default and opens the independent INSA screen', async () => {
    render(<App />);

    expect(screen.queryByText('시작하려면 먼저 Jade 인증 정보를 입력해주세요')).not.toBeInTheDocument();
    const pageTitle = screen.getByRole('heading', {name: '출퇴근 기록'});
    const titleRow = pageTitle.closest('.app-title-row');
    if (!titleRow) throw new Error('App title row is missing');

    expect(screen.getByRole('tab', {name: '기존'})).toHaveAttribute('aria-selected', 'true');
    expect(titleRow).toContainElement(screen.getByRole('tab', {name: '기존'}));
    expect(titleRow).toContainElement(screen.getByRole('tab', {name: '신규'}));
    expect(screen.getByRole('heading', {name: 'Jade 자동 연결'})).toBeInTheDocument();
    expect(screen.queryByLabelText('INSA Cookie')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    expect(screen.getByRole('button', {name: '엑셀로 다운로드'})).toBeDisabled();
    expect(screen.queryByRole('button', {name: '파일 저장'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: '설정'}));

    await userEvent.click(screen.getByRole('tab', {name: '신규'}));

    expect(screen.getByRole('tab', {name: '신규'})).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', {name: '수동인증'}));
    expect(screen.getByLabelText('INSA Cookie')).toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Jade 자동 연결'})).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    expect(screen.getByRole('button', {name: '엑셀로 다운로드'})).toBeDisabled();
    expect(screen.queryByRole('button', {name: '파일 저장'})).not.toBeInTheDocument();
  });

  test('returns to Jade authentication setup when the session expires', async () => {
    saveCredentials({
      cookie: 'expired-session',
      body: 'S_STD_YMD=20260812',
      parsedBody: {},
    });
    mockedFetchAttendanceForMonth.mockResolvedValue({
      '2026-08-12': {ymd: '2026-08-12', error: 'expired', authError: true},
    });

    render(<App />);

    expect(await screen.findByRole('heading', {name: 'Jade 자동 연결'})).toBeInTheDocument();
  });

  test('returns to INSA authentication setup when the session expires', async () => {
    saveInsaCookie('expired-session');
    mockedLoadInsaMonth.mockResolvedValue({
      ...monthResult(2026, new Date().getMonth()),
      errors: [{source: 'home', message: 'session expired', authError: true}],
    });

    render(<App />);
    await userEvent.click(screen.getByRole('tab', {name: '신규'}));

    expect(await screen.findByRole('heading', {name: '신규 인사시스템 연결'})).toBeInTheDocument();
  });

  test('places the authenticated Jade user label immediately left of settings', () => {
    saveCredentials({
      cookie: 'jade-session',
      body: 'S_STD_YMD=20260812',
      parsedBody: {S_EMP_NM: '김태섭', S_EMP_ID: '20250304'},
    });

    render(<App />);

    const headerActions = document.querySelector('.app-header-actions');
    const userLabel = screen.getByText('김태섭 (20250304)');
    const settingsButton = screen.getByRole('button', {name: '설정'});
    const exportButton = screen.getByRole('button', {name: '엑셀로 다운로드'});

    expect(headerActions).toContainElement(userLabel);
    expect(headerActions).toContainElement(exportButton);
    expect(headerActions).toContainElement(settingsButton);
    expect(exportButton).toHaveAttribute('title', '엑셀로 다운로드');
    expect(settingsButton).toHaveAttribute('title', '설정');
    expect(userLabel.compareDocumentPosition(settingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('places the Jade credential reset inside the settings menu', async () => {
    saveCredentials({
      cookie: 'jade-session',
      body: 'S_STD_YMD=20260812',
      parsedBody: {},
    });
    render(<App />);

    expect(screen.queryByRole('button', {name: '인증 정보 초기화'})).not.toBeInTheDocument();
    const settingsButton = screen.getByRole('button', {name: '설정'});
    expect(settingsButton.querySelector('svg')).toHaveClass('settings-icon');
    await userEvent.click(settingsButton);
    expect(screen.getByRole('button', {name: '인증 정보 초기화'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', {name: '신규'}));

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    expect(screen.getByRole('button', {name: '인증 정보 초기화'})).toBeDisabled();
  });

  test('opens the file save popup from the export icon', async () => {
    saveCredentials({
      cookie: 'jade-session',
      body: 'S_STD_YMD=20260812',
      parsedBody: {},
    });
    mockedFetchAttendanceForMonth.mockResolvedValue({
      '20260812': {
        ymd: '20260812',
        workDay: '(수)',
        workType: '기본근무',
        vacation: null,
        overtime: null,
        dayOffWork: null,
        remoteWork: null,
        clockIn: '0900',
        clockInChanged: false,
        clockInLocal: false,
        clockOut: '1800',
        clockOutChanged: false,
        clockOutLocal: false,
        workList: [],
        raw: {},
      },
    });

    render(<App />);
    const exportButton = await screen.findByRole('button', {name: '엑셀로 다운로드'});
    expect(exportButton).not.toBeDisabled();

    await userEvent.click(exportButton);

    expect(screen.getByRole('dialog', {name: 'CSV 다운로드 설정'})).toBeInTheDocument();
    expect(screen.getByText('기간과 항목을 선택한 뒤 CSV 파일로 저장합니다.')).toBeInTheDocument();
  });

  test('places the INSA connection reset inside the settings menu', async () => {
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

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    const resetButton = await screen.findByRole('button', {name: '인증 정보 초기화'});
    expect(screen.getAllByRole('button', {name: '인증 정보 초기화'})).toHaveLength(1);

    await userEvent.click(resetButton);

    expect(await screen.findByRole('heading', {name: '신규 인사시스템 연결'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '인증 정보 초기화'})).not.toBeInTheDocument();
  });

  test('starts in light mode until the user enables the dark mode setting', async () => {
    window.matchMedia = jest.fn().mockReturnValue({matches: true}) as typeof window.matchMedia;
    render(<App />);

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    const darkModeSwitch = screen.getByRole('switch', {name: '다크모드'});
    expect(darkModeSwitch).not.toBeChecked();

    await userEvent.click(darkModeSwitch);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('jade_in_out_theme_v1')).toBe('dark');
  });

  test('closes the settings menu with Escape', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    expect(screen.getByRole('dialog', {name: '설정'})).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', {name: '설정'})).not.toBeInTheDocument();
  });

  test('shows both system connection diagnostics in the settings menu', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    const dialog = screen.getByRole('dialog', {name: '설정'});

    expect(within(dialog).getByText('기존 시스템')).toBeInTheDocument();
    expect(within(dialog).getByText('신규 인사시스템')).toBeInTheDocument();
    expect(within(dialog).getAllByText('인증 필요')).toHaveLength(2);
  });

  test('shows a connected diagnostic after a successful INSA month request', async () => {
    saveInsaCookie('synthetic-session');
    render(<App />);

    await userEvent.click(screen.getByRole('tab', {name: '신규'}));
    await screen.findByText(/연차/);
    await screen.findByText(/^최근 조회/);
    await userEvent.click(screen.getByRole('button', {name: '설정'}));

    const dialog = screen.getByRole('dialog', {name: '설정'});
    expect(within(dialog).getByText('신규 인사시스템')).toBeInTheDocument();
    expect(within(dialog).getByText('연결됨')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('tab', {name: '수동인증'}));
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
