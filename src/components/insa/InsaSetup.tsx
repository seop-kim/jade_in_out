import {FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState} from 'react';
import {appConfig} from '../../config';
import '../Setup.css';

interface InsaSetupProps {
  onSubmit: (cookie: string) => void;
  onOpenAutomatic: () => void;
  bridgeStatus: 'idle' | 'waiting';
  bookmarkletHref: string;
}

type AuthMethod = 'automatic' | 'manual';

const insaGuideSteps = [
  {
    image: '/images/insa-guide/01-bookmark.png',
    alt: '1단계 인사 연결 북마크 저장',
    text: '인사 연결을 북마크에 끌어다 놓아 저장합니다.',
  },
  {
    image: '/images/insa-guide/02-open-system.png',
    alt: '2단계 인사시스템 열기',
    text: '인사시스템 열기를 클릭하여 엽니다.',
  },
  {
    image: '/images/insa-guide/03-login.png',
    alt: '3단계 인사시스템 로그인',
    text: '인사시스템 로그인을 합니다.',
  },
  {
    image: '/images/insa-guide/04-bookmark-connect.png',
    alt: '4단계 인사 연결 실행',
    text: '북마크에 인사 연결을 눌러줍니다.',
  },
  {
    image: '/images/insa-guide/05-calendar.png',
    alt: '5단계 연결 완료 확인',
    text: '달력에 출퇴근 정보가 표시되면 연결이 완료됩니다.',
  },
];

function InsaSetup({onSubmit, onOpenAutomatic, bridgeStatus, bookmarkletHref}: InsaSetupProps) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('automatic');
  const [cookie, setCookie] = useState('');
  const [bookmarkletClicked, setBookmarkletClicked] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [selectedGuideStep, setSelectedGuideStep] = useState<number | null>(null);
  const [isGuideClosing, setIsGuideClosing] = useState(false);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const guideDragStartX = useRef<number | null>(null);
  const guideModalDragStartX = useRef<number | null>(null);
  const normalizedCookie = cookie.trim();

  const selectedGuide = selectedGuideStep === null ? null : insaGuideSteps[selectedGuideStep];
  const selectedGuideIndex = selectedGuideStep ?? 0;

  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarkletHref);
  }, [bookmarkletHref]);

  useEffect(() => {
    if (selectedGuideStep === null) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsGuideClosing(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGuideStep]);

  useEffect(() => {
    if (!isGuideClosing) return;

    const timeoutId = window.setTimeout(() => {
      setSelectedGuideStep(null);
      setIsGuideClosing(false);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [isGuideClosing]);

  const openGuide = (index: number): void => {
    setIsGuideClosing(false);
    setSelectedGuideStep(index);
  };

  const completeGuideDrag = (clientX: number): void => {
    if (guideDragStartX.current === null) return;
    const distance = clientX - guideDragStartX.current;
    guideDragStartX.current = null;
    if (!Number.isFinite(distance) || Math.abs(distance) < 50) return;
    setGuideStepIndex((index) => distance < 0
      ? Math.min(insaGuideSteps.length - 1, index + 1)
      : Math.max(0, index - 1));
  };

  const completeGuideModalDrag = (clientX: number): void => {
    if (guideModalDragStartX.current === null) return;
    const distance = clientX - guideModalDragStartX.current;
    guideModalDragStartX.current = null;
    if (!Number.isFinite(distance) || Math.abs(distance) < 50) return;
    const nextIndex = distance < 0
      ? Math.min(insaGuideSteps.length - 1, selectedGuideIndex + 1)
      : Math.max(0, selectedGuideIndex - 1);
    setSelectedGuideStep(nextIndex);
    setGuideStepIndex(nextIndex);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (normalizedCookie) onSubmit(normalizedCookie);
  };

  return (
    <form className="insa-setup" onSubmit={handleSubmit}>
      <div className="insa-auth-tabs" role="tablist" aria-label="인사시스템 인증 방식">
        <button
          type="button"
          role="tab"
          id="insa-automatic-tab"
          aria-controls="insa-automatic-panel"
          aria-selected={authMethod === 'automatic'}
          className={`insa-auth-tab ${authMethod === 'automatic' ? 'active' : ''}`}
          onClick={() => setAuthMethod('automatic')}
        >
          자동인증
        </button>
        <button
          type="button"
          role="tab"
          id="insa-manual-tab"
          aria-controls="insa-manual-panel"
          aria-selected={authMethod === 'manual'}
          className={`insa-auth-tab ${authMethod === 'manual' ? 'active' : ''}`}
          onClick={() => setAuthMethod('manual')}
        >
          수동인증
        </button>
      </div>

      <div
        id="insa-automatic-panel"
        role="tabpanel"
        aria-labelledby="insa-automatic-tab"
        hidden={authMethod !== 'automatic'}
      >
        {authMethod === 'automatic' && (
          <section className="insa-card insa-auto-connect-card">
            <h2 className="insa-setup-title">신규 인사시스템 연결</h2>
            <p className="insa-setup-description">
              아래 순서대로 진행하면 Cookie를 직접 입력하지 않고 로그인된 인사시스템과 연결할 수 있습니다.
            </p>
            <div className="insa-auto-connect-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenAutomatic}>
                인사시스템 열기
              </button>
              <a
                ref={bookmarkletRef}
                className="insa-bookmarklet-link"
                href="#insa-bookmarklet"
                draggable="true"
                onClick={(event) => {
                  event.preventDefault();
                  setBookmarkletClicked(true);
                }}
                onDragStart={() => setBookmarkletClicked(false)}
              >
                인사 연결
              </a>
            </div>
            <div className="setup-guide-inline insa-guide-inline" aria-label="인사 연결 순서">
              <div className="setup-guide-heading"><h3>연결 가이드</h3></div>
              <div
                className="setup-guide-viewport"
                data-testid="insa-guide-viewport"
                onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  guideDragStartX.current = event.clientX;
                }}
                onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => completeGuideDrag(event.clientX)}
                onPointerCancel={() => { guideDragStartX.current = null; }}
                onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                  if (event.button === 0) guideDragStartX.current = event.clientX;
                }}
                onMouseUp={(event: ReactMouseEvent<HTMLDivElement>) => completeGuideDrag(event.clientX)}
              >
                <div className="setup-guide-track" style={{transform: `translateX(-${guideStepIndex * 100}%)`}}>
                  {insaGuideSteps.map((step, index) => (
                    <figure className="setup-guide-step" key={step.image}>
                      <button type="button" className="setup-guide-slide-zoom" aria-label={`${step.alt} 확대 보기`} onClick={() => openGuide(index)}>
                        <span className="setup-guide-zoom-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /></svg>
                        </span>
                      </button>
                      <div className="setup-guide-media"><img className="setup-guide-image" src={step.image} alt={step.alt} draggable={false} /></div>
                      <figcaption>{index + 1}. {step.text}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
              <div className="setup-guide-controls">
                <button type="button" className="setup-guide-arrow" aria-label="이전 단계" onClick={() => setGuideStepIndex((index) => Math.max(0, index - 1))} disabled={guideStepIndex === 0}>‹</button>
                <span className="setup-guide-counter" aria-live="polite">{guideStepIndex + 1} / {insaGuideSteps.length}</span>
                <button type="button" className="setup-guide-arrow" aria-label="다음 단계" onClick={() => setGuideStepIndex((index) => Math.min(insaGuideSteps.length - 1, index + 1))} disabled={guideStepIndex === insaGuideSteps.length - 1}>›</button>
              </div>
            </div>
            {selectedGuide && (
              <div className={`setup-image-backdrop ${isGuideClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={`${selectedGuide.alt} 확대 보기`} onClick={(event) => { if (event.target === event.currentTarget) setIsGuideClosing(true); }}>
                <div className="setup-image-dialog">
                  <button type="button" className="setup-image-close" aria-label="확대 이미지 닫기" onClick={() => setIsGuideClosing(true)}>×</button>
                  <div className="setup-image-stage">
                    <button type="button" className="setup-image-side-arrow" aria-label="확대 보기 이전 단계" onClick={() => { const nextIndex = Math.max(0, selectedGuideIndex - 1); setSelectedGuideStep(nextIndex); setGuideStepIndex(nextIndex); }} disabled={selectedGuideIndex === 0}>‹</button>
                    <div
                      className="setup-image-pan-area"
                      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => { if (event.pointerType !== 'mouse' || event.button === 0) guideModalDragStartX.current = event.clientX; }}
                      onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => completeGuideModalDrag(event.clientX)}
                      onPointerCancel={() => { guideModalDragStartX.current = null; }}
                      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.button === 0) guideModalDragStartX.current = event.clientX; }}
                      onMouseUp={(event: ReactMouseEvent<HTMLDivElement>) => completeGuideModalDrag(event.clientX)}
                    >
                      <img key={selectedGuide.image} className="setup-image-expanded" src={selectedGuide.image} alt={`${selectedGuide.alt} 확대`} draggable={false} />
                    </div>
                    <button type="button" className="setup-image-side-arrow" aria-label="확대 보기 다음 단계" onClick={() => { const nextIndex = Math.min(insaGuideSteps.length - 1, selectedGuideIndex + 1); setSelectedGuideStep(nextIndex); setGuideStepIndex(nextIndex); }} disabled={selectedGuideIndex === insaGuideSteps.length - 1}>›</button>
                  </div>
                  <p className="setup-image-caption">{selectedGuideIndex + 1}. {selectedGuide.text}</p>
                  <div className="setup-image-pagination" aria-label="확대 보기 페이지">
                    {insaGuideSteps.map((step, index) => <button type="button" className={`setup-image-dot ${selectedGuideIndex === index ? 'active' : ''}`} key={step.image} aria-label={`확대 보기 ${index + 1}페이지`} aria-current={selectedGuideIndex === index ? 'true' : 'false'} onClick={() => { setSelectedGuideStep(index); setGuideStepIndex(index); }} />)}
                  </div>
                </div>
              </div>
            )}
            {(bridgeStatus === 'waiting' || bookmarkletClicked) && (
              <p className="insa-bridge-help" role="status">
                {bridgeStatus === 'waiting' ? '새 탭에서 로그인한 뒤 인사 연결을 눌러 주세요.' : '이 링크를 즐겨찾기 바에 저장한 뒤, 인사시스템 창에서 눌러 주세요.'}
              </p>
            )}
            <ul className="insa-setup-notes">
              <li>인사시스템 브라우저를 종료하지 말아주세요.</li>
            </ul>
          </section>
        )}
      </div>

      <div
        id="insa-manual-panel"
        role="tabpanel"
        aria-labelledby="insa-manual-tab"
        hidden={authMethod !== 'manual'}
      >
        {authMethod === 'manual' && (
          <>
            <section className="insa-card">
              <h2 className="insa-setup-title">직접 인증 정보 입력</h2>
              <p className="insa-setup-description">
                자동 연결을 사용할 수 없는 경우에는 아래 순서대로 인사시스템의 Cookie를 복사해 입력하세요.
              </p>
              <ol className="insa-setup-steps insa-manual-steps">
                <li>
                  <a href={`${appConfig.insa.origin}/`} target="_blank" rel="noopener noreferrer">인사시스템</a>에 로그인합니다.
                </li>
                <li><kbd>F12</kbd> → Network 탭에서 인사시스템 요청을 찾습니다.</li>
                <li>Headers에서 Cookie 값을 복사합니다.</li>
                <li>아래 Cookie 입력칸에 붙여넣고 저장합니다.</li>
              </ol>
              <label className="insa-field-label" htmlFor="insa-cookie">INSA Cookie</label>
              <input
                id="insa-cookie"
                className="insa-cookie-input"
                type="password"
                value={cookie}
                onChange={(event) => setCookie(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Cookie 값을 붙여넣으세요"
              />
            </section>
            <div className="insa-setup-actions">
              <button type="submit" className="btn btn-primary" disabled={!normalizedCookie}>
                저장하고 달력 보기
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}

export default InsaSetup;
