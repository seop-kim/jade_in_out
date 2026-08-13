import {FormEvent, useEffect, useRef, useState} from 'react';

interface InsaSetupProps {
  onSubmit: (cookie: string) => void;
  onOpenAutomatic: () => void;
  bridgeStatus: 'idle' | 'waiting';
  bookmarkletHref: string;
}

function InsaSetup({onSubmit, onOpenAutomatic, bridgeStatus, bookmarkletHref}: InsaSetupProps) {
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
      <section className="insa-card insa-auto-connect-card">
        <h2 className="insa-setup-title">신규 인사시스템 연결</h2>
        <p className="insa-setup-description">
          인사시스템에 로그인한 뒤 즐겨찾기 버튼을 한 번 누르면 쿠키를 직접 입력하지 않고 연결할 수 있습니다.
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
            인사 연결 즐겨찾기
          </a>
        </div>
        <p className="insa-bridge-help" role={bridgeStatus === 'waiting' || bookmarkletClicked ? 'status' : undefined}>
          {bridgeStatus === 'waiting'
            ? '새 탭에서 로그인한 뒤 인사 연결 즐겨찾기를 눌러 주세요.'
            : bookmarkletClicked
              ? '이 링크를 즐겨찾기 바에 끌어다 놓은 뒤, 인사시스템 창에서 눌러 주세요.'
            : '위 링크를 즐겨찾기 바에 끌어다 놓은 뒤 사용하세요.'}
        </p>
      </section>
      <section className="insa-card">
        <h2 className="insa-setup-title">직접 인증 정보 입력</h2>
        <p className="insa-setup-description">
          자동 연결을 사용할 수 없는 경우에만 신규 인사시스템 요청의 Cookie 값을 입력하세요.
        </p>
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
    </form>
  );
}

export default InsaSetup;
