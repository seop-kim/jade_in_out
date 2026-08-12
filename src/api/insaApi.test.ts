import {TextDecoder, TextEncoder} from 'util';

import {
  fetchInsaDayDetails,
  fetchInsaHomeMonth,
  fetchInsaWorktime,
  getWorktimeRange,
  loadInsaMonth,
} from './insaApi';

Object.defineProperty(global, 'TextDecoder', {value: TextDecoder, configurable: true});
Object.defineProperty(global, 'TextEncoder', {value: TextEncoder, configurable: true});

const worktimeHtml = '<table class="tbltop"></table>';
const homeHtml = `
  <table><tbody><tr>
    <td onclick="location.replace('main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=1')"></td>
  </tr></tbody></table>`;
const leaveHtml = '<table class="tbltop"></table><table class="tbltop"></table>';

function encodedHtmlResponse(html: string): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  } as Response;
}

function eucKrResponse(bytes: number[]): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as Response;
}

describe('INSA API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns the complete range for a past month', () => {
    expect(getWorktimeRange(2026, 6, new Date(2026, 7, 12))).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    });
  });

  test('clamps the current month worktime range to yesterday', () => {
    expect(getWorktimeRange(2026, 7, new Date(2026, 7, 12))).toEqual({
      start: '2026-08-01',
      end: '2026-08-11',
    });
  });

  test('does not request worktime for a future month or before the current month has elapsed a day', () => {
    expect(getWorktimeRange(2026, 8, new Date(2026, 7, 12))).toBeNull();
    expect(getWorktimeRange(2026, 7, new Date(2026, 7, 1))).toBeNull();
  });

  test('gets the selected home month with one-based INSA query values and omits ambient credentials', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(encodedHtmlResponse(homeHtml));

    await fetchInsaHomeMonth({cookie: 'test-session', year: 2026, month: 7});

    expect(fetchSpy).toHaveBeenCalledWith('/api/insa/main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=1', {
      method: 'GET',
      headers: {'X-Insa-Cookie': 'test-session'},
      signal: undefined,
      credentials: 'omit',
      cache: 'no-store',
    });
  });

  test('posts form-urlencoded worktime criteria through the INSA proxy', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(encodedHtmlResponse(worktimeHtml));

    await fetchInsaWorktime('test-session', {start: '2026-08-01', end: '2026-08-11'});

    expect(fetchSpy).toHaveBeenCalledWith('/api/insa/worktime/01_list.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Insa-Cookie': 'test-session',
      },
      body: 'sType=0&sdt=2026-08-01&edt=2026-08-11',
      signal: undefined,
      credentials: 'omit',
      cache: 'no-store',
    });
  });

  test('decodes raw EUC-KR response bytes before parsing day details', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(eucKrResponse([
      ...new TextEncoder().encode('<table class="tbltop"><tr><td>'),
      0xb0, 0xa1,
      ...new TextEncoder().encode('</td><td>schedule</td><td>duration</td></tr></table>'),
    ]));

    await expect(fetchInsaDayDetails({cookie: 'test-session', ymd: '2026-08-05'})).resolves.toEqual([
      {ymd: '2026-08-05', name: '가', scheduleLabel: 'schedule', durationLabel: 'duration'},
    ]);
  });

  test('forwards an abort signal to the INSA request', async () => {
    const controller = new AbortController();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(encodedHtmlResponse(worktimeHtml));

    await fetchInsaWorktime('test-session', {start: '2026-08-01', end: '2026-08-11'}, controller.signal);

    expect(fetchSpy).toHaveBeenCalledWith('/api/insa/worktime/01_list.asp', expect.objectContaining({
      signal: controller.signal,
    }));
  });

  test('keeps successful sources when one monthly request fails', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(encodedHtmlResponse(homeHtml))
      .mockResolvedValueOnce({ok: false, status: 500} as Response)
      .mockResolvedValueOnce(encodedHtmlResponse(leaveHtml));

    const result = await loadInsaMonth({
      cookie: 'test-session',
      year: 2026,
      month: 7,
      today: new Date(2026, 7, 12),
    });

    expect(result.home).not.toBeNull();
    expect(result.leave).not.toBeNull();
    expect(result.worktime).toBeNull();
    expect(result.errors).toEqual([{source: 'worktime', message: 'HTTP 500'}]);
  });

  test('reports each monthly source when its request starts and completes', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(encodedHtmlResponse(homeHtml))
      .mockResolvedValueOnce(encodedHtmlResponse(worktimeHtml))
      .mockResolvedValueOnce(encodedHtmlResponse(leaveHtml));
    const started: string[] = [];
    const completed: string[] = [];

    await loadInsaMonth({
      cookie: 'test-session',
      year: 2026,
      month: 7,
      today: new Date(2026, 7, 12),
      onRequestStart: (source) => started.push(source),
      onRequestEnd: (source) => completed.push(source),
    });

    expect(started).toEqual(expect.arrayContaining(['home', 'worktime', 'leave']));
    expect(completed).toEqual(expect.arrayContaining(['home', 'worktime', 'leave']));
    expect(started).toHaveLength(3);
    expect(completed).toHaveLength(3);
  });
});
