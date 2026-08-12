import {KeyboardEvent, useRef, useState} from 'react';
import './App.css';
import Setup from './components/Setup';
import CalendarPage from './components/CalendarPage';
import InsaPage from './components/insa/InsaPage';
import {clearCredentials, Credentials, loadCredentials, saveCredentials} from './lib/storage';

type SystemTab = 'jade' | 'insa';

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials());
  const [systemTab, setSystemTab] = useState<SystemTab>('jade');
  const jadeTabRef = useRef<HTMLButtonElement>(null);
  const insaTabRef = useRef<HTMLButtonElement>(null);

  const selectSystemTab = (tab: SystemTab, focus = false): void => {
    setSystemTab(tab);
    if (focus) {
      (tab === 'jade' ? jadeTabRef : insaTabRef).current?.focus();
    }
  };

  const handleSystemTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const nextTab = event.key === 'ArrowLeft' || event.key === 'Home'
      ? 'jade'
      : event.key === 'ArrowRight' || event.key === 'End'
        ? 'insa'
        : null;
    if (!nextTab) return;

    event.preventDefault();
    selectSystemTab(nextTab, true);
  };

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
          {systemTab === 'jade' && credentials && (
            <button className="btn btn-ghost" onClick={handleResetCredentials}>
              인증 정보 초기화
            </button>
          )}
        </div>
        <div className="system-tabs" role="tablist" aria-label="인사시스템 선택">
          <button
            ref={jadeTabRef}
            type="button"
            role="tab"
            id="jade-system-tab"
            aria-controls="jade-system-panel"
            aria-selected={systemTab === 'jade'}
            tabIndex={systemTab === 'jade' ? 0 : -1}
            className={`system-tab ${systemTab === 'jade' ? 'active' : ''}`}
            onClick={() => selectSystemTab('jade')}
            onKeyDown={handleSystemTabKeyDown}
          >
            기존 시스템
          </button>
          <button
            ref={insaTabRef}
            type="button"
            role="tab"
            id="insa-system-tab"
            aria-controls="insa-system-panel"
            aria-selected={systemTab === 'insa'}
            tabIndex={systemTab === 'insa' ? 0 : -1}
            className={`system-tab ${systemTab === 'insa' ? 'active' : ''}`}
            onClick={() => selectSystemTab('insa')}
            onKeyDown={handleSystemTabKeyDown}
          >
            신규 인사시스템
          </button>
        </div>
      </header>

      <main className="app-main">
        <div
          role="tabpanel"
          id="jade-system-panel"
          aria-labelledby="jade-system-tab"
          hidden={systemTab !== 'jade'}
        >
          {systemTab === 'jade' && (credentials ? (
              <CalendarPage credentials={credentials}/>
            ) : (
              <Setup onSubmit={handleSetupSubmit}/>
            ))}
        </div>
        <div
          role="tabpanel"
          id="insa-system-panel"
          aria-labelledby="insa-system-tab"
          hidden={systemTab !== 'insa'}
        >
          {systemTab === 'insa' && <InsaPage />}
        </div>
      </main>
    </div>
  );
}

export default App;
