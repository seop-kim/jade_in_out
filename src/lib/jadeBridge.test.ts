import {
  JADE_APP_WINDOW_NAME,
  JADE_BRIDGE_ORIGIN,
  JadeBridgeClient,
  createJadeBookmarklet,
  isJadeAttendanceResponse,
} from './jadeBridge';

function createTab(): Window & {postMessage: jest.Mock} {
  return {
    closed: false,
    postMessage: jest.fn(),
  } as unknown as Window & {postMessage: jest.Mock};
}

describe('Jade browser bridge', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a bookmarklet that captures request bodies without reading cookies', () => {
    const bookmarklet = createJadeBookmarklet('http://localhost:3000');

    expect(bookmarklet).toMatch(/^javascript:/);
    expect(bookmarklet).toContain(JADE_BRIDGE_ORIGIN);
    expect(bookmarklet).toContain('XMLHttpRequest');
    expect(bookmarklet).toContain('commonAction.do');
    expect(bookmarklet).toContain(JADE_APP_WINDOW_NAME);
    expect(bookmarklet).not.toContain('document.cookie');
  });

  test('recognizes the attendance XML shape and ignores unrelated Jade responses', () => {
    expect(isJadeAttendanceResponse('<SHEET><ETC KEY="YMD">20260813</ETC><ETC KEY="EMP_ID">20250304</ETC><ETC KEY="WORK_TYPE_NM">기본근무</ETC></SHEET>')).toBe(true);
    expect(isJadeAttendanceResponse('<SHEET><ETC KEY="YMD">20260813</ETC></SHEET>')).toBe(false);
    expect(isJadeAttendanceResponse('<SHEET><MESSAGE><![CDATA[]]></MESSAGE></SHEET>')).toBe(false);
  });

  test('reports the Jade bridge ready state and captured request body', () => {
    const tab = createTab();
    const onReady = jest.fn();
    const onBody = jest.fn();
    const client = new JadeBridgeClient(tab, 'http://localhost:3000', onReady, onBody);

    window.dispatchEvent(new MessageEvent('message', {
      origin: JADE_BRIDGE_ORIGIN,
      source: tab,
      data: {type: 'jade-bridge-ready', version: 1},
    }));
    window.dispatchEvent(new MessageEvent('message', {
      origin: JADE_BRIDGE_ORIGIN,
      source: tab,
      data: {
        type: 'jade-bridge-body',
        body: 'S_STD_YMD=20260812&S_EMP_ID=20250304',
      },
    }));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onBody).toHaveBeenCalledWith('S_STD_YMD=20260812&S_EMP_ID=20250304');
    client.dispose();
  });

  test('reports only the normal attendance response with its request body', () => {
    const tab = createTab();
    const onAttendance = jest.fn();
    const client = new JadeBridgeClient(
      tab,
      'http://localhost:3000',
      undefined,
      undefined,
      onAttendance,
    );
    const body = 'S_STD_YMD=20260813&S_EMP_ID=20250304';
    const response = '<SHEET><ETC-DATA><ETC KEY="YMD"><![CDATA[20260813]]></ETC><ETC KEY="EMP_ID"><![CDATA[20250304]]></ETC><ETC KEY="WORK_TYPE_NM"><![CDATA[기본근무]]></ETC></ETC-DATA></SHEET>';

    window.dispatchEvent(new MessageEvent('message', {
      origin: JADE_BRIDGE_ORIGIN,
      source: tab,
      data: {type: 'jade-bridge-attendance', body, response},
    }));

    expect(onAttendance).toHaveBeenCalledWith(body, response);
    client.dispose();
  });

  test('resolves a Jade request after the logged-in tab returns XML', async () => {
    const tab = createTab();
    const client = new JadeBridgeClient(tab, 'http://localhost:3000');

    window.dispatchEvent(new MessageEvent('message', {
      origin: JADE_BRIDGE_ORIGIN,
      source: tab,
      data: {type: 'jade-bridge-ready', version: 1},
    }));

    const responsePromise = client.post(
      '/commonAction.do',
      'S_STD_YMD=20260812',
    );
    const requestMessage = tab.postMessage.mock.calls[0]?.[0];

    expect(requestMessage).toMatchObject({
      type: 'jade-bridge-request',
      path: '/commonAction.do',
      method: 'POST',
      body: 'S_STD_YMD=20260812',
    });

    window.dispatchEvent(new MessageEvent('message', {
      origin: JADE_BRIDGE_ORIGIN,
      source: tab,
      data: {
        type: 'jade-bridge-response',
        requestId: requestMessage.requestId,
        ok: true,
        status: 200,
        body: '<ROOT />',
      },
    }));

    await expect(responsePromise).resolves.toBe('<ROOT />');
    client.dispose();
  });
});
