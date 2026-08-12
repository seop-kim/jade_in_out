import {
  clearInsaCookie,
  INSA_COOKIE_STORAGE_KEY,
  loadInsaCookie,
  saveInsaCookie,
} from './insaStorage';

describe('INSA cookie storage', () => {
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('stores an INSA cookie under its independent key', () => {
    saveInsaCookie(' User_ID=masked; SESSION=masked ');

    expect(localStorage.getItem(INSA_COOKIE_STORAGE_KEY)).toBe('User_ID=masked; SESSION=masked');
    expect(localStorage.getItem('jade_in_out_credentials_v1')).toBeNull();
  });

  test('loads and clears only the INSA cookie', () => {
    localStorage.setItem(INSA_COOKIE_STORAGE_KEY, 'User_ID=masked; SESSION=masked');
    localStorage.setItem('jade_in_out_credentials_v1', 'unrelated');

    expect(loadInsaCookie()).toBe('User_ID=masked; SESSION=masked');

    clearInsaCookie();

    expect(loadInsaCookie()).toBeNull();
    expect(localStorage.getItem('jade_in_out_credentials_v1')).toBe('unrelated');
  });

  test('returns safely when localStorage access throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(loadInsaCookie()).toBeNull();
    expect(() => saveInsaCookie('User_ID=masked')).not.toThrow();
    expect(() => clearInsaCookie()).not.toThrow();
  });
});
