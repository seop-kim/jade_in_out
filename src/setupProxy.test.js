jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(),
}));

const {createProxyMiddleware} = require('http-proxy-middleware');
const setupProxy = require('./setupProxy');

function registeredOptions(app, route) {
  const registrationIndex = app.use.mock.calls.findIndex(
    ([registeredRoute]) => registeredRoute === route
  );
  return createProxyMiddleware.mock.calls[registrationIndex]?.[0];
}

describe('setupProxy', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(createProxyMiddleware).toHaveBeenCalledTimes(2);
  });

  test('converts the INSA transport header without logging its value', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const cookie = 'User_ID=test-user; ASPSESSIONID=fake-session';

    try {
      setupProxy(app);
      const options = registeredOptions(app, '/api/insa');
      expect(options).toBeDefined();

      const proxyReq = {
        setHeader: jest.fn(),
        removeHeader: jest.fn(),
      };
      options.onProxyReq(proxyReq, {
        method: 'POST',
        url: '/worktime/01_list.asp?range=current',
        headers: {'x-insa-cookie': cookie},
      });

      expect(proxyReq.setHeader).toHaveBeenCalledWith('Cookie', cookie);
      expect(proxyReq.setHeader).toHaveBeenCalledWith(
        'Referer',
        'https://insa.kwe.co.kr/worktime/01_list.asp'
      );
      expect(proxyReq.removeHeader).toHaveBeenCalledWith('cookie');
      expect(proxyReq.removeHeader).toHaveBeenCalledWith('x-insa-cookie');
      expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain(cookie);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
