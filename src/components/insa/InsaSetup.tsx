import {FormEvent, useEffect, useRef, useState} from 'react';
import {appConfig} from '../../config';

interface InsaSetupProps {
  onSubmit: (cookie: string) => void;
  onOpenAutomatic: () => void;
  bridgeStatus: 'idle' | 'waiting';
  bookmarkletHref: string;
}

type AuthMethod = 'automatic' | 'manual';

function InsaSetup({onSubmit, onOpenAutomatic, bridgeStatus, bookmarkletHref}: InsaSetupProps) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('automatic');
  const [cookie, setCookie] = useState('');
  const [bookmarkletClicked, setBookmarkletClicked] = useState(false);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const normalizedCookie = cookie.trim();

  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarkletHref);
  }, [bookmarkletHref]);

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
            <ol className="insa-setup-steps">
              <li>인사 연결을 북마크에 끌어다 놓아 저장합니다.</li>
              <li>인사시스템 열기를 클릭하여 엽니다.</li>
              <li>인사시스템 로그인 후 북마크에 인사 연결을 눌러줍니다.</li>
              <li>인사시스템 화면에서 연결이 진행될 때까지 기다립니다.</li>
              <li>달력에 휴가·출퇴근 정보가 표시되면 연결이 완료됩니다.</li>
            </ol>
            <p className="insa-bridge-help" role={bridgeStatus === 'waiting' || bookmarkletClicked ? 'status' : undefined}>
              {bridgeStatus === 'waiting'
                ? '새 탭에서 로그인한 뒤 인사 연결을 눌러 주세요.'
                : bookmarkletClicked
                  ? '이 링크를 즐겨찾기 바에 저장한 뒤, 인사시스템 창에서 눌러 주세요.'
                  : '위 순서대로 인사 연결을 설정해 주세요.'}
            </p>
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
