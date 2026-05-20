export type ParsedBody = Record<string, string>;

export interface CurlParseResult {
  cookie: string;
  body: string;
  parsedBody: ParsedBody;
  error: string | null;
}

export function parseBody(raw: string): ParsedBody {
  const text = (raw || '').trim();
  if (!text) return {};

  if (text.includes('=') && text.includes('&') && !/^\s*[A-Z_]+\s*:/m.test(text)) {
    const params = new URLSearchParams(text);
    const out: ParsedBody = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }

  const out: ParsedBody = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function normalize(rawText: string): string {
  let text = rawText.trim();
  text = text.replace(/\\\r?\n\s*/g, ' ');
  text = text.replace(/`\r?\n\s*/g, ' ');
  text = text.replace(/\^\r?\n\s*/g, ' ');
  if (/\^["%&^()<>|]/.test(text)) {
    text = text.replace(/\^(.)/g, '$1');
  }
  return text;
}

function extractCookie(text: string): string {
  const flag =
    text.match(/(?:^|\s)(?:-b|--cookie)\s+(?:\$)?'([^']*)'/) ||
    text.match(/(?:^|\s)(?:-b|--cookie)\s+(?:\$)?"([^"]*)"/);
  if (flag && flag[1]) return flag[1].trim();

  const headerRe = /-H\s+(?:\$)?(['"])((?:(?!\1).)+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    const header = m[2];
    if (!header) continue;
    const idx = header.indexOf(':');
    if (idx < 0) continue;
    if (header.slice(0, idx).trim().toLowerCase() === 'cookie') {
      return header.slice(idx + 1).trim();
    }
  }
  return '';
}

function extractBody(text: string): string {
  const m =
    text.match(/--data(?:-raw|-binary|-urlencode|-ascii)?\s+(?:\$)?'([^']*)'/) ||
    text.match(/--data(?:-raw|-binary|-urlencode|-ascii)?\s+(?:\$)?"([^"]*)"/) ||
    text.match(/(?:^|\s)-d\s+(?:\$)?'([^']*)'/) ||
    text.match(/(?:^|\s)-d\s+(?:\$)?"([^"]*)"/);
  return m && m[1] ? m[1] : '';
}

export function parseCurl(rawText: string): CurlParseResult {
  const empty: CurlParseResult = {cookie: '', body: '', parsedBody: {}, error: null};
  const trimmed = (rawText || '').trim();
  if (!trimmed) return empty;

  if (!/^curl\b/i.test(trimmed) && !/-H\s+['"]|-b\s+['"]|--data/i.test(trimmed)) {
    return {
      ...empty,
      error: 'cURL 명령어처럼 보이지 않아요. DevTools에서 "Copy as cURL"한 값을 붙여넣어주세요.',
    };
  }

  const text = normalize(trimmed);
  const cookie = extractCookie(text);
  const body = extractBody(text);

  const parsedBody: ParsedBody = {};
  if (body) {
    const params = new URLSearchParams(body);
    for (const [k, v] of params.entries()) parsedBody[k] = v;
  }

  if (!cookie && !body) {
    return {
      cookie,
      body,
      parsedBody,
      error:
        'Cookie와 Body를 찾지 못했어요. DevTools의 commonAction.do 요청을 "Copy as cURL"로 복사했는지 확인해주세요.',
    };
  }

  return {cookie, body, parsedBody, error: null};
}
