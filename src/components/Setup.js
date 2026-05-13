import { useMemo, useState } from 'react';
import './Setup.css';

const REQUIRED_KEY = 'S_STD_YMD';

function parseBody(raw) {
  const text = (raw || '').trim();
  if (!text) return {};

  if (text.includes('=') && text.includes('&') && !/^\s*[A-Z_]+\s*:/m.test(text)) {
    const params = new URLSearchParams(text);
    const out = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }

  const out = {};
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

function normalize(rawText) {
  let text = rawText.trim();
  text = text.replace(/\\\r?\n\s*/g, ' ');
  text = text.replace(/`\r?\n\s*/g, ' ');
  text = text.replace(/\^\r?\n\s*/g, ' ');
  if (/\^["%&^()<>|]/.test(text)) {
    text = text.replace(/\^(.)/g, '$1');
  }
  return text;
}

function extractCookie(text) {
  const flag =
    text.match(/(?:^|\s)(?:-b|--cookie)\s+(?:\$)?'([^']*)'/) ||
    text.match(/(?:^|\s)(?:-b|--cookie)\s+(?:\$)?"([^"]*)"/);
  if (flag) return flag[1].trim();

  const headerRe = /-H\s+(?:\$)?(['"])((?:(?!\1).)+)\1/g;
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    const header = m[2];
    const idx = header.indexOf(':');
    if (idx < 0) continue;
    if (header.slice(0, idx).trim().toLowerCase() === 'cookie') {
      return header.slice(idx + 1).trim();
    }
  }
  return '';
}

function extractBody(text) {
  const m =
    text.match(/--data(?:-raw|-binary|-urlencode|-ascii)?\s+(?:\$)?'([^']*)'/) ||
    text.match(/--data(?:-raw|-binary|-urlencode|-ascii)?\s+(?:\$)?"([^"]*)"/) ||
    text.match(/(?:^|\s)-d\s+(?:\$)?'([^']*)'/) ||
    text.match(/(?:^|\s)-d\s+(?:\$)?"([^"]*)"/);
  return m ? m[1] : '';
}

function parseCurl(rawText) {
  const empty = { cookie: '', body: '', parsedBody: {}, error: null };
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

  const parsedBody = {};
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

  return { cookie, body, parsedBody, error: null };
}

function Setup({ onSubmit }) {
  const [tab, setTab] = useState('curl');

  const [curlText, setCurlText] = useState('');
  const curlParsed = useMemo(() => parseCurl(curlText), [curlText]);

  const [cookieText, setCookieText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const manualParsedBody = useMemo(() => parseBody(bodyText), [bodyText]);

  const active = tab === 'curl'
    ? {
        cookie: curlParsed.cookie,
        body: curlParsed.body,
        parsedBody: curlParsed.parsedBody,
        error: curlParsed.error,
        hasContent: curlText.trim().length > 0,
      }
    : {
        cookie: cookieText.trim(),
        body: bodyText.trim(),
        parsedBody: manualParsedBody,
        error: null,
        hasContent: cookieText.trim().length > 0 || bodyText.trim().length > 0,
      };

  const hasCookie = active.cookie.length > 0;
  const fieldCount = Object.keys(active.parsedBody).length;
  const hasBody = fieldCount > 0;
  const hasRequired = REQUIRED_KEY in active.parsedBody;
  const empId = active.parsedBody['S_EMP_ID'] || '';
  const empName = active.parsedBody['S_EMP_NM'] || '';

  const canSubmit = hasCookie && hasBody && hasRequired;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ cookie: active.cookie, body: active.body, parsedBody: active.parsedBody });
  };

  const handleClear = () => {
    if (tab === 'curl') {
      setCurlText('');
    } else {
      setCookieText('');
      setBodyText('');
    }
  };

  return (
    <form className="setup" onSubmit={handleSubmit}>
      <section className="setup-card setup-header-card">
        <h2 className="setup-title">Jade 인증 정보 입력</h2>

        <div className="setup-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'curl'}
            className={`setup-tab ${tab === 'curl' ? 'active' : ''}`}
            onClick={() => setTab('curl')}
          >
            cURL 붙여넣기
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'manual'}
            className={`setup-tab ${tab === 'manual' ? 'active' : ''}`}
            onClick={() => setTab('manual')}
          >
            Cookie + Body 직접 입력
          </button>
        </div>

        {tab === 'curl' ? (
          <>
            <p className="setup-desc">
              DevTools의 <code>commonAction.do</code> 요청을 우클릭 → <strong>Copy → Copy as cURL</strong>로 복사해서 아래에 그대로 붙여 넣으세요. Cookie와 Body가 자동으로 파싱됩니다.
            </p>
            <ol className="setup-steps">
              <li>
                <a href="https://ehr.jadehr.co.kr" target="_blank" rel="noopener noreferrer">Jade 시스템</a>
                에 로그인하고 출퇴근 메뉴(<code>ess_tam_402_m01</code>)를 엽니다.
              </li>
              <li>
                <kbd>F12</kbd> → Network 탭에서 <code>commonAction.do</code> 요청을 찾습니다.
              </li>
              <li>
                요청을 <strong>우클릭 → Copy → Copy as cURL</strong> 선택.
                <br />
                <small>(Windows의 PowerShell 포맷은 미지원. <code>cURL (bash)</code> 또는 <code>cURL (cmd)</code>으로 복사해주세요.)</small>
              </li>
              <li>아래 입력칸에 붙여넣기.</li>
            </ol>
          </>
        ) : (
          <>
            <p className="setup-desc">
              브라우저 개발자도구(F12)에서 <code>Cookie</code> 값과 Request Body를 각각 복사해 붙여 넣으세요.
            </p>
            <ol className="setup-steps">
              <li>
                <a href="https://ehr.jadehr.co.kr" target="_blank" rel="noopener noreferrer">Jade 시스템</a>
                에 로그인하고 출퇴근 메뉴(<code>ess_tam_402_m01</code>)를 엽니다.
              </li>
              <li>
                <kbd>F12</kbd> → Network 탭에서 <code>commonAction.do</code> 요청을 찾습니다.
              </li>
              <li>Headers 탭의 <code>Cookie</code> 값을 복사해 Cookie 칸에 붙여넣기.</li>
              <li>Payload 탭의 Request Body 전체를 복사해 Request Body 칸에 붙여넣기.</li>
            </ol>
          </>
        )}
      </section>

      <section className="setup-card setup-input-card">
        {tab === 'curl' ? (
          <>
            <label className="field-label" htmlFor="curl">
              cURL 명령어
              {hasCookie && hasBody && hasRequired && <span className="badge ok">유효</span>}
              {curlText && active.error && <span className="badge warn">파싱 오류</span>}
              {curlText && !active.error && hasBody && !hasRequired && (
                <span className="badge warn">{REQUIRED_KEY} 없음</span>
              )}
            </label>
            <textarea
              id="curl"
              className="field-textarea curl"
              rows={13}
              placeholder={`curl 'https://ehr.jadehr.co.kr/commonAction.do' \\\n  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \\\n  -b 'SAVE_ID=...; JSESSIONID=...' \\\n  --data-raw 'S_DSCLASS=...&S_STD_YMD=20260513&S_EMP_NM=...&S_EMP_ID=...'`}
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              spellCheck={false}
            />
            {active.error && <p className="setup-hint">{active.error}</p>}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="cookie">
              Cookie
              {hasCookie && <span className="badge ok">입력됨</span>}
            </label>
            <textarea
              id="cookie"
              className="field-textarea cookie"
              rows={3}
              placeholder="SAVE_ID=...; JSESSIONID=...; ..."
              value={cookieText}
              onChange={(e) => setCookieText(e.target.value)}
              spellCheck={false}
            />

            <label className="field-label field-label-stacked" htmlFor="body">
              Request Body
              {hasBody && hasRequired && <span className="badge ok">유효</span>}
              {hasBody && !hasRequired && (
                <span className="badge warn">{REQUIRED_KEY} 없음</span>
              )}
            </label>
            <textarea
              id="body"
              className="field-textarea body"
              rows={9}
              placeholder={`S_DSCLASS:...\nS_DSMETHOD:...\nF_STD_YMD:2026.05.07\nS_EMP_NM:홍길동\nS_EMP_ID:20250304\n...\nS_STD_YMD:20260501\n...`}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              spellCheck={false}
            />
          </>
        )}
      </section>

      {active.hasContent && (
        <section className="setup-card">
          <div className="parsed-summary">
            <div className="summary-row">
              <span className="summary-label">Cookie</span>
              <span className="summary-value">
                {hasCookie ? `${active.cookie.length}자 · 감지됨` : '없음 ⚠'}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">파싱된 Body 필드</span>
              <span className="summary-value">{fieldCount}개</span>
            </div>
            {(empId || empName) && (
              <div className="summary-row">
                <span className="summary-label">사번 / 이름</span>
                <span className="summary-value">
                  {empId} {empName && `· ${empName}`}
                </span>
              </div>
            )}
            <div className="summary-row">
              <span className="summary-label">{REQUIRED_KEY}</span>
              <span className="summary-value">
                {hasRequired ? (active.parsedBody[REQUIRED_KEY] || '(빈 값)') : '없음 ⚠'}
              </span>
            </div>
          </div>
        </section>
      )}

      <div className="setup-actions">
        <button type="button" className="btn btn-ghost" onClick={handleClear} disabled={!active.hasContent}>
          지우기
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          저장하고 달력 보기
        </button>
      </div>

      {!canSubmit && active.hasContent && !active.error && (
        <p className="setup-hint">
          {!hasCookie && '· Cookie를 입력해주세요. '}
          {!hasBody && '· Request Body를 입력해주세요. '}
          {hasBody && !hasRequired && `· Body에 ${REQUIRED_KEY} 필드가 포함되어야 합니다.`}
        </p>
      )}
    </form>
  );
}

export default Setup;
