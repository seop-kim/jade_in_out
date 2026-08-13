import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Setup from './Setup';

describe('Jade setup', () => {
  test('offers automatic Jade connection without removing manual setup', async () => {
    render(<Setup onSubmit={jest.fn()} onOpenAutomatic={jest.fn()} bridgeStatus="idle" bookmarkletHref="javascript:void(0)" />);

    expect(screen.getByRole('button', {name: 'Jade 시스템 열기'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Jade 연결 즐겨찾기'})).toHaveAttribute('href', expect.stringMatching(/^javascript:/));
    expect(screen.getByLabelText('cURL 명령어')).toBeInTheDocument();
  });

  test('explains what to do when the bookmarklet link is clicked directly', async () => {
    render(<Setup onSubmit={jest.fn()} onOpenAutomatic={jest.fn()} bridgeStatus="idle" bookmarkletHref="javascript:void(0)" />);

    await userEvent.click(screen.getByRole('link', {name: 'Jade 연결 즐겨찾기'}));

    expect(screen.getByRole('status')).toHaveTextContent('즐겨찾기 바');
  });
});
