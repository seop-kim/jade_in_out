const { createProxyMiddleware } = require('http-proxy-middleware');

const TARGET = 'https://ehr.jadehr.co.kr';

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
};
