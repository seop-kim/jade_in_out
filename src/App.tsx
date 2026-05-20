import {useState} from 'react';
import './App.css';
import Setup from './components/Setup';
import CalendarPage from './components/CalendarPage';
import {clearCredentials, Credentials, loadCredentials, saveCredentials} from './lib/storage';

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials());

  const handleSetupSubmit = (creds: Credentials): void => {
    saveCredentials(creds);
    setCredentials(creds);
  };

  const handleResetCredentials = (): void => {
    clearCredentials();
    setCredentials(null);
  };

  const empName = credentials?.parsedBody['S_EMP_NM'] ?? '';
  const empId = credentials?.parsedBody['S_EMP_ID'] ?? '';
  const userLabel = `${empName} ${empId ? `(${empId})` : ''}`.trim();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1 className="app-title">Jade 출퇴근 기록</h1>
            <p className="app-subtitle">
              {credentials
                ? userLabel || '날짜별 출근/퇴근 시간을 한눈에 확인하세요'
                : '시작하려면 먼저 Jade 인증 정보를 입력해주세요'}
            </p>
          </div>
          {credentials && (
            <button className="btn btn-ghost" onClick={handleResetCredentials}>
              인증 정보 재설정
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {credentials ? (
          <CalendarPage credentials={credentials}/>
        ) : (
          <Setup onSubmit={handleSetupSubmit}/>
        )}
      </main>
    </div>
  );
}

export default App;
