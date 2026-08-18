import {KeyboardEvent, useCallback, useEffect, useRef, useState} from 'react';
import './App.css';
import Setup from './components/Setup';
import CalendarPage from './components/CalendarPage';
import {ToastMessage, ToastViewport} from './components/Toast';
import InsaPage, {InsaApiRequest} from './components/insa/InsaPage';
import SettingsMenu from './components/SettingsMenu';
import {appConfig} from './config';
import {
  JADE_APP_WINDOW_NAME,
  createJadeBookmarklet,
  isJadeAttendanceResponse,
  JadeBridgeClient,
  JadeBridgeTransport,
} from './lib/jadeBridge';
import {parseBody} from './lib/parseCurl';
import {clearCredentials, Credentials, loadCredentials, saveCredentials} from './lib/storage';
import {loadThemePreference, saveThemePreference, Theme} from './lib/theme';
import {ConnectionStatus} from './lib/connectionStatus';

type SystemTab = 'jade' | 'insa';
const MIN_INSA_STATUS_TOAST_MS = 300;

interface InsaRequestToastState {
  id: number;
  messages: string[];
  startedAt: number;
  removeTimer?: number;
}

interface JadeBridgeConnection {
  credentials: Credentials;
  transport: JadeBridgeTransport;
}

function ExportIcon() {
  return (
    <svg className="export-header-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials());
  const [jadeBridgeConnection, setJadeBridgeConnection] = useState<JadeBridgeConnection | null>(null);
  const [jadeBridgeStatus, setJadeBridgeStatus] = useState<'idle' | 'waiting' | 'ready'>('idle');
  const [jadeBridgeWindow, setJadeBridgeWindow] = useState<Window | null>(null);
  const [systemTab, setSystemTab] = useState<SystemTab>('jade');
  const [theme, setTheme] = useState<Theme>(() => loadThemePreference() ?? 'light');
  const [jadeConnectionStatus, setJadeConnectionStatus] = useState<ConnectionStatus>(
    () => credentials ? 'checking' : 'not-configured'
  );
  const [insaConnectionStatus, setInsaConnectionStatus] = useState<ConnectionStatus>('not-configured');
  const [insaVisited, setInsaVisited] = useState(false);
  const [insaConnected, setInsaConnected] = useState(false);
  const [insaResetRequest, setInsaResetRequest] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const insaRequestToasts = useRef(new Map<string, InsaRequestToastState>());
  const jadeTabRef = useRef<HTMLButtonElement>(null);
  const insaTabRef = useRef<HTMLButtonElement>(null);
  const nextToastId = useRef(0);
  const jadeBridgeClientRef = useRef<JadeBridgeClient | null>(null);
  const jadeExportOpenerRef = useRef<(() => void) | null>(null);
  const insaExportOpenerRef = useRef<(() => void) | null>(null);
  const [jadeExportReady, setJadeExportReady] = useState(false);
  const [insaExportReady, setInsaExportReady] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    window.name = JADE_APP_WINDOW_NAME;
  }, []);

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

  const closeJadeBridge = useCallback((closeTab = false): void => {
    jadeBridgeClientRef.current?.dispose();
    jadeBridgeClientRef.current = null;
    if (closeTab && jadeBridgeWindow && !jadeBridgeWindow.closed) {
      jadeBridgeWindow.close();
    }
    setJadeBridgeWindow(null);
    setJadeBridgeStatus('idle');
    setJadeBridgeConnection(null);
    setJadeConnectionStatus('not-configured');
  }, [jadeBridgeWindow]);

  const handleSetupSubmit = (creds: Credentials): void => {
    closeJadeBridge(true);
    saveCredentials(creds);
    setCredentials(creds);
  };

  const handleResetCredentials = useCallback((): void => {
    closeJadeBridge(true);
    clearCredentials();
    setCredentials(null);
    setJadeConnectionStatus('not-configured');
    setJadeExportReady(false);
  }, [closeJadeBridge]);

  const handleThemeChange = useCallback((nextTheme: Theme): void => {
    saveThemePreference(nextTheme);
    setTheme(nextTheme);
  }, []);

  const handleInsaConnectionChange = useCallback((connected: boolean): void => {
    setInsaConnected(connected);
    if (!connected) {
      setInsaConnectionStatus('not-configured');
      setInsaExportReady(false);
    }
  }, []);

  const showErrorToast = useCallback((message: string): void => {
    const id = nextToastId.current + 1;
    nextToastId.current = id;
    setToasts((current) => [...current, {id, message}]);
  }, []);

  const handleJadeAuthenticationExpired = useCallback((): void => {
    handleResetCredentials();
    showErrorToast('인증 정보가 만료되었습니다. 다시 인증해주세요.');
  }, [handleResetCredentials, showErrorToast]);

  const handleInsaAuthenticationExpired = useCallback((): void => {
    setInsaConnectionStatus('not-configured');
    setInsaExportReady(false);
    setInsaResetRequest((request) => request + 1);
    showErrorToast('인증 정보가 만료되었습니다. 다시 인증해주세요.');
  }, [showErrorToast]);

  const handleOpenJadeAutomatic = useCallback((): void => {
    closeJadeBridge(true);
    const jadeWindow = window.open(`${appConfig.jade.origin}/`, '_blank');
    if (!jadeWindow) {
      setJadeConnectionStatus('not-configured');
      showErrorToast('Jade 시스템 창을 열지 못했습니다');
      return;
    }
    setJadeConnectionStatus('checking');

    const client = new JadeBridgeClient(
      jadeWindow,
      window.location.origin,
      () => {
        console.info('[jade-bridge] app-ready');
        setJadeBridgeStatus('ready');
      },
      undefined,
      (body, response) => {
        console.info('[jade-bridge] app-attendance-candidate', {
          bodyLength: body.length,
          responseLength: response.length,
        });
        if (!isJadeAttendanceResponse(response)) return;
        const parsedBody = parseBody(body);
        if (!parsedBody[appConfig.jade.fields.requestDate]) return;
        setJadeBridgeConnection((current) => current ?? {
          credentials: {cookie: '', body, parsedBody},
          transport: jadeBridgeClientRef.current!,
        });
      },
    );
    jadeBridgeClientRef.current = client;
    setJadeBridgeWindow(jadeWindow);
    setJadeBridgeStatus('waiting');
  }, [closeJadeBridge, showErrorToast]);

  useEffect(() => () => {
    jadeBridgeClientRef.current?.dispose();
    jadeBridgeClientRef.current = null;
  }, []);

  useEffect(() => {
    if (!jadeBridgeWindow || credentials) return undefined;
    const timer = window.setInterval(() => {
      if (!jadeBridgeWindow.closed) return;
      jadeBridgeClientRef.current?.dispose();
      jadeBridgeClientRef.current = null;
      setJadeBridgeWindow(null);
      setJadeBridgeStatus('idle');
      setJadeBridgeConnection(null);
      setJadeConnectionStatus('not-configured');
    }, 500);
    return () => window.clearInterval(timer);
  }, [credentials, jadeBridgeWindow]);

  const handleInsaApiRequestChange = useCallback((request: InsaApiRequest, active: boolean): void => {
    const current = insaRequestToasts.current.get(request.key);
    if (active) {
      if (current) {
        if (current.removeTimer !== undefined) {
          window.clearTimeout(current.removeTimer);
          current.removeTimer = undefined;
          current.startedAt = Date.now();
        }
        current.messages.push(request.message);
        setToasts((currentToasts) => currentToasts.map((toast) => (
          toast.id === current.id ? {...toast, message: request.message} : toast
        )));
        return;
      }

      const id = nextToastId.current + 1;
      nextToastId.current = id;
      insaRequestToasts.current.set(request.key, {
        id,
        messages: [request.message],
        startedAt: Date.now(),
      });
      setToasts((currentToasts) => [...currentToasts, {
        id,
        message: request.message,
        variant: 'success',
        persistent: true,
      }]);
      return;
    }

    if (!current) return;
    const messageIndex = current.messages.indexOf(request.message);
    if (messageIndex >= 0) current.messages.splice(messageIndex, 1);
    else current.messages.pop();
    if (current.messages.length > 0) {
      const latestMessage = current.messages[current.messages.length - 1];
      if (latestMessage === undefined) return;
      setToasts((currentToasts) => currentToasts.map((toast) => (
        toast.id === current.id ? {...toast, message: latestMessage} : toast
      )));
      return;
    }

    const removeToast = (): void => {
      const latest = insaRequestToasts.current.get(request.key);
      if (latest !== current || latest.messages.length > 0) return;
      insaRequestToasts.current.delete(request.key);
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== current.id));
    };
    const remaining = Math.max(0, MIN_INSA_STATUS_TOAST_MS - (Date.now() - current.startedAt));
    if (remaining === 0) removeToast();
    else current.removeTimer = window.setTimeout(removeToast, remaining);
  }, []);

  useEffect(() => () => {
    insaRequestToasts.current.forEach((request) => {
      if (request.removeTimer !== undefined) window.clearTimeout(request.removeTimer);
    });
  }, []);

  const dismissToast = useCallback((id: number): void => {
    insaRequestToasts.current.forEach((request, key) => {
      if (request.id === id) {
        if (request.removeTimer !== undefined) window.clearTimeout(request.removeTimer);
        insaRequestToasts.current.delete(key);
      }
    });
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const activeJadeCredentials = credentials ?? jadeBridgeConnection?.credentials ?? null;
  const activeJadeTransport = credentials ? undefined : jadeBridgeConnection?.transport;
  const empName = activeJadeCredentials?.parsedBody[appConfig.jade.fields.employeeName] ?? '';
  const empId = activeJadeCredentials?.parsedBody[appConfig.jade.fields.employeeId] ?? '';
  const userLabel = `${empName} ${empId ? `(${empId})` : ''}`.trim();
  const canResetCredentials = systemTab === 'jade' ? Boolean(activeJadeCredentials) : insaConnected;
  const canExport = systemTab === 'jade'
    ? Boolean(activeJadeCredentials && jadeExportReady)
    : Boolean(insaConnected && insaExportReady);
  const handleOpenExport = (): void => {
    if (!canExport) return;
    if (systemTab === 'jade') jadeExportOpenerRef.current?.();
    else insaExportOpenerRef.current?.();
  };
  const registerJadeExportOpener = useCallback((opener: (() => void) | null): void => {
    jadeExportOpenerRef.current = opener;
    setJadeExportReady(Boolean(opener));
  }, []);
  const registerInsaExportOpener = useCallback((opener: (() => void) | null): void => {
    insaExportOpenerRef.current = opener;
    setInsaExportReady(Boolean(opener));
  }, []);
  const handleResetCurrentCredentials = (): void => {
    if (systemTab === 'jade') handleResetCredentials();
    else {
      setInsaConnectionStatus('not-configured');
      setInsaResetRequest((request) => request + 1);
    }
  };

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
          </div>
          <div className="app-header-actions">
            {activeJadeCredentials && (
              <p className="app-subtitle">
                {userLabel || '날짜별 출근/퇴근 시간을 한눈에 확인하세요'}
              </p>
            )}
            <button
              type="button"
              className="settings-button header-export-button"
              aria-label="엑셀 다운로드"
              title="엑셀 다운로드"
              onClick={handleOpenExport}
              disabled={!canExport}
            >
              <ExportIcon />
            </button>
            <SettingsMenu
              theme={theme}
              onThemeChange={handleThemeChange}
              jadeStatus={jadeConnectionStatus}
              insaStatus={insaConnectionStatus}
              canResetCredentials={canResetCredentials}
              onResetCredentials={handleResetCurrentCredentials}
            />
          </div>
        </div>
      </header>

      <main className="app-main">
        <div
          role="tabpanel"
          id="jade-system-panel"
          aria-labelledby="jade-system-tab"
          hidden={systemTab !== 'jade'}
        >
          {activeJadeCredentials ? (
              <CalendarPage
                credentials={activeJadeCredentials}
                transport={activeJadeTransport}
                onError={showErrorToast}
                onAuthenticationExpired={handleJadeAuthenticationExpired}
                onConnectionStatusChange={setJadeConnectionStatus}
                onExportReady={registerJadeExportOpener}
              />
            ) : (
              <Setup
                onSubmit={handleSetupSubmit}
                onOpenAutomatic={handleOpenJadeAutomatic}
                bridgeStatus={jadeBridgeStatus}
                bookmarkletHref={createJadeBookmarklet(window.location.origin)}
              />
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
              onAuthenticationExpired={handleInsaAuthenticationExpired}
              onConnectionStatusChange={setInsaConnectionStatus}
              onApiRequestChange={handleInsaApiRequestChange}
              onError={showErrorToast}
              onExportReady={registerInsaExportOpener}
            />
          )}
        </div>
      </main>
      <ToastViewport toasts={toasts} onDismiss={dismissToast}/>
    </div>
  );
}

export default App;
