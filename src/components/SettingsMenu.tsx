import {useEffect, useRef, useState} from 'react';
import './SettingsMenu.css';
import {Theme} from '../lib/theme';

interface SettingsMenuProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  canResetCredentials: boolean;
  onResetCredentials: () => void;
}

function SettingsIcon() {
  return (
    <svg className="settings-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.5 5.5h3l.4 1.6c.43.18.83.41 1.2.7l1.6-.5 1.5 2.6-1.2 1.1a6 6 0 0 1 0 1.4l1.2 1.1-1.5 2.6-1.6-.5c-.37.29-.77.52-1.2.7l-.4 1.6h-3l-.4-1.6a5.9 5.9 0 0 1-1.2-.7l-1.6.5-1.5-2.6L7 12.4a6 6 0 0 1 0-1.4L5.8 9.9l1.5-2.6 1.6.5c.37-.29.77-.52 1.2-.7l.4-1.6Z" />
      <circle cx="12" cy="11.9" r="2.2" />
    </svg>
  );
}

function SettingsMenu({theme, onThemeChange, canResetCredentials, onResetCredentials}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleDocumentMouseDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={containerRef}>
      <button
        type="button"
        className="settings-button"
        aria-label="설정"
        title="설정"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SettingsIcon />
      </button>

      {open && (
        <div className="settings-popover" role="dialog" aria-label="설정">
          <h2 className="settings-title">설정</h2>
          <label className="settings-option">
            <span>다크모드</span>
            <input
              type="checkbox"
              role="switch"
              checked={theme === 'dark'}
              onChange={(event) => onThemeChange(event.target.checked ? 'dark' : 'light')}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>
          <button
            type="button"
            className="settings-reset"
            onClick={() => {
              onResetCredentials();
              setOpen(false);
            }}
            disabled={!canResetCredentials}
          >
            인증 정보 초기화
          </button>
        </div>
      )}
    </div>
  );
}

export default SettingsMenu;
