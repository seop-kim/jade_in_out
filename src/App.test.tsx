import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {clearInsaCookie} from './lib/insaStorage';
import {clearCredentials, saveCredentials} from './lib/storage';

describe('App system tabs', () => {
  beforeEach(() => {
    clearCredentials();
    clearInsaCookie();
  });

  afterEach(() => {
    clearCredentials();
    clearInsaCookie();
  });

  test('keeps Jade setup as the default and opens the independent INSA screen', async () => {
    render(<App />);

    expect(screen.getByRole('tab', {name: '기존 시스템'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', {name: 'Jade 인증 정보 입력'})).toBeInTheDocument();
    expect(screen.queryByLabelText('INSA Cookie')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', {name: '신규 인사시스템'}));

    expect(screen.getByRole('tab', {name: '신규 인사시스템'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('INSA Cookie')).toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Jade 인증 정보 입력'})).not.toBeInTheDocument();
  });

  test('shows the Jade credential reset only on the active Jade tab', async () => {
    saveCredentials({
      cookie: 'jade-session',
      body: 'S_STD_YMD=20260812',
      parsedBody: {},
    });
    render(<App />);

    expect(screen.getByRole('button', {name: '인증 정보 초기화'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', {name: '신규 인사시스템'}));

    expect(screen.queryByRole('button', {name: '인증 정보 초기화'})).not.toBeInTheDocument();
  });
});
