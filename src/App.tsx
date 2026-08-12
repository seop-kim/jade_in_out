import {KeyboardEvent, useCallback, useRef, useState} from 'react';
import './App.css';
import Setup from './components/Setup';
import CalendarPage from './components/CalendarPage';
import {ToastMessage, ToastViewport} from './components/Toast';
import InsaPage from './components/insa/InsaPage';
import {clearCredentials, Credentials, loadCredentials, saveCredentials} from './lib/storage';

type SystemTab = 'jade' | 'insa';

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials());
  const [systemTab, setSystemTab] = useState<SystemTab>('jade');
  const [insaVisited, setInsaVisited] = useState(false);
  const [insaConnected, setInsaConnected] = useState(false);
  const [insaResetRequest, setInsaResetRequest] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const jadeTabRef = useRef<HTMLButtonElement>(null);
  const insaTabRef = useRef<HTMLButtonElement>(null);
  const nextToastId = useRef(0);

  const selectSystemTab = (tab: SystemTab, focus = false): void => {
    if (tab === 'insa') setInsaVisited(true);
    setSystemTab(tab);
    if (focus) {
      (tab === 'jade' ? jadeTabRef : insaTabRef).current?.focus();
    }
  };

  const handleSystemTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const currentTab: SystemTab = event.currentTarget.id === 'jade-system-tab' ? 'jade' : 'insa';
    const nextTab = event.key === 'Home'
      ? 'jade'
      : event.key === 'End'
        ? 'insa'
        : event.key === 'ArrowLeft' || event.key === 'ArrowRight'
          ? currentTab === 'jade' ? 'insa' : 'jade'
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

  const handleInsaConnectionChange = useCallback((connected: boolean): void => {
    setInsaConnected(connected);
  }, []);

  const showErrorToast = useCallback((message: string): void => {
    const id = nextToastId.current + 1;
    nextToastId.current = id;
    setToasts((current) => [...current, {id, message}]);
  }, []);

  const dismissToast = useCallback((id: number): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const empName = credentials?.parsedBody['S_EMP_NM'] ?? '';
  const empId = credentials?.parsedBody['S_EMP_ID'] ?? '';
  const userLabel = `${empName} ${empId ? `(${empId})` : ''}`.trim();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div className="app-header-main">
            <div className="app-title-row">
              <h1 className="app-title">출퇴근 기록</h1>
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
                  기존
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
                  신규
                </button>
              </div>
            </div>
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
          {systemTab === 'insa' && insaConnected && (
            <button className="btn btn-ghost" onClick={() => setInsaResetRequest((request) => request + 1)}>
              인증 정보 초기화
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        <div
          role="tabpanel"
          id="jade-system-panel"
          aria-labelledby="jade-system-tab"
          hidden={systemTab !== 'jade'}
        >
          {credentials ? (
              <CalendarPage credentials={credentials} onError={showErrorToast}/>
            ) : (
              <Setup onSubmit={handleSetupSubmit}/>
            )}
        </div>
        <div
          role="tabpanel"
          id="insa-system-panel"
          aria-labelledby="insa-system-tab"
          hidden={systemTab !== 'insa'}
        >
          {insaVisited && (
            <InsaPage
              resetRequest={insaResetRequest}
              onConnectionChange={handleInsaConnectionChange}
              onError={showErrorToast}
            />
          )}
        </div>
      </main>
      <ToastViewport toasts={toasts} onDismiss={dismissToast}/>
    </div>
  );
}

export default App;
