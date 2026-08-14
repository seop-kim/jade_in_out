export interface Credentials {
  cookie: string;
  body: string;
  parsedBody: Record<string, string>;
}

const STORAGE_KEY = 'jade_in_out_credentials_v1';

export function loadCredentials(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (!parsed.cookie || !parsed.body) return null;
    return {
      cookie: parsed.cookie,
      body: parsed.body,
      parsedBody: parsed.parsedBody ?? {},
    };
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip
  }
}

export function clearCredentials(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // see saveCredentials
  }
}
