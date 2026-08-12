const { createProxyMiddleware } = require('http-proxy-middleware');

const TARGET = 'https://ehr.jadehr.co.kr';
const INSA_TARGET = 'https://insa.kwe.co.kr';

module.exports = function (app) {
  app.use(
    '/api/jade',
    createProxyMiddleware({
      target: TARGET,
      changeOrigin: true,
      secure: true,
      pathRewrite: { '^/api/jade': '' },
      logLevel: 'debug',
      onProxyReq: (proxyReq, req) => {
        const cookie = req.headers['x-jade-cookie'];
        if (cookie) {
          proxyReq.setHeader('Cookie', cookie);
        }
        proxyReq.setHeader('Origin', TARGET);
        proxyReq.setHeader('Referer', `${TARGET}/menuAction.do`);
        proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
        proxyReq.removeHeader('x-jade-cookie');

        console.log(
          `[jade-proxy] → ${req.method} ${req.url}  cookie=${cookie ? 'set' : 'MISSING'}  body=${req.headers['content-length'] ?? '?'}B`
        );
      },
      onProxyRes: (proxyRes, req) => {
        console.log(
          `[jade-proxy] ← ${req.method} ${req.url}  status=${proxyRes.statusCode}`
        );
      },
      onError: (err, req, res) => {
        console.error('[jade-proxy] error:', err.message);
        if (res && !res.headersSent && typeof res.writeHead === 'function') {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Proxy error: ' + err.message);
        }
      },
    })
  );

  app.use(
    '/api/insa',
    createProxyMiddleware({
      target: INSA_TARGET,
      changeOrigin: true,
      secure: true,
      pathRewrite: { '^/api/insa': '' },
      logLevel: 'debug',
      onProxyReq: (proxyReq, req) => {
        const cookie = req.headers['x-insa-cookie'];
        proxyReq.removeHeader('cookie');
        if (cookie) {
          proxyReq.setHeader('Cookie', cookie);
        }
        const refererPath = req.url.split('?')[0] || '/';
        proxyReq.setHeader('Origin', INSA_TARGET);
        proxyReq.setHeader('Referer', `${INSA_TARGET}${refererPath}`);
        proxyReq.removeHeader('x-insa-cookie');

        console.log(
          `[insa-proxy] ${req.method} ${req.url} cookieLength=${cookie ? cookie.length : 0}`
        );
      },
      onProxyRes: (proxyRes, req) => {
        console.log(
          `[insa-proxy] ${req.method} ${req.url} status=${proxyRes.statusCode}`
        );
      },
      onError: (err, req, res) => {
        console.error('[insa-proxy] error:', err.message);
        if (res && !res.headersSent && typeof res.writeHead === 'function') {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Proxy error: ' + err.message);
        }
      },
    })
  );
};
