import {INSA_BRIDGE_ORIGIN, InsaBridgeClient, createInsaBookmarklet} from './insaBridge';

function createPopup(): Window & {postMessage: jest.Mock} {
  return {
    closed: false,
    postMessage: jest.fn(),
  } as unknown as Window & {postMessage: jest.Mock};
}

describe('INSA browser bridge', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a bookmarklet that relays same-origin requests without reading cookies', () => {
    const bookmarklet = createInsaBookmarklet('http://localhost:3000');

    expect(bookmarklet).toMatch(/^javascript:/);
    expect(bookmarklet).toContain(INSA_BRIDGE_ORIGIN);
    expect(bookmarklet).toContain('credentials');
    expect(bookmarklet).not.toContain('document.cookie');
  });

  test('resolves a request after the logged-in INSA window sends a response', async () => {
    const popup = createPopup();
    const client = new InsaBridgeClient(popup, 'http://localhost:3000');

    window.dispatchEvent(new MessageEvent('message', {
      origin: INSA_BRIDGE_ORIGIN,
      source: popup,
      data: {type: 'insa-bridge-ready', version: 1},
    }));

    const responsePromise = client.request('/leave/01_list.asp', {method: 'GET'});
    const requestMessage = popup.postMessage.mock.calls[0]?.[0];

    expect(requestMessage).toMatchObject({
      type: 'insa-bridge-request',
      path: '/leave/01_list.asp',
      method: 'GET',
    });

    window.dispatchEvent(new MessageEvent('message', {
      origin: INSA_BRIDGE_ORIGIN,
      source: popup,
      data: {
        type: 'insa-bridge-response',
        requestId: requestMessage.requestId,
        ok: true,
        status: 200,
        body: '<html>leave</html>',
      },
    }));

    await expect(responsePromise).resolves.toBe('<html>leave</html>');
    client.dispose();
  });

  test('rejects requests for paths outside the supported INSA pages', async () => {
    const popup = createPopup();
    const client = new InsaBridgeClient(popup, 'http://localhost:3000');

    window.dispatchEvent(new MessageEvent('message', {
      origin: INSA_BRIDGE_ORIGIN,
      source: popup,
      data: {type: 'insa-bridge-ready', version: 1},
    }));

    await expect(client.request('/admin/delete.asp', {method: 'GET'})).rejects.toThrow('지원하지 않는');
    expect(popup.postMessage).not.toHaveBeenCalled();
    client.dispose();
  });
});
