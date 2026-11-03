import {FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState} from 'react';
import './Setup.css';
import {appConfig} from '../config';
import {ParsedBody, parseBody, parseCurl} from '../lib/parseCurl';
import {Credentials} from '../lib/storage';

const REQUIRED_KEY = appConfig.jade.fields.requestDate;

interface SetupProps {
  onSubmit: (credentials: Credentials) => void;
  onOpenAutomatic: () => void;
  bridgeStatus: 'idle' | 'waiting' | 'ready';
  bookmarkletHref: string;
}

type AuthMethod = 'automatic' | 'manual';
type InputMode = 'curl' | 'manual';

interface ActiveInput {
  cookie: string;
  body: string;
  parsedBody: ParsedBody;
  error: string | null;
  hasContent: boolean;
}

const jadeGuideSteps = [
  {
    image: '/images/jade-guide/01-bookmark.png',
    alt: '1단계 Jade 연결 북마크 저장',
    text: 'Jade 연결을 북마크에 끌어다 놓아 저장합니다.',
  },
  {
    image: '/images/jade-guide/02-open-system.png',
    alt: '2단계 Jade 시스템 열기',
    text: 'Jade 시스템 열기를 클릭하여 엽니다.',
  },
  {
    image: '/images/jade-guide/03-my-info.png',
    alt: '3단계 Jade 내정보 메뉴 열기',
    text: 'Jade 시스템 로그인 후 북마크에 Jade 연결을 눌러준 뒤 내정보 메뉴를 눌러줍니다.',
  },
  {
    image: '/images/jade-guide/04-attendance.png',
    alt: '4단계 출퇴근 기록 열기',
    text: '출퇴근 기록을 누른 뒤 조회 버튼을 클릭해 줍니다.',
  },
  {
    image: '/images/jade-guide/05-calendar.png',
    alt: '5단계 연동된 달력 확인',
    text: '시스템 연동이 되면 달력이 표기되며 데이터를 불러오게 됩니다.',
  },
];

function Setup({onSubmit, onOpenAutomatic, bridgeStatus, bookmarkletHref}: SetupProps) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('automatic');
  const [inputMode, setInputMode] = useState<InputMode>('curl');
  const [bookmarkletClicked, setBookmarkletClicked] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [selectedGuideStep, setSelectedGuideStep] = useState<number | null>(null);
  const guideDragStartX = useRef<number | null>(null);
  const guideDidDrag = useRef(false);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarkletHref);
  }, [bookmarkletHref]);

  useEffect(() => {
    if (selectedGuideStep === null) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelectedGuideStep(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGuideStep]);

  const [curlText, setCurlText] = useState('');
  const curlParsed = useMemo(() => parseCurl(curlText), [curlText]);

  const [cookieText, setCookieText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const manualParsedBody = useMemo(() => parseBody(bodyText), [bodyText]);

  const active: ActiveInput = inputMode === 'curl'
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
  const empId = active.parsedBody[appConfig.jade.fields.employeeId] ?? '';
  const empName = active.parsedBody[appConfig.jade.fields.employeeName] ?? '';
  const canSubmit = hasCookie && hasBody && hasRequired;
  const selectedGuide = selectedGuideStep === null ? null : jadeGuideSteps[selectedGuideStep];
  const selectedGuideIndex = selectedGuideStep ?? 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({cookie: active.cookie, body: active.body, parsedBody: active.parsedBody});
  };

  const handleClear = (): void => {
    if (inputMode === 'curl') {
      setCurlText('');
    } else {
      setCookieText('');
      setBodyText('');
    }
  };

  const handleGuidePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    guideDragStartX.current = event.clientX;
    guideDidDrag.current = false;
  };

  const completeGuideDrag = (clientX: number): void => {
    if (guideDragStartX.current === null) return;

    const distance = clientX - guideDragStartX.current;
    guideDragStartX.current = null;
    if (!Number.isFinite(distance) || Math.abs(distance) < 50) return;

    guideDidDrag.current = true;
    setGuideStepIndex((index) => distance < 0
      ? Math.min(jadeGuideSteps.length - 1, index + 1)
      : Math.max(0, index - 1));
  };

  const handleGuidePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    completeGuideDrag(event.clientX);
  };

  const handleGuideMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    guideDragStartX.current = event.clientX;
    guideDidDrag.current = false;
  };

  const handleGuideMouseUp = (event: ReactMouseEvent<HTMLDivElement>): void => {
    completeGuideDrag(event.clientX);
  };

  const handleGuidePointerCancel = (): void => {
    guideDragStartX.current = null;
  };

  return (
    <form className="setup" onSubmit={handleSubmit}>
      <div className="setup-auth-tabs" role="tablist" aria-label="Jade 인증 방식">
        <button
          type="button"
          role="tab"
          id="jade-automatic-tab"
          aria-controls="jade-automatic-panel"
          aria-selected={authMethod === 'automatic'}
          className={`setup-auth-tab ${authMethod === 'automatic' ? 'active' : ''}`}
          onClick={() => setAuthMethod('automatic')}
        >
          자동인증
        </button>
        <button
          type="button"
          role="tab"
          id="jade-manual-tab"
          aria-controls="jade-manual-panel"
          aria-selected={authMethod === 'manual'}
          className={`setup-auth-tab ${authMethod === 'manual' ? 'active' : ''}`}
          onClick={() => setAuthMethod('manual')}
        >
          수동인증
        </button>
      </div>

      <div
        id="jade-automatic-panel"
        role="tabpanel"
        aria-labelledby="jade-automatic-tab"
        hidden={authMethod !== 'automatic'}
      >
        {authMethod === 'automatic' && (
          <section className="setup-card setup-auto-card">
            <h2 className="setup-title">Jade 자동 연결</h2>
            <p className="setup-desc">
              아래 순서대로 진행하면 cURL을 직접 입력하지 않고 로그인된 Jade와 연결할 수 있습니다.
            </p>
            <div className="setup-auto-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenAutomatic}>
                Jade 시스템 열기
              </button>
              <a
                ref={bookmarkletRef}
                className="setup-bookmarklet-link"
                href="#jade-bookmarklet"
                draggable="true"
                onClick={(event) => {
                  event.preventDefault();
                  setBookmarkletClicked(true);
                }}
                onDragStart={() => setBookmarkletClicked(false)}
              >
                Jade 연결
              </a>
            </div>
            <div className="setup-guide-inline" aria-label="Jade 연결 순서">
              <div
                className="setup-guide-viewport"
                data-testid="jade-guide-viewport"
                onPointerDown={handleGuidePointerDown}
                onPointerUp={handleGuidePointerUp}
                onPointerCancel={handleGuidePointerCancel}
                onMouseDown={handleGuideMouseDown}
                onMouseUp={handleGuideMouseUp}
              >
                <div
                  className="setup-guide-track"
                  data-testid="jade-guide-track"
                  style={{transform: `translateX(-${guideStepIndex * 100}%)`}}
                >
                  {jadeGuideSteps.map((step, index) => (
                    <figure className="setup-guide-step" key={step.image}>
                      <div className="setup-guide-media">
                        <button
                          type="button"
                          className="setup-guide-image-button"
                          aria-label={`${step.alt} 이미지 확대`}
                          onClick={() => {
                            if (guideDidDrag.current) {
                              guideDidDrag.current = false;
                              return;
                            }
                            setSelectedGuideStep(index);
                          }}
                        >
                          <img className="setup-guide-image" src={step.image} alt={step.alt} draggable={false} />
                        </button>
                      </div>
                      <figcaption>{index + 1}. {step.text}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
              <div className="setup-guide-controls">
                <button
                  type="button"
                  className="setup-guide-arrow"
                  aria-label="이전 단계"
                  onClick={() => setGuideStepIndex((index) => Math.max(0, index - 1))}
                  disabled={guideStepIndex === 0}
                >
                  ‹
                </button>
                <span className="setup-guide-counter" aria-live="polite">{guideStepIndex + 1} / {jadeGuideSteps.length}</span>
                <button
                  type="button"
                  className="setup-guide-arrow"
                  aria-label="다음 단계"
                  onClick={() => setGuideStepIndex((index) => Math.min(jadeGuideSteps.length - 1, index + 1))}
                  disabled={guideStepIndex === jadeGuideSteps.length - 1}
                >
                  ›
                </button>
              </div>
            </div>
            {selectedGuide && (
              <div
                className="setup-image-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label={`${selectedGuide.alt} 확대 보기`}
                onClick={(event) => {
                  if (event.target === event.currentTarget) setSelectedGuideStep(null);
                }}
              >
                <div className="setup-image-dialog">
                  <button type="button" className="setup-image-close" aria-label="확대 이미지 닫기" onClick={() => setSelectedGuideStep(null)}>×</button>
                  <div className="setup-image-stage">
                    <button
                      type="button"
                      className="setup-image-side-arrow"
                      aria-label="확대 보기 이전 단계"
                      onClick={() => {
                        const nextIndex = Math.max(0, selectedGuideIndex - 1);
                        setSelectedGuideStep(nextIndex);
                        setGuideStepIndex(nextIndex);
                      }}
                      disabled={selectedGuideIndex === 0}
                    >
                      ‹
                    </button>
                    <img
                      className="setup-image-expanded"
                      src={selectedGuide.image}
                      alt={`${selectedGuide.alt} 확대`}
                      draggable={false}
                    />
                    <button
                      type="button"
                      className="setup-image-side-arrow"
                      aria-label="확대 보기 다음 단계"
                      onClick={() => {
                        const nextIndex = Math.min(jadeGuideSteps.length - 1, selectedGuideIndex + 1);
                        setSelectedGuideStep(nextIndex);
                        setGuideStepIndex(nextIndex);
                      }}
                      disabled={selectedGuideIndex === jadeGuideSteps.length - 1}
                    >
                      ›
                    </button>
                  </div>
                  <p className="setup-image-caption">{selectedGuideIndex + 1}. {selectedGuide.text}</p>
                  <div className="setup-image-pagination" aria-label="확대 보기 페이지">
                    {jadeGuideSteps.map((step, index) => (
                      <button
                        type="button"
                        className={`setup-image-dot ${selectedGuideIndex === index ? 'active' : ''}`}
                        key={step.image}
                        aria-label={`확대 보기 ${index + 1}페이지`}
                        aria-current={selectedGuideIndex === index ? 'true' : 'false'}
                        onClick={() => {
                          setSelectedGuideStep(index);
                          setGuideStepIndex(index);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {(bridgeStatus !== 'idle' || bookmarkletClicked) && (
              <p className="setup-bridge-help" role="status">
                {bridgeStatus === 'ready'
                  ? 'Jade 연결이 실행되었습니다. 출퇴근 기록의 날짜 조회 응답을 기다리는 중입니다.'
                  : bridgeStatus === 'waiting'
                    ? '새 탭에서 로그인한 뒤 Jade 연결을 눌러 주세요.'
                    : '이 링크를 즐겨찾기 바에 저장한 뒤, Jade 시스템 탭에서 눌러 주세요.'}
              </p>
            )}
            <ul className="setup-hint setup-connection-notes">
              <li>Jade 브라우저를 종료하지 말아주세요.</li>
            </ul>
          </section>
        )}
      </div>

      <div
        id="jade-manual-panel"
        className="setup-manual-panel"
        role="tabpanel"
        aria-labelledby="jade-manual-tab"
        hidden={authMethod !== 'manual'}
      >
        {authMethod === 'manual' && (
          <>
            <section className="setup-card setup-header-card">
              <h2 className="setup-title">Jade 인증 정보 입력</h2>

              <div className="setup-tabs" role="tablist" aria-label="Jade 수동 입력 방식">
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'curl'}
                  className={`setup-tab ${inputMode === 'curl' ? 'active' : ''}`}
                  onClick={() => setInputMode('curl')}
                >
                  cURL 붙여넣기
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'manual'}
                  className={`setup-tab ${inputMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setInputMode('manual')}
                >
                  Cookie + Body 직접 입력
                </button>
              </div>

              {inputMode === 'curl' ? (
                <>
                  <p className="setup-desc">
                    DevTools의 <code>{appConfig.jade.requestPath.slice(1)}</code> 요청을 우클릭 → <strong>Copy → Copy as cURL</strong>로 복사해서 아래에 그대로 붙여 넣으세요. Cookie와 Body가 자동으로 파싱됩니다.
                  </p>
                  <ol className="setup-steps">
                    <li>
                      <a href={`${appConfig.jade.origin}/`} target="_blank" rel="noopener noreferrer">Jade 시스템</a>
                      에 로그인하고 출퇴근 메뉴(<code>ess_tam_402_m01</code>)를 엽니다.
                    </li>
                    <li><kbd>F12</kbd> → Network 탭에서 <code>{appConfig.jade.requestPath.slice(1)}</code> 요청을 찾습니다.</li>
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
                      <a href={`${appConfig.jade.origin}/`} target="_blank" rel="noopener noreferrer">Jade 시스템</a>
                      에 로그인하고 출퇴근 메뉴(<code>ess_tam_402_m01</code>)를 엽니다.
                    </li>
                    <li><kbd>F12</kbd> → Network 탭에서 <code>{appConfig.jade.requestPath.slice(1)}</code> 요청을 찾습니다.</li>
                    <li>Headers 탭의 <code>Cookie</code> 값을 복사해 Cookie 칸에 붙여넣기.</li>
                    <li>Payload 탭의 Request Body 전체를 복사해 Request Body 칸에 붙여넣기.</li>
                  </ol>
                </>
              )}
            </section>

            <section className="setup-card setup-input-card">
              {inputMode === 'curl' ? (
                <>
                  <label className="field-label" htmlFor="curl">
                    cURL 명령어
                    {hasCookie && hasBody && hasRequired && <span className="badge ok">유효</span>}
                    {curlText && active.error && <span className="badge warn">파싱 오류</span>}
                    {curlText && !active.error && hasBody && !hasRequired && <span className="badge warn">{REQUIRED_KEY} 없음</span>}
                  </label>
                  <textarea
                    id="curl"
                    className="field-textarea curl"
                    rows={13}
                    placeholder={`curl '${appConfig.jade.origin}${appConfig.jade.requestPath}' \\\n+  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \\\n+  -b 'SESSION=...' \\\n+  --data-raw '${appConfig.jade.fields.datasetClass}=...&${appConfig.jade.fields.requestDate}=20260513&${appConfig.jade.fields.employeeName}=...&${appConfig.jade.fields.employeeId}=...'`}
                    value={curlText}
                    onChange={(event) => setCurlText(event.target.value)}
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
                    onChange={(event) => setCookieText(event.target.value)}
                    spellCheck={false}
                  />
                  <label className="field-label field-label-stacked" htmlFor="body">
                    Request Body
                    {hasBody && hasRequired && <span className="badge ok">유효</span>}
                    {hasBody && !hasRequired && <span className="badge warn">{REQUIRED_KEY} 없음</span>}
                  </label>
                  <textarea
                    id="body"
                    className="field-textarea body"
                    rows={9}
                    placeholder={`${appConfig.jade.fields.datasetClass}:...\n${appConfig.jade.fields.datasetMethod}:...\n${appConfig.jade.fields.formDate}:2026.05.07\n${appConfig.jade.fields.employeeName}:홍길동\n${appConfig.jade.fields.employeeId}:20250304\n...\n${appConfig.jade.fields.requestDate}:20260501\n...`}
                    value={bodyText}
                    onChange={(event) => setBodyText(event.target.value)}
                    spellCheck={false}
                  />
                </>
              )}
            </section>

            {active.hasContent && (
              <section className="setup-card">
                <div className="parsed-summary">
                  <div className="summary-row"><span className="summary-label">Cookie</span><span className="summary-value">{hasCookie ? `${active.cookie.length}자 · 감지됨` : '없음 ⚠'}</span></div>
                  <div className="summary-row"><span className="summary-label">파싱된 Body 필드</span><span className="summary-value">{fieldCount}개</span></div>
                  {(empId || empName) && <div className="summary-row"><span className="summary-label">사번 / 이름</span><span className="summary-value">{empId} {empName && `· ${empName}`}</span></div>}
                  <div className="summary-row"><span className="summary-label">{REQUIRED_KEY}</span><span className="summary-value">{hasRequired ? (active.parsedBody[REQUIRED_KEY] || '(빈 값)') : '없음 ⚠'}</span></div>
                </div>
              </section>
            )}

            <div className="setup-actions">
              <button type="button" className="btn btn-ghost" onClick={handleClear} disabled={!active.hasContent}>지우기</button>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>저장하고 달력 보기</button>
            </div>

            {!canSubmit && active.hasContent && !active.error && (
              <p className="setup-hint">
                {!hasCookie && '· Cookie를 입력해주세요. '}
                {!hasBody && '· Request Body를 입력해주세요. '}
                {hasBody && !hasRequired && `· Body에 ${REQUIRED_KEY} 필드가 포함되어야 합니다.`}
              </p>
            )}
          </>
        )}
      </div>
    </form>
  );
}

export default Setup;
