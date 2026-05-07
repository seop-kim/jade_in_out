import axios from 'axios';

const ENDPOINT = '/api/jade/commonAction.do';

const client = axios.create({
  timeout: 15000,
  responseType: 'text',
  transformResponse: (data) => data,
});

function pad(n) {
  return String(n).padStart(2, '0');
}

function toYmd(year, month, day) {
  return `${year}${pad(month + 1)}${pad(day)}`;
}

function buildFormBody(parsedBody, ymd) {
  const params = new URLSearchParams();
  let stdYmdSet = false;
  for (const [key, value] of Object.entries(parsedBody)) {
    if (key === 'S_STD_YMD') {
      params.append(key, ymd);
      stdYmdSet = true;
    } else {
      params.append(key, value ?? '');
    }
  }
  if (!stdYmdSet) params.append('S_STD_YMD', ymd);
  return params;
}

function parseAttendanceXml(xmlText) {
  let text = typeof xmlText === 'string' ? xmlText : String(xmlText ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trim();
  if (!text) {
    throw new Error('빈 응답');
  }
  text = text.replace(/^<\?xml[\s\S]*?\?>/, (m) => m.replace(/\s+/g, ' '));

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML 파싱 실패: ' + parserError.textContent.slice(0, 200));
  }

  const result = {};
  doc.querySelectorAll('ETC').forEach((node) => {
    const key = node.getAttribute('KEY');
    if (!key) return;
    result[key] = (node.textContent || '').trim();
  });

  if (Object.keys(result).length === 0) {
    throw new Error(
      '응답에 ETC 데이터 없음. 본문 일부: ' + text.slice(0, 200)
    );
  }

  const message = doc.querySelector('MESSAGE');
  if (message) {
    const t = (message.textContent || '').trim();
    if (t) result.__message = t;
  }
  return result;
}

export async function fetchAttendanceForDate({
  cookie,
  parsedBody,
  ymd,
  signal,
}) {
  const body = buildFormBody(parsedBody, ymd);
  const res = await client.post(ENDPOINT, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Jade-Cookie': cookie,
    },
    signal,
  });
  return parseAttendanceXml(res.data);
}

export async function fetchAttendanceForMonth({
  cookie,
  parsedBody,
  year,
  month,
  concurrency = 4,
  signal,
  onProgress,
}) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const queue = [];
  for (let day = 1; day <= lastDay; day++) queue.push(day);

  const result = {};
  let completed = 0;
  const total = lastDay;

  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const day = queue.shift();
      const ymd = toYmd(year, month, day);
      try {
        const etc = await fetchAttendanceForDate({
          cookie,
          parsedBody,
          ymd,
          signal,
        });
        result[ymd] = {
          ymd,
          workDay: etc.WORK_DAY || '',
          clockIn: etc.I_IN_HM || '',
          clockOut: etc.I_OUT_HM || '',
          raw: etc,
        };
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        const message = err?.response?.status
          ? `HTTP ${err.response.status}`
          : err.message || String(err);
        console.error('[jade] fetch failed', ymd, message, err);
        result[ymd] = { ymd, error: message };
      } finally {
        completed += 1;
        onProgress?.({ completed, total });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  return result;
}
