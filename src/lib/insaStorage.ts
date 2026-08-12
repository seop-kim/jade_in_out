export const INSA_COOKIE_STORAGE_KEY = 'insa_kwe_cookie_v1';

export function loadInsaCookie(): string | null {
  try {
    return localStorage.getItem(INSA_COOKIE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveInsaCookie(cookie: string): void {
  try {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, cookie.trim());
  } catch {
    // localStorage unavailable (private mode, quota, etc.) ??silently skip
  }
}

export function clearInsaCookie(): void {
  try {
    localStorage.removeItem(INSA_COOKIE_STORAGE_KEY);
  } catch {
    // see saveInsaCookie
  }
}
