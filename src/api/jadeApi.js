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

function durationToHours(s) {
  if (!s) return 0;
  const dMatch = s.match(/^(\d+(?:\.\d+)?)d$/);
  if (dMatch) return parseFloat(dMatch[1]) * 8;
  const hMatch = s.match(/^(\d+(?:\.\d+)?)\s*시간$/);
  if (hMatch) return parseFloat(hMatch[1]);
  return 0;
}

function dayOffWorkFromDetail(html) {
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('.workList tr');
    for (const tr of rows) {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) continue;
      const type = (cells[0]?.textContent || '').trim();
      if (type !== '휴무일') continue;
      const duration = cells[1] ? (cells[1].textContent || '').trim() : '';
      const hours = durationToHours(duration);
      if (hours > 0) return { duration, hours };
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

function overtimeFromDetail(html) {
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('.workList tr');
    for (const tr of rows) {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) continue;
      const type = (cells[0]?.textContent || '').trim();
      if (type !== '연장') continue;
      const duration = cells[1] ? (cells[1].textContent || '').trim() : '';
      const hours = durationToHours(duration);
      if (hours > 0) return { duration, hours };
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

function vacationFromDetail(html) {
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('.workList tr');
    for (const tr of rows) {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) continue;
      const type = (cells[0]?.textContent || '').trim();
      if (!type.includes('휴가')) continue;
      const duration = cells[1] ? (cells[1].textContent || '').trim() : '';
      const time = cells[2]
        ? (cells[2].textContent || '').trim().replace(/^\(\s*|\s*\)$/g, '')
        : '';
      const hours = durationToHours(duration);
      return { type, duration, time, hours, isFullDay: hours >= 8 };
    }
    return null;
  } catch {
    return null;
  }
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

  const message = doc.querySelector('MESSAGE');
  const messageText = message ? (message.textContent || '').trim() : '';

  if (Object.keys(result).length === 0) {
    if (messageText === 'LOGIN_CHECK_FAIL:LOGOUT') {
      throw new Error('로그인 정보 만료');
    }
    throw new Error('오류');
  }

  if (messageText) result.__message = messageText;
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
        let clockIn = etc.I_IN_HM || '';
        let clockInChanged = false;
        if (!clockIn && etc.C_IN_HM) {
          clockIn = etc.C_IN_HM;
          clockInChanged = true;
        }
        let clockOut = etc.I_OUT_HM || '';
        let clockOutChanged = false;
        if (!clockOut && etc.C_OUT_HM) {
          clockOut = etc.C_OUT_HM;
          clockOutChanged = true;
        }
        const workDetailHtml = etc.WORK_DETAIL || '';
        result[ymd] = {
          ymd,
          workDay: etc.WORK_DAY || '',
          workType: etc.WORK_TYPE_NM || '',
          vacation: vacationFromDetail(workDetailHtml),
          overtime: overtimeFromDetail(workDetailHtml),
          dayOffWork: dayOffWorkFromDetail(workDetailHtml),
          clockIn,
          clockInChanged,
          clockOut,
          clockOutChanged,
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
