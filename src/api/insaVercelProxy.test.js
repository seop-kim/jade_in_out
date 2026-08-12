import {EventEmitter} from 'node:events';
import https from 'node:https';
import handler from '../../api/insa/[...path]';

jest.mock('node:https', () => ({
  request: jest.fn(),
}));

const FAKE_COOKIE = 'User_ID=fake-user; ASPSESSIONID=fake-session';

function createRequest({method = 'GET', url = '/api/insa/main.asp', headers = {}} = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function createResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    body: Buffer.alloc(0),
  };
  res.setHeader = jest.fn((name, value) => {
    res.headers[name.toLowerCase()] = value;
  });
  res.end = jest.fn((body = Buffer.alloc(0)) => {
    res.body = Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.headersSent = true;
  });
  return res;
}

function arrangeUpstream({
  statusCode = 200,
  headers = {},
  chunks = [],
  requestError = null,
  responseError = null,
} = {}) {
  const upstreamReq = new EventEmitter();
  upstreamReq.write = jest.fn();
  upstreamReq.end = jest.fn(() => {
    if (requestError) {
      upstreamReq.emit('error', requestError);
      return;
    }

    const callback = https.request.mock.calls[0][1];
    const upstreamRes = new EventEmitter();
    upstreamRes.statusCode = statusCode;
    upstreamRes.headers = headers;
    callback(upstreamRes);

    if (responseError) {
      upstreamRes.emit('error', responseError);
      return;
    }
    chunks.forEach((chunk) => upstreamRes.emit('data', chunk));
    upstreamRes.emit('end');
  });
  https.request.mockReturnValue(upstreamReq);
  return upstreamReq;
}

describe('Vercel INSA proxy', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('proxies a raw POST with sanitized request and response headers', async () => {
    const rawBody = Buffer.from('sType=0&sdt=2026-08-01&edt=2026-08-11');
    const rawResponse = Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]);
    const upstreamReq = arrangeUpstream({
      statusCode: 206,
      headers: {
        'content-type': 'text/html; charset=euc-kr',
        'content-encoding': 'gzip',
        'content-length': '4',
        'cache-control': 'private',
        expires: 'Wed, 12 Aug 2026 03:00:00 GMT',
        etag: '"safe-etag"',
        'last-modified': 'Wed, 12 Aug 2026 02:00:00 GMT',
        vary: 'Accept-Encoding',
        'set-cookie': ['ASPSESSIONID=upstream-secret'],
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'",
        'x-frame-options': 'SAMEORIGIN',
        location: 'https://insa.kwe.co.kr/login.asp',
      },
      chunks: [rawResponse.subarray(0, 2), rawResponse.subarray(2)],
    });
    const req = createRequest({
      method: 'POST',
      url: '/api/insa/worktime/01_list.asp?source=calendar',
      headers: {
        host: 'preview.example.test',
        cookie: 'browser-cookie=must-not-forward',
        forwarded: 'for=192.0.2.1',
        'x-forwarded-for': '192.0.2.1',
        'x-forwarded-host': 'preview.example.test',
        'x-vercel-id': 'secret-routing-id',
        'x-insa-cookie': FAKE_COOKIE,
        authorization: 'Bearer synthetic-token',
        'x-api-key': 'synthetic-api-key',
        'x-custom-transport': 'must-not-forward',
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/html',
      },
    });
    const res = createResponse();

    const pending = handler(req, res);
    req.emit('data', rawBody.subarray(0, 10));
    req.emit('data', rawBody.subarray(10));
    req.emit('end');
    await pending;

    const options = https.request.mock.calls[0][0];
    expect(options).toMatchObject({
      hostname: 'insa.kwe.co.kr',
      port: 443,
      method: 'POST',
      path: '/worktime/01_list.asp?source=calendar',
    });
    expect(options.headers).toEqual({
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
      host: 'insa.kwe.co.kr',
      origin: 'https://insa.kwe.co.kr',
      referer: 'https://insa.kwe.co.kr/worktime/01_list.asp',
      cookie: FAKE_COOKIE,
      'content-length': String(rawBody.length),
    });
    expect(upstreamReq.write).toHaveBeenCalledTimes(1);
    expect(upstreamReq.write.mock.calls[0][0]).toEqual(rawBody);
    expect(res.statusCode).toBe(206);
    expect(res.body).toEqual(rawResponse);
    expect(res.headers).toEqual({
      'content-type': 'text/html; charset=euc-kr',
      'content-encoding': 'gzip',
      'content-length': '4',
      'cache-control': 'no-store, private',
      vary: 'Accept-Encoding',
    });
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(FAKE_COOKIE);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(FAKE_COOKIE);
  });

  test.each([
    ['GET', '/api/insa/main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=1'],
    ['GET', '/api/insa/leave/01_list.asp'],
    ['POST', '/api/insa/worktime/01_list.asp'],
  ])('allows the intended %s %s request', async (method, url) => {
    arrangeUpstream();
    const req = createRequest({method, url});
    const res = createResponse();

    const pending = handler(req, res);
    if (method === 'POST') req.emit('end');
    await pending;

    expect(https.request).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['POST', '/api/insa/main.asp', 405, 'GET'],
    ['GET', '/api/insa/worktime/01_list.asp', 405, 'POST'],
    ['GET', '/api/insa/main.asp/extra', 404, undefined],
    ['GET', '/api/insa/admin.asp', 404, undefined],
  ])('rejects %s %s without opening an upstream request', async (method, url, statusCode, allow) => {
    arrangeUpstream();
    const req = createRequest({method, url});
    const res = createResponse();

    const pending = handler(req, res);
    if (method === 'POST') req.emit('end');
    await pending;

    expect(https.request).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(statusCode);
    expect(res.headers.allow).toBe(allow);
  });

  test('completes with a sanitized 502 when reading the POST body fails', async () => {
    const req = createRequest({
      method: 'POST',
      url: '/api/insa/worktime/01_list.asp',
      headers: {'x-insa-cookie': FAKE_COOKIE},
    });
    const res = createResponse();

    const pending = handler(req, res);
    req.emit('error', new Error(`read failed for ${FAKE_COOKIE}`));
    await pending;

    expect(https.request).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.body.toString()).toBe('Proxy error');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(FAKE_COOKIE);
  });

  test.each([
    ['upstream request', {requestError: new Error(`request failed for ${FAKE_COOKIE}`)}],
    ['upstream response', {responseError: new Error(`response failed for ${FAKE_COOKIE}`)}],
  ])('completes with a sanitized 502 on an %s error', async (_label, failure) => {
    arrangeUpstream(failure);
    const req = createRequest({headers: {'x-insa-cookie': FAKE_COOKIE}});
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.toString()).toBe('Proxy error');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(FAKE_COOKIE);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(FAKE_COOKIE);
  });
});
