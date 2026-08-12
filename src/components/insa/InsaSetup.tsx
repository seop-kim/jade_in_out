import {FormEvent, useState} from 'react';

interface InsaSetupProps {
  onSubmit: (cookie: string) => void;
}

function InsaSetup({onSubmit}: InsaSetupProps) {
  const [cookie, setCookie] = useState('');
  const normalizedCookie = cookie.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (normalizedCookie) onSubmit(normalizedCookie);
  };

  return (
    <form className="insa-setup" onSubmit={handleSubmit}>
      <section className="insa-card">
        <h2 className="insa-setup-title">신규 인사시스템 연결</h2>
        <p className="insa-setup-description">
          신규 인사시스템 요청의 Cookie 값을 입력하세요. 이 값은 Jade 인증 정보와 별도로 저장됩니다.
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
