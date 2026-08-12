import https from 'node:https';

export const config = {
  api: {bodyParser: false},
};

const TARGET_HOST = 'insa.kwe.co.kr';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const ALLOWED_ROUTES = new Map([
  ['/main.asp', 'GET'],
  ['/leave/01_list.asp', 'GET'],
  ['/worktime/01_list.asp', 'POST'],
]);
const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-encoding',
  'content-type',
]);
const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-encoding',
  'content-length',
  'vary',
]);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cookieHeaderValue(value) {
  return Array.isArray(value) ? value.join('; ') : value;
}

function copyResponseHeaders(upstreamHeaders, res) {
  for (const [name, value] of Object.entries(upstreamHeaders)) {
    if (!SAFE_RESPONSE_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
    res.setHeader(name, value);
  }
}

function preventResponseCaching(res) {
  res.setHeader('Cache-Control', 'no-store, private');
}

function rejectRequest(res, statusCode, message, allow) {
  res.statusCode = statusCode;
  preventResponseCaching(res);
  if (allow) res.setHeader('Allow', allow);
  res.end(message);
}

function sendProxyError(res) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = 502;
  preventResponseCaching(res);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Proxy error');
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  const incoming = new URL(req.url || '/', 'http://localhost');
  const splat = req.query?.path;
  let pathname;
  if (splat !== undefined) {
    const segments = Array.isArray(splat) ? splat : [splat];
    pathname = `/${segments.filter(Boolean).join('/')}`;
  } else {
    pathname = incoming.pathname;
    if (pathname.startsWith('/api/insa')) {
      pathname = pathname.slice('/api/insa'.length) || '/';
    }
  }
  const allowedMethod = ALLOWED_ROUTES.get(pathname);
  if (!allowedMethod) {
    rejectRequest(res, 404, 'Not Found');
    return;
  }
  if (method !== allowedMethod) {
    rejectRequest(res, 405, 'Method Not Allowed', allowedMethod);
    return;
  }
  const upstreamQuery = new URLSearchParams(incoming.search);
  if (splat !== undefined) upstreamQuery.delete('path');
  const queryString = upstreamQuery.toString();
  const upstreamPath = pathname + (queryString ? `?${queryString}` : '');

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const normalized = name.toLowerCase();
    if (REQUEST_HEADER_ALLOWLIST.has(normalized) && value !== undefined) {
      headers[normalized] = value;
    }
  }

  const cookie = cookieHeaderValue(req.headers['x-insa-cookie']);
  headers.host = TARGET_HOST;
  headers.origin = TARGET_ORIGIN;
  headers.referer = `${TARGET_ORIGIN}${pathname}`;
  if (cookie) headers.cookie = cookie;

  let body = Buffer.alloc(0);
  try {
    if (method === 'POST') body = await readRawBody(req);
  } catch {
    console.error('[insa-proxy] request body error');
    sendProxyError(res);
    return;
  }

  if (method === 'POST') headers['content-length'] = String(body.length);

  console.log(`[insa-proxy] ${method} ${upstreamPath}`, {
    bodyLength: body.length,
    cookieLength: cookie ? cookie.length : 0,
  });

  await new Promise((resolve) => {
    const upstreamReq = https.request(
      {
        hostname: TARGET_HOST,
        port: 443,
        path: upstreamPath,
        method,
        headers,
      },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        upstreamRes.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          res.statusCode = upstreamRes.statusCode || 502;
          copyResponseHeaders(upstreamRes.headers, res);
          preventResponseCaching(res);
          res.end(responseBody);
          console.log(`[insa-proxy] ${method} ${upstreamPath} status=${res.statusCode} bodyLength=${responseBody.length}`);
          resolve();
        });
        upstreamRes.on('error', () => {
          console.error('[insa-proxy] response error');
          sendProxyError(res);
          resolve();
        });
      }
    );

    upstreamReq.on('error', () => {
      console.error('[insa-proxy] upstream error');
      sendProxyError(res);
      resolve();
    });

    if (body.length > 0) upstreamReq.write(body);
    upstreamReq.end();
  });
}
