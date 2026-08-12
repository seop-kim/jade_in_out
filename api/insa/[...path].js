import https from 'node:https';

export const config = {
  api: {bodyParser: false},
};

const TARGET_HOST = 'insa.kwe.co.kr';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const ALLOWED_METHODS = new Set(['GET', 'POST']);
const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-encoding',
  'content-length',
  'cache-control',
  'expires',
  'etag',
  'last-modified',
  'vary',
]);

const HOP_BY_HOP = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailers',
  'upgrade',
]);

const STRIP_INCOMING = new Set([
  'host',
  'content-length',
  'cookie',
  'forwarded',
  'x-insa-cookie',
  'x-real-ip',
]);

function shouldStripIncoming(name) {
  const normalized = name.toLowerCase();
  return HOP_BY_HOP.has(normalized)
    || STRIP_INCOMING.has(normalized)
    || normalized.startsWith('x-forwarded-')
    || normalized.startsWith('x-vercel-');
}

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

function sendProxyError(res) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = 502;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Proxy error');
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.end('Method Not Allowed');
    return;
  }

  const incoming = new URL(req.url || '/', 'http://localhost');
  let pathname = incoming.pathname;
  if (pathname.startsWith('/api/insa')) {
    pathname = pathname.slice('/api/insa'.length) || '/';
  }
  const upstreamPath = pathname + incoming.search;

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!shouldStripIncoming(name) && value !== undefined) {
      headers[name] = value;
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
