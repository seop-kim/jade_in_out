export type ConnectionStatus = 'not-configured' | 'checking' | 'connected' | 'error';

const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  'not-configured': '인증 필요',
  checking: '확인 중',
  connected: '연결됨',
  error: '확인 실패',
};

export function connectionStatusLabel(status: ConnectionStatus): string {
  return CONNECTION_STATUS_LABELS[status];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLastFetchedAt(value: Date | null): string {
  if (!value) return '';
  return `${value.getFullYear()}. ${pad(value.getMonth() + 1)}. ${pad(value.getDate())}. ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
