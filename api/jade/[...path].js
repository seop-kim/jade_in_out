import https from 'node:https';

export const config = {
  api: { bodyParser: false },
};

const TARGET_HOST = 'ehr.jadehr.co.kr';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;

const HOP_BY_HOP = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
]);

const STRIP_INCOMING = new Set([
  'host',
  'connection',
  'content-length',
  'x-jade-cookie',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-vercel-id',
  'x-vercel-deployment-url',
  'x-vercel-forwarded-for',
  'x-real-ip',
  'forwarded',
  'cookie',
]);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getBodyBuffer(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.body)) {
        if (Array.isArray(v)) v.forEach((x) => params.append(k, x ?? ''));
        else params.append(k, v ?? '');
      }
      return Buffer.from(params.toString());
    }
    return Buffer.from(JSON.stringify(req.body));
  }
  return readRawBody(req);
}

export default async function handler(req, res) {
  const incoming = new URL(req.url, 'http://localhost');
  let pathname = incoming.pathname;
  if (pathname.startsWith('/api/jade')) {
    pathname = pathname.slice('/api/jade'.length) || '/';
  }
  const upstreamPath = pathname + incoming.search;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (STRIP_INCOMING.has(k.toLowerCase())) continue;
    if (v !== undefined) headers[k] = v;
  }
  headers['host'] = TARGET_HOST;
  headers['origin'] = TARGET_ORIGIN;
  headers['referer'] = `${TARGET_ORIGIN}/menuAction.do`;
  headers['x-requested-with'] = 'XMLHttpRequest';

  const cookie = req.headers['x-jade-cookie'];
  if (cookie) headers['cookie'] = cookie;

  let body = Buffer.alloc(0);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await getBodyBuffer(req);
    headers['content-length'] = String(body.length);
  }

  console.log('[jade-proxy] →', req.method, upstreamPath, {
    bodyLen: body.length,
    cookieLen: cookie ? cookie.length : 0,
    contentType: headers['content-type'] || null,
  });

  await new Promise((resolve) => {
    const upstreamReq = https.request(
      {
        hostname: TARGET_HOST,
        port: 443,
        path: upstreamPath,
        method: req.method,
        headers,
      },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on('data', (c) => chunks.push(c));
        upstreamRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          const respCt = upstreamRes.headers['content-type'] || '';
          console.log('[jade-proxy] ←', upstreamRes.statusCode, {
            len: buf.length,
            contentType: respCt,
            preview: buf.toString('utf8').slice(0, 160).replace(/\s+/g, ' '),
          });

          res.status(upstreamRes.statusCode || 502);
          for (const [k, v] of Object.entries(upstreamRes.headers)) {
            if (HOP_BY_HOP.has(k.toLowerCase())) continue;
            if (v !== undefined) res.setHeader(k, v);
          }
          res.send(buf);
          resolve();
        });
      }
    );

    upstreamReq.on('error', (err) => {
      console.error('[jade-proxy] upstream error:', err.message);
      if (!res.headersSent) {
        res.status(502).send('Proxy error: ' + err.message);
      }
      resolve();
    });

    if (body.length > 0) upstreamReq.write(body);
    upstreamReq.end();
  });
}
