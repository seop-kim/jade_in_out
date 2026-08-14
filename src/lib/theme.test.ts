import {
  clearThemePreference,
  getSystemTheme,
  loadThemePreference,
  saveThemePreference,
} from './theme';

const THEME_STORAGE_KEY = 'jade_in_out_theme_v1';

describe('theme preference', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = originalMatchMedia;
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('loads only valid saved preferences', () => {
    expect(loadThemePreference()).toBeNull();

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(loadThemePreference()).toBe('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
    expect(loadThemePreference()).toBeNull();
  });

  it('saves and clears a theme preference', () => {
    saveThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(loadThemePreference()).toBe('dark');

    clearThemePreference();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('reads the operating system dark mode preference', () => {
    window.matchMedia = jest.fn().mockReturnValue({matches: true}) as typeof window.matchMedia;
    expect(getSystemTheme()).toBe('dark');

    window.matchMedia = jest.fn().mockReturnValue({matches: false}) as typeof window.matchMedia;
    expect(getSystemTheme()).toBe('light');
  });
});
