import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsMenu from './SettingsMenu';

const baseProps = {
  theme: 'light' as const,
  onThemeChange: jest.fn(),
  jadeStatus: 'connected' as const,
  insaStatus: 'connected' as const,
  canResetCredentials: true,
  onResetCredentials: jest.fn(),
  canViewLeaveBalance: true,
  onOpenLeaveBalance: jest.fn(),
};

describe('SettingsMenu leave balance entry', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows the vacation balance action and disables it without both connections', async () => {
    const {rerender} = render(<SettingsMenu {...baseProps} canViewLeaveBalance={false} />);

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    const leaveButton = screen.getByRole('button', {name: '휴가 현황'});
    expect(leaveButton).toBeDisabled();

    rerender(<SettingsMenu {...baseProps} />);
    expect(screen.getByRole('button', {name: '휴가 현황'})).not.toBeDisabled();
  });

  test('closes the settings popover and opens the vacation balance modal', async () => {
    render(<SettingsMenu {...baseProps} />);

    await userEvent.click(screen.getByRole('button', {name: '설정'}));
    await userEvent.click(screen.getByRole('button', {name: '휴가 현황'}));

    expect(baseProps.onOpenLeaveBalance).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', {name: '설정'})).not.toBeInTheDocument();
  });
});
