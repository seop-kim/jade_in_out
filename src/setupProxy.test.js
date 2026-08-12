jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(),
}));

const {createProxyMiddleware} = require('http-proxy-middleware');
const setupProxy = require('./setupProxy');

function registeredOptions(app, route) {
  const target = route === '/api/jade' ? 'https://ehr.jadehr.co.kr' : 'https://insa.kwe.co.kr';
  return createProxyMiddleware.mock.calls.find(([options]) => options.target === target)?.[0];
}

function registeredMiddleware(app, route, index) {
  const registration = app.use.mock.calls.find(([registeredRoute]) => registeredRoute === route);
  return registration?.[index];
}

function createResponse() {
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    end: jest.fn(),
  };
}

function createProxyRequest(initialHeaders) {
  const headers = new Map(
    Object.entries(initialHeaders).map(([name, value]) => [name.toLowerCase(), value])
  );
  return {
    headers,
    getHeaderNames: jest.fn(() => Array.from(headers.keys())),
    setHeader: jest.fn((name, value) => headers.set(name.toLowerCase(), value)),
    removeHeader: jest.fn((name) => headers.delete(name.toLowerCase())),
  };
}

describe('setupProxy', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    createProxyMiddleware
      .mockReturnValueOnce(jest.fn())
      .mockReturnValueOnce(jest.fn());
    app = {use: jest.fn()};
  });

  test('registers independent Jade and INSA proxy routes', () => {
    setupProxy(app);

    expect(app.use.mock.calls.map(([route]) => route)).toEqual(['/api/jade', '/api/insa']);
    expect(registeredOptions(app, '/api/jade')).toMatchObject({
      target: 'https://ehr.jadehr.co.kr',
      changeOrigin: true,
      pathRewrite: {'^/api/jade': ''},
    });
    expect(registeredOptions(app, '/api/insa')).toMatchObject({
      target: 'https://insa.kwe.co.kr',
      changeOrigin: true,
      pathRewrite: {'^/api/insa': ''},
    });
    expect(registeredMiddleware(app, '/api/insa', 1)).toEqual(expect.any(Function));
    expect(registeredMiddleware(app, '/api/insa', 2)).toEqual(expect.any(Function));
    expect(createProxyMiddleware).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['GET', '/api/insa/main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=1'],
    ['GET', '/api/insa/leave/01_list.asp'],
    ['POST', '/api/insa/worktime/01_list.asp'],
  ])('allows only the intended %s %s request through the CRA gate', (method, originalUrl) => {
    setupProxy(app);
    const gate = registeredMiddleware(app, '/api/insa', 1);
    const next = jest.fn();
    const res = createResponse();

    gate({method, originalUrl, url: originalUrl.replace('/api/insa', '')}, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.end).not.toHaveBeenCalled();
  });

  test.each([
    ['POST', '/api/insa/main.asp', 405],
    ['GET', '/api/insa/worktime/01_list.asp', 405],
    ['GET', '/api/insa/main.asp/extra', 404],
    ['GET', '/api/insa/admin.asp', 404],
  ])('rejects %s %s before the CRA proxy with %s', (method, originalUrl, statusCode) => {
    setupProxy(app);
    const gate = registeredMiddleware(app, '/api/insa', 1);
    const next = jest.fn();
    const res = createResponse();

    gate({method, originalUrl, url: originalUrl.replace('/api/insa', '')}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(statusCode);
    expect(res.end).toHaveBeenCalled();
  });

  test('converts only the INSA transport Cookie and an explicit safe header allowlist', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const cookie = 'User_ID=test-user; ASPSESSIONID=fake-session';

    try {
      setupProxy(app);
      const options = registeredOptions(app, '/api/insa');
      expect(options).toBeDefined();

      const proxyReq = createProxyRequest({
        accept: 'text/html',
        'accept-encoding': 'gzip',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': '42',
        authorization: 'Bearer synthetic-token',
        'x-api-key': 'synthetic-api-key',
        cookie: 'browser-cookie=must-not-forward',
        forwarded: 'for=192.0.2.1',
        'x-forwarded-for': '192.0.2.1',
        'x-vercel-id': 'synthetic-routing-id',
        'x-insa-cookie': cookie,
        'x-custom-transport': 'must-not-forward',
      });
      options.onProxyReq(proxyReq, {
        method: 'POST',
        url: '/worktime/01_list.asp?range=current',
        headers: {'x-insa-cookie': cookie},
      });

      expect(Object.fromEntries(proxyReq.headers)).toEqual({
        accept: 'text/html',
        'accept-encoding': 'gzip',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': '42',
        host: 'insa.kwe.co.kr',
        cookie,
        origin: 'https://insa.kwe.co.kr',
        referer: 'https://insa.kwe.co.kr/worktime/01_list.asp',
      });
      expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain(cookie);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test('overrides upstream cache metadata on CRA INSA responses', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      setupProxy(app);
      const options = registeredOptions(app, '/api/insa');
      const proxyRes = {
        statusCode: 200,
        headers: {
          'content-type': 'text/html; charset=euc-kr',
          'cache-control': 'public, max-age=3600',
          expires: 'Thu, 13 Aug 2026 00:00:00 GMT',
          etag: '"synthetic-etag"',
          'last-modified': 'Wed, 12 Aug 2026 00:00:00 GMT',
        },
      };

      options.onProxyRes(proxyRes, {method: 'GET', url: '/main.asp'});

      expect(proxyRes.headers).toEqual({
        'content-type': 'text/html; charset=euc-kr',
        'cache-control': 'no-store, private',
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
