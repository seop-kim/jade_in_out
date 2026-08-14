import {clearCredentials, loadCredentials, saveCredentials} from './storage';

const STORAGE_KEY = 'jade_in_out_credentials_v1';

describe('Jade credential storage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  });

  test('stores credentials in sessionStorage, not localStorage', () => {
    const credentials = {cookie: 'session-cookie', body: 'request-body', parsedBody: {foo: 'bar'}};

    saveCredentials(credentials);

    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(credentials));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadCredentials()).toEqual(credentials);
  });

  test('loads and clears only session credentials', () => {
    const credentials = {cookie: 'session-cookie', body: 'request-body', parsedBody: {}};
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    localStorage.setItem(STORAGE_KEY, 'persistent-value');

    expect(loadCredentials()).toEqual(credentials);

    clearCredentials();

    expect(loadCredentials()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('persistent-value');
  });

  test('returns safely when sessionStorage access throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(loadCredentials()).toBeNull();
    expect(() => saveCredentials({cookie: 'cookie', body: 'body', parsedBody: {}})).not.toThrow();
    expect(() => clearCredentials()).not.toThrow();
  });
});
