export const config = {
  api: { bodyParser: false },
};

const TARGET = 'https://ehr.jadehr.co.kr';

const HOP_BY_HOP = new Set([
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
]);

const SKIP_INCOMING = new Set([
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
]);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function reEncodeParsedBody(req) {
  if (req.body === undefined || req.body === null) return null;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;

  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.body)) {
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x ?? ''));
      else params.append(k, v ?? '');
    }
    return params.toString();
  }
  return JSON.stringify(req.body);
}

export default async function handler(req, res) {
  const segments = req.query.path || [];
  const pathname =
    '/' + (Array.isArray(segments) ? segments.join('/') : segments);
  const url = TARGET + pathname;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (SKIP_INCOMING.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  headers['Origin'] = TARGET;
  headers['Referer'] = `${TARGET}/menuAction.do`;
  headers['X-Requested-With'] = 'XMLHttpRequest';

  const cookie = req.headers['x-jade-cookie'];
  if (cookie) headers['Cookie'] = cookie;

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const parsed = reEncodeParsedBody(req);
    body = parsed !== null ? parsed : await readRawBody(req);
  }

  try {
    const upstream = await fetch(url, { method: req.method, headers, body });
    const buf = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) return;
      res.setHeader(key, value);
    });
    res.send(buf);
  } catch (err) {
    res.status(502).send('Proxy error: ' + (err?.message ?? String(err)));
  }
}
