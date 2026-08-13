import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Setup from './Setup';

describe('Jade setup', () => {
  test('offers automatic Jade connection without removing manual setup', async () => {
    render(<Setup onSubmit={jest.fn()} onOpenAutomatic={jest.fn()} bridgeStatus="idle" bookmarkletHref="javascript:void(0)" />);

    expect(screen.getByRole('button', {name: 'Jade 시스템 열기'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Jade 연결'})).toHaveAttribute('href', expect.stringMatching(/^javascript:/));
    expect(screen.getByText('아래 순서대로 진행하면 cURL을 직접 입력하지 않고 로그인된 Jade와 연결할 수 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('Jade 연결을 북마크에 끌어다 놓아 저장합니다.')).toBeInTheDocument();
    expect(screen.getByText('조회버튼을 한번 클릭하면 연결이 됩니다.')).toBeInTheDocument();
    expect(screen.getByText('Jade 브라우저를 종료하지 말아주세요.')).toBeInTheDocument();
    expect(screen.queryByText('위 순서대로 Jade 연결을 설정해주세요.')).not.toBeInTheDocument();
    expect(screen.getByText('Jade 브라우저를 종료하지 말아주세요.').closest('section')).toHaveClass('setup-auto-card');
    expect(screen.getByLabelText('cURL 명령어')).toBeInTheDocument();
  });

  test('explains what to do when the bookmarklet link is clicked directly', async () => {
    render(<Setup onSubmit={jest.fn()} onOpenAutomatic={jest.fn()} bridgeStatus="idle" bookmarkletHref="javascript:void(0)" />);

    await userEvent.click(screen.getByRole('link', {name: 'Jade 연결'}));

    expect(screen.getByRole('status')).toHaveTextContent('즐겨찾기 바');
  });
});
