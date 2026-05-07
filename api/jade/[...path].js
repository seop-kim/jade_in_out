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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  const segments = req.query.path || [];
  const pathname =
    '/' + (Array.isArray(segments) ? segments.join('/') : segments);
  const url = TARGET + pathname;

  const headers = {
    Origin: TARGET,
    Referer: `${TARGET}/menuAction.do`,
    'X-Requested-With': 'XMLHttpRequest',
  };
  const cookie = req.headers['x-jade-cookie'];
  if (cookie) headers['Cookie'] = cookie;
  if (req.headers['content-type'])
    headers['Content-Type'] = req.headers['content-type'];

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readRawBody(req);
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

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
