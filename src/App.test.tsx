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

  test('keeps both controlled tab panels in the DOM and hides the inactive panel', async () => {
    render(<App />);

    const jadeTab = screen.getByRole('tab', {name: '기존 시스템'});
    const insaTab = screen.getByRole('tab', {name: '신규 인사시스템'});
    const jadePanel = document.getElementById(jadeTab.getAttribute('aria-controls') ?? '');
    const insaPanel = document.getElementById(insaTab.getAttribute('aria-controls') ?? '');
    if (!jadePanel || !insaPanel) throw new Error('Controlled tab panel is missing');

    expect(jadeTab).toHaveAttribute('aria-selected', 'true');
    expect(jadeTab).toHaveAttribute('tabindex', '0');
    expect(insaTab).toHaveAttribute('aria-selected', 'false');
    expect(insaTab).toHaveAttribute('tabindex', '-1');
    expect(jadePanel).toHaveAttribute('id', 'jade-system-panel');
    expect(jadePanel).toHaveAttribute('role', 'tabpanel');
    expect(jadePanel).not.toHaveAttribute('hidden');
    expect(insaPanel).toHaveAttribute('id', 'insa-system-panel');
    expect(insaPanel).toHaveAttribute('role', 'tabpanel');
    expect(insaPanel).toHaveAttribute('hidden');

    await userEvent.click(insaTab);

    expect(jadeTab).toHaveAttribute('aria-selected', 'false');
    expect(jadeTab).toHaveAttribute('tabindex', '-1');
    expect(insaTab).toHaveAttribute('aria-selected', 'true');
    expect(insaTab).toHaveAttribute('tabindex', '0');
    expect(jadePanel).toHaveAttribute('hidden');
    expect(insaPanel).not.toHaveAttribute('hidden');
  });

  test('moves tab selection and focus with ArrowLeft, ArrowRight, Home, and End', async () => {
    render(<App />);

    const jadeTab = screen.getByRole('tab', {name: '기존 시스템'});
    const insaTab = screen.getByRole('tab', {name: '신규 인사시스템'});
    jadeTab.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(insaTab).toHaveFocus();
    expect(insaTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    expect(jadeTab).toHaveFocus();
    expect(jadeTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{End}');
    expect(insaTab).toHaveFocus();
    expect(insaTab).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    expect(jadeTab).toHaveFocus();
    expect(jadeTab).toHaveAttribute('aria-selected', 'true');
  });
});
