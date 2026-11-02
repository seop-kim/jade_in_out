import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LeaveBalanceModal from './LeaveBalanceModal';
import {LeaveBalanceResult, UnresolvedLeaveRecord} from '../lib/leaveBalance';

const result: LeaveBalanceResult = {
  year: 2026,
  accruedHours: 160,
  jadeUsedHours: 16,
  insaUsedHours: 24,
  duplicateHours: 8,
  usedHours: 32,
  remainingHours: 128,
  records: [
    {
      ymd: '2026-08-05',
      type: '연차',
      canonicalType: 'annual',
      durationLabel: '전4',
      hours: 4,
      status: '승인',
      source: 'both',
      deductible: true,
      duplicate: true,
    },
  ],
  unresolved: [],
};

describe('LeaveBalanceModal', () => {
  test('locks page scrolling while open and restores it after close', async () => {
    document.body.style.overflow = 'auto';
    const onClose = jest.fn();
    const {rerender} = render(
      <LeaveBalanceModal open onClose={onClose} onLoad={jest.fn()} result={null} error={null} loading={false} progress={null} />
    );

    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.click(screen.getByRole('button', {name: '닫기'}));
    rerender(
      <LeaveBalanceModal open={false} onClose={onClose} onLoad={jest.fn()} result={null} error={null} loading={false} progress={null} />
    );
    expect(document.body.style.overflow).toBe('auto');
  });

  test('does not request data until 조회 is clicked and renders the balance details', async () => {
    let resolve!: (value: LeaveBalanceResult) => void;
    const onLoad = jest.fn(() => new Promise<LeaveBalanceResult>((nextResolve) => {
      resolve = nextResolve;
    }));
    render(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={onLoad}
        result={null}
        error={null}
        loading={false}
        progress={null}
      />
    );

    expect(onLoad).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: '조회'}));
    expect(onLoad).toHaveBeenCalledWith(2026, expect.any(AbortSignal), expect.any(Function));
    expect(screen.getByText('휴가 현황을 불러오는 중입니다.')).toBeInTheDocument();

    resolve(result);
    expect(await screen.findByText('발생')).toBeInTheDocument();
    expect(screen.getByText('Jade 사용')).toBeInTheDocument();
    expect(screen.getByText('신규 사용')).toBeInTheDocument();
    expect(screen.getByText('중복 제외')).toBeInTheDocument();
    expect(screen.getByText('최종 사용')).toBeInTheDocument();
    expect(screen.getByText('잔여 시간')).toBeInTheDocument();
    expect(screen.getByText('2026-08-05')).toBeInTheDocument();
    expect(screen.getByText('연차')).toBeInTheDocument();
    expect(screen.getByText('전4')).toBeInTheDocument();
    expect(screen.getByText('Jade + 신규')).toBeInTheDocument();
    expect(screen.getByText('승인')).toBeInTheDocument();
  });

  test('shows unresolved warnings and does not expose a partial result on failure', async () => {
    const onLoad = jest.fn().mockRejectedValue(new Error('request failed'));
    const onClose = jest.fn();
    const unresolvedRecord: UnresolvedLeaveRecord = {
      ...result.records[0]!,
      hours: null,
      reason: 'unknown-duration',
    };
    const {rerender} = render(
      <LeaveBalanceModal
        open
        onClose={onClose}
        onLoad={onLoad}
        result={{...result, unresolved: [unresolvedRecord]}}
        error={null}
        loading={false}
        progress={null}
      />
    );

    expect(screen.getByText('확인되지 않은 사용 내역이 있습니다.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: '조회'}));
    expect(await screen.findByText('휴가 현황을 불러오지 못했습니다. 다시 연결을 확인해주세요.')).toBeInTheDocument();
    expect(screen.queryByText('잔여 시간')).not.toBeInTheDocument();

    rerender(<LeaveBalanceModal open onClose={onClose} onLoad={onLoad} result={null} error={null} loading={false} progress={null} />);
    await userEvent.click(screen.getByRole('button', {name: '닫기'}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
