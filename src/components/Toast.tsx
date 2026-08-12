import {useEffect, useState} from 'react';
import './Toast.css';

const TOAST_DURATION_MS = 5000;
const TOAST_EXIT_MS = 220;

export interface ToastMessage {
  id: number;
  message: string;
}

interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}

export interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

function ToastItem({toast, onDismiss}: ToastItemProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setExiting(true), TOAST_DURATION_MS);
    const dismissTimer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS + TOAST_EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [onDismiss, toast.id]);

  return (
    <div className={`toast ${exiting ? 'is-exiting' : ''}`.trim()} role="alert">
      <span className="toast-message">{toast.message}</span>
      <button type="button" className="toast-dismiss" onClick={() => onDismiss(toast.id)} aria-label="알림 닫기">
        ×
      </button>
    </div>
  );
}

export function ToastViewport({toasts, onDismiss}: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-label="알림">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
