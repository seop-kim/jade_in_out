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

function Setup({ initial, onSubmit }) {
  const [cookie, setCookie] = useState(initial?.cookie ?? '');
  const [body, setBody] = useState(initial?.body ?? '');

  const parsed = useMemo(() => parseBody(body), [body]);
  const hasCookie = cookie.trim().length > 0;
  const hasBody = Object.keys(parsed).length > 0;
  const hasRequired = REQUIRED_KEY in parsed;
  const empId = parsed['S_EMP_ID'] || '';
  const empName = parsed['S_EMP_NM'] || '';

  const canSubmit = hasCookie && hasBody && hasRequired;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ cookie: cookie.trim(), body: body.trim(), parsedBody: parsed });
  };

  const handleClear = () => {
    setCookie('');
    setBody('');
  };

  return (
    <form className="setup" onSubmit={handleSubmit}>
      <section className="setup-card">
        <h2 className="setup-title">Jade 인증 정보 입력</h2>
        <p className="setup-desc">
          출퇴근 데이터를 가져오기 위해 Jade에 직접 로그인한 뒤,
          브라우저 개발자도구(F12)에서 Cookie와 Request Body를 복사해 붙여 넣어주세요.
        </p>

        <ol className="setup-steps">
          <li>
            <a
              href="https://ehr.jadehr.co.kr"
              target="_blank"
              rel="noopener noreferrer"
            >
              Jade 시스템
            </a>
            에 로그인하고 출퇴근 메뉴(<code>ess_tam_402_m01</code>)를 엽니다.
          </li>
          <li>
            <kbd>F12</kbd> → Network 탭에서 <code>commonAction.do</code> 요청을 찾습니다.
          </li>
          <li>
            Headers 탭에서 <code>Cookie</code> 값 전체를 복사해 아래에 붙여 넣습니다.
          </li>
          <li>
            Payload 탭에서 Request Body 전체를 복사해 아래에 붙여 넣습니다.
          </li>
        </ol>
      </section>

      <section className="setup-card">
        <label className="field-label" htmlFor="cookie">
          Cookie
          {hasCookie && <span className="badge ok">입력됨</span>}
        </label>
        <textarea
          id="cookie"
          className="field-textarea cookie"
          rows={3}
          placeholder="SAVE_ID=...; JSESSIONID=...; ..."
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          spellCheck={false}
        />
      </section>

      <section className="setup-card">
        <label className="field-label" htmlFor="body">
          Request Body
          {hasBody && hasRequired && <span className="badge ok">유효</span>}
          {hasBody && !hasRequired && (
            <span className="badge warn">{REQUIRED_KEY} 필드 없음</span>
          )}
        </label>
        <textarea
          id="body"
          className="field-textarea body"
          rows={14}
          placeholder={`S_DSCLASS:...\nS_DSMETHOD:...\nF_STD_YMD:2026.05.07\nS_EMP_NM:홍길동\nS_EMP_ID:20250304\n...\nS_STD_YMD:20260501\n...`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
        />

        {hasBody && (
          <div className="parsed-summary">
            <div className="summary-row">
              <span className="summary-label">파싱된 필드</span>
              <span className="summary-value">{Object.keys(parsed).length}개</span>
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
                {hasRequired ? (parsed[REQUIRED_KEY] || '(빈 값)') : '없음 ⚠'}
              </span>
            </div>
          </div>
        )}
      </section>

      <div className="setup-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleClear}
          disabled={!cookie && !body}
        >
          모두 지우기
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          저장하고 달력 보기
        </button>
      </div>

      {!canSubmit && (cookie || body) && (
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
