const { createProxyMiddleware } = require('http-proxy-middleware');

const TARGET = 'https://ehr.jadehr.co.kr';
const INSA_TARGET = 'https://insa.kwe.co.kr';
const INSA_HOST = 'insa.kwe.co.kr';
const INSA_ROUTES = new Map([
  ['/main.asp', 'GET'],
  ['/leave/01_list.asp', 'GET'],
  ['/worktime/01_list.asp', 'POST'],
]);
const INSA_REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-encoding',
  'content-length',
  'content-type',
]);
const INSA_CACHE_HEADERS = new Set(['cache-control', 'expires', 'etag', 'last-modified']);

function insaPath(req) {
  const requestUrl = req.originalUrl || req.url || '/';
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  if (pathname === '/api/insa') return '/';
  return pathname.startsWith('/api/insa/')
    ? pathname.slice('/api/insa'.length)
    : pathname;
}

function gateInsaRequest(req, res, next) {
  const pathname = insaPath(req);
  const allowedMethod = INSA_ROUTES.get(pathname);
  if (!allowedMethod) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const method = (req.method || 'GET').toUpperCase();
  if (method !== allowedMethod) {
    res.statusCode = 405;
    res.setHeader('Allow', allowedMethod);
    res.end('Method Not Allowed');
    return;
  }

  next();
}

function cookieHeaderValue(value) {
  return Array.isArray(value) ? value.join('; ') : value;
}

function sanitizeInsaRequestHeaders(proxyReq) {
  for (const name of proxyReq.getHeaderNames()) {
    if (!INSA_REQUEST_HEADER_ALLOWLIST.has(name.toLowerCase())) {
      proxyReq.removeHeader(name);
    }
  }
}

function preventInsaResponseCaching(proxyRes) {
  for (const name of Object.keys(proxyRes.headers)) {
    if (INSA_CACHE_HEADERS.has(name.toLowerCase())) delete proxyRes.headers[name];
  }
  proxyRes.headers['cache-control'] = 'no-store, private';
}

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
    gateInsaRequest,
    createProxyMiddleware({
      target: INSA_TARGET,
      changeOrigin: true,
      secure: true,
      pathRewrite: { '^/api/insa': '' },
      logLevel: 'debug',
      onProxyReq: (proxyReq, req) => {
        const cookie = cookieHeaderValue(req.headers['x-insa-cookie']);
        sanitizeInsaRequestHeaders(proxyReq);
        proxyReq.setHeader('Host', INSA_HOST);
        if (cookie) {
          proxyReq.setHeader('Cookie', cookie);
        }
        proxyReq.setHeader('Origin', INSA_TARGET);
        proxyReq.setHeader('Referer', `${INSA_TARGET}${insaPath(req)}`);

        console.log(
          `[insa-proxy] ${req.method} ${req.url} cookieLength=${cookie ? cookie.length : 0}`
        );
      },
      onProxyRes: (proxyRes, req) => {
        preventInsaResponseCaching(proxyRes);
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
