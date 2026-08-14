export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'jade_in_out_theme_v1';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

export function loadThemePreference(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveThemePreference(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — keep the in-memory theme.
  }
}

export function clearThemePreference(): void {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — nothing to clear.
  }
}

export function getSystemTheme(): Theme {
  const mediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  return mediaQuery?.matches ? 'dark' : 'light';
}
