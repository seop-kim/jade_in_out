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
  periods: [{
    id: '2026|2026-01-01 ~ 2026-12-31',
    year: 2026,
    period: '2026-01-01 ~ 2026-12-31',
    startYmd: '2026-01-01',
    endYmd: '2026-12-31',
    isNewHire: false,
    accruedHours: 160,
    usedHours: 32,
    remainingHours: 128,
  }],
  availablePeriods: [{
    id: '2026|2026-01-01 ~ 2026-12-31',
    year: 2026,
    period: '2026-01-01 ~ 2026-12-31',
    startYmd: '2026-01-01',
    endYmd: '2026-12-31',
    isNewHire: false,
    accruedHours: 160,
    usedHours: 32,
    remainingHours: 128,
  }],
  includePreviousPeriod: false,
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
  reviewRows: [
    {
      id: 'jade-0',
      ymd: '2026-08-05',
      type: '연차',
      canonicalType: 'annual',
      durationLabel: '전4',
      hours: 4,
      status: '확정',
      reason: '',
      source: 'jade',
      periodId: '2026|2026-01-01 ~ 2026-12-31',
      periodLabel: '2026 연차',
      deductible: true,
      duplicateGroup: 'duplicate-0',
      autoDecision: 'deduct',
      needsReview: false,
    },
    {
      id: 'insa-0',
      ymd: '2026-08-05',
      type: '연차휴가(시간차)',
      canonicalType: 'annual',
      durationLabel: '(전4)',
      hours: 4,
      status: '승인',
      reason: '신규 사유',
      source: 'insa',
      periodId: '2026|2026-01-01 ~ 2026-12-31',
      periodLabel: '2026 연차',
      deductible: true,
      duplicateGroup: 'duplicate-0',
      autoDecision: 'duplicate',
      needsReview: false,
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

  test('moves focus into the dialog, traps Tab, and restores focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = jest.fn();
    const {rerender} = render(
      <LeaveBalanceModal open onClose={onClose} onLoad={jest.fn()} result={null} error={null} loading={false} progress={null} />
    );

    const dialog = screen.getByRole('dialog', {name: '휴가 현황'});
    expect(screen.getByRole('button', {name: '닫기'})).toHaveFocus();
    await userEvent.tab({shift: true});
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await userEvent.click(screen.getByRole('button', {name: '닫기'}));
    rerender(
      <LeaveBalanceModal open={false} onClose={onClose} onLoad={jest.fn()} result={null} error={null} loading={false} progress={null} />
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
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
    expect(onLoad).toHaveBeenCalledWith(2026, expect.any(AbortSignal), expect.any(Function), false);
    expect(screen.getByText('휴가 현황을 불러오는 중입니다.')).toBeInTheDocument();

    resolve(result);
    expect((await screen.findAllByText('발생')).length).toBeGreaterThan(0);
    expect(screen.getByText('Jade 사용')).toBeInTheDocument();
    expect(screen.getByText('신규 사용')).toBeInTheDocument();
    expect(screen.getAllByText('중복 제외').length).toBeGreaterThan(0);
    expect(screen.getByText('최종 사용')).toBeInTheDocument();
    expect(screen.getByText('잔여 시간')).toBeInTheDocument();
    const accrualSource = screen.getByRole('combobox', {name: '발생 기준 2026년'});
    expect(accrualSource).toHaveValue('Jade');
    await userEvent.selectOptions(accrualSource, 'KIMS');
    expect(accrualSource).toHaveValue('KIMS');
    expect(screen.getAllByText('2026-08-05')).toHaveLength(2);
    expect(screen.getByText('연차')).toBeInTheDocument();
    expect(screen.getByText('전4')).toBeInTheDocument();
    expect(screen.getAllByText('Jade').length).toBeGreaterThan(0);
    expect(screen.getByText('신규')).toBeInTheDocument();
    expect(screen.getByText('승인')).toBeInTheDocument();
  });

  test('renders separate progress bars for each year when both periods are loading', () => {
    render(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error={null}
        loading
        progress={[
          {year: 2025, completed: 120, total: 365},
          {year: 2026, completed: 30, total: 365},
        ]}
      />
    );

    expect(screen.getByText('2025년 휴가 정보')).toBeInTheDocument();
    expect(screen.getByText('2026년 휴가 정보')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', {name: '2025년 휴가 정보 조회 진행률'})).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByRole('progressbar', {name: '2026년 휴가 정보 조회 진행률'})).toHaveAttribute('aria-valuenow', '8');
  });

  test('only shows 신입휴가 포함 for eligible new hires', async () => {
    const {rerender} = render(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error={null}
        loading={false}
        progress={null}
        canIncludePreviousPeriod={false}
      />
    );

    expect(screen.queryByRole('checkbox', {name: '신입휴가 포함 (전년도 포함)'})).not.toBeInTheDocument();

    rerender(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error={null}
        loading={false}
        progress={null}
        canIncludePreviousPeriod
      />
    );

    expect(screen.getByRole('checkbox', {name: '신입휴가 포함 (전년도 포함)'})).toBeEnabled();
  });

  test('only shows 신입휴가 포함 for 입사년도 다음 연도', async () => {
    const {rerender} = render(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error={null}
        loading={false}
        progress={null}
        canIncludePreviousPeriod
        previousPeriodEligibleYear={2026}
      />
    );

    expect(screen.getByRole('checkbox', {name: '신입휴가 포함 (전년도 포함)'})).toBeEnabled();
    await userEvent.selectOptions(screen.getByLabelText('조회 연도'), '2025');
    expect(screen.queryByRole('checkbox', {name: '신입휴가 포함 (전년도 포함)'})).not.toBeInTheDocument();

    rerender(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error={null}
        loading={false}
        progress={null}
        canIncludePreviousPeriod
        previousPeriodEligibleYear={2025}
      />
    );
    expect(screen.getByRole('checkbox', {name: '신입휴가 포함 (전년도 포함)'})).toBeEnabled();
  });

  test('reveals sanitized request failure details on demand', async () => {
    render(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error="휴가 현황을 불러오지 못했습니다. 다시 연결을 확인해주세요."
        errorDetails={['Jade 2025년 조회 실패 (1건)', '20250101 · HTTP 500']}
        loading={false}
        progress={null}
      />
    );

    expect(screen.getByText('자세히 보기')).toBeInTheDocument();
    expect(screen.queryByText('20250101 · HTTP 500')).not.toBeVisible();
    await userEvent.click(screen.getByText('자세히 보기'));
    expect(screen.getByText('Jade 2025년 조회 실패 (1건)')).toBeVisible();
    expect(screen.getByText('20250101 · HTTP 500')).toBeVisible();
  });

  test('renders every source row with review columns and the original reason', () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    expect(screen.getByRole('columnheader', {name: '날짜'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '휴가 유형'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '사유'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '시간'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '출처'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '승인상태'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '자동 판정'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '최종 판정'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '반영시간'})).toBeInTheDocument();
    expect(screen.getByText('신규 사유')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})).toHaveLength(2);
  });

  test('shows a review-needed marker for rows requiring manual confirmation', () => {
    const reviewNeededResult: LeaveBalanceResult = {
      ...result,
      reviewRows: [{...result.reviewRows[1]!, id: 'insa-pending', type: '연차 외 휴가', autoDecision: 'exclude', needsReview: true}],
    };
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={reviewNeededResult} error={null} loading={false} progress={null} />
    );

    expect(screen.getByText('확인 필요')).toBeInTheDocument();
  });

  test('updates the final usage immediately when a row decision changes', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    const finalDecisions = screen.getAllByRole('combobox', {name: /최종 판정/});
    await userEvent.selectOptions(finalDecisions[1]!, 'deduct');

    expect(screen.getByText('최종 사용')).toBeInTheDocument();
    expect(screen.getByText('8시간')).toBeInTheDocument();
    expect(finalDecisions[1]).toHaveValue('deduct');
  });

  test('dims excluded rows and removes a row only for the current modal view', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    const finalDecisions = screen.getAllByRole('combobox', {name: /최종 판정/});
    expect(finalDecisions[1]!.closest('tr')).toHaveClass('leave-balance-row-dismissed');
    expect(screen.getByText('Jade 사용').parentElement).toHaveTextContent('4시간');

    await userEvent.selectOptions(finalDecisions[0]!, 'exclude');
    expect(finalDecisions[0]!.closest('tr')).toHaveClass('leave-balance-row-dismissed');

    await userEvent.click(screen.getByRole('button', {name: '행 삭제 2026-08-05 Jade'}));
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})).toHaveLength(1);
    expect(screen.queryByRole('button', {name: '행 삭제 2026-08-05 Jade'})).not.toBeInTheDocument();
    expect(screen.getByText('Jade 사용').parentElement).toHaveTextContent('0시간');
  });

  test('reloads with the previous new-hire period when the option is enabled', async () => {
    const previousPeriod = {
      id: '2025|2025-03-04 ~ 2026-03-03',
      year: 2025,
      period: '2025-03-04 ~ 2026-03-03',
      startYmd: '2025-03-04',
      endYmd: '2026-03-03',
      isNewHire: true,
      accruedHours: 88,
      usedHours: 66,
      remainingHours: 22,
    };
    const previousResult: LeaveBalanceResult = {
      ...result,
      accruedHours: 248,
      periods: [...result.periods, previousPeriod],
      availablePeriods: [...result.availablePeriods, previousPeriod],
      includePreviousPeriod: true,
    };
    const initialResult: LeaveBalanceResult = {
      ...result,
      availablePeriods: [...result.availablePeriods, previousPeriod],
    };
    const onLoad = jest.fn((_year: number, _signal: AbortSignal, _onProgress: unknown, includePrevious = false) => (
      Promise.resolve(includePrevious ? previousResult : result)
    ));
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={onLoad} result={initialResult} error={null} loading={false} progress={null} />
    );

    const toggle = screen.getByRole('checkbox', {name: '신입휴가 포함 (전년도 포함)'});
    await userEvent.click(toggle);

    expect(onLoad).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: '조회'}));
    expect(onLoad).toHaveBeenCalledWith(2026, expect.any(AbortSignal), expect.any(Function), true);
    expect(await screen.findByText('2025 신입휴가')).toBeInTheDocument();
    expect(screen.getByText('2025-03-04 ~ 2026-03-03')).toBeInTheDocument();
  });

  test('accepts entered hours for an unknown-duration row', async () => {
    const unknownResult: LeaveBalanceResult = {
      ...result,
      records: [{...result.records[0]!, hours: null, source: 'insa', duplicate: false}],
      reviewRows: [{...result.reviewRows[1]!, id: 'insa-unknown', hours: null, autoDecision: 'exclude', needsReview: true}],
      usedHours: 0,
      remainingHours: 160,
      unresolved: [{...result.records[0]!, hours: null, source: 'insa', duplicate: false, reason: 'unknown-duration'}],
    };
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={unknownResult} error={null} loading={false} progress={null} />
    );

    await userEvent.selectOptions(screen.getByRole('combobox', {name: /최종 판정/}), 'deduct');
    await userEvent.clear(screen.getByRole('spinbutton', {name: /반영시간/}));
    await userEvent.type(screen.getByRole('spinbutton', {name: /반영시간/}), '4');

    expect(screen.getAllByText('4시간').length).toBeGreaterThan(0);
    expect(screen.queryByText('확인되지 않은 사용 내역이 있습니다.')).not.toBeInTheDocument();
  });

  test('clears the unresolved warning when an unknown-duration row is explicitly excluded', async () => {
    const unknownResult: LeaveBalanceResult = {
      ...result,
      records: [{...result.records[0]!, hours: null, source: 'insa', duplicate: false}],
      reviewRows: [{...result.reviewRows[1]!, id: 'insa-unknown-excluded', hours: null, autoDecision: 'exclude', needsReview: true}],
      unresolved: [{...result.records[0]!, hours: null, source: 'insa', duplicate: false, reason: 'unknown-duration'}],
    };
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={unknownResult} error={null} loading={false} progress={null} />
    );

    expect(screen.getByText('확인되지 않은 사용 내역이 있습니다.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', {name: /최종 판정/}), 'exclude');

    expect(screen.queryByText('확인되지 않은 사용 내역이 있습니다.')).not.toBeInTheDocument();
  });

  test('resets manual decisions when a new query starts and when the modal closes', async () => {
    const onLoad = jest.fn().mockResolvedValue(result);
    const onClose = jest.fn();
    const {rerender} = render(
      <LeaveBalanceModal open onClose={onClose} onLoad={onLoad} result={result} error={null} loading={false} progress={null} />
    );
    const finalDecisions = screen.getAllByRole('combobox', {name: /최종 판정/});
    await userEvent.selectOptions(finalDecisions[0]!, 'exclude');
    expect(finalDecisions[0]).toHaveValue('exclude');

    await userEvent.click(screen.getByRole('button', {name: '조회'}));
    expect(await screen.findAllByRole('combobox', {name: /최종 판정/})).toHaveLength(2);
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})[0]).toHaveValue('auto');

    await userEvent.click(screen.getByRole('button', {name: '닫기'}));
    rerender(<LeaveBalanceModal open={false} onClose={onClose} onLoad={onLoad} result={null} error={null} loading={false} progress={null} />);
    rerender(<LeaveBalanceModal open onClose={onClose} onLoad={onLoad} result={result} error={null} loading={false} progress={null} />);
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})[0]).toHaveValue('auto');
  });

  test('clears a loaded balance when the selected year changes', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn().mockResolvedValue(result)} result={result} error={null} loading={false} progress={null} />
    );

    expect(screen.getByText('잔여 시간')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('조회 연도'), '2025');
    expect(screen.queryByText('잔여 시간')).not.toBeInTheDocument();
  });

  test('does not publish a result after a request is cancelled by closing', async () => {
    let resolve!: (value: LeaveBalanceResult) => void;
    const onLoad = jest.fn(() => new Promise<LeaveBalanceResult>((nextResolve) => {
      resolve = nextResolve;
    }));
    const onClose = jest.fn();
    const {rerender} = render(
      <LeaveBalanceModal open onClose={onClose} onLoad={onLoad} result={null} error={null} loading={false} progress={null} />
    );

    await userEvent.click(screen.getByRole('button', {name: '조회'}));
    await userEvent.click(screen.getByRole('button', {name: '닫기'}));
    rerender(<LeaveBalanceModal open={false} onClose={onClose} onLoad={onLoad} result={null} error={null} loading={false} progress={null} />);
    resolve(result);
    await Promise.resolve();
    rerender(<LeaveBalanceModal open onClose={onClose} onLoad={onLoad} result={null} error={null} loading={false} progress={null} />);
    expect(screen.queryByText('잔여 시간')).not.toBeInTheDocument();
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
        result={{
          ...result,
          reviewRows: [{...result.reviewRows[0]!, id: 'unknown', hours: null, autoDecision: 'exclude', needsReview: true}],
          unresolved: [unresolvedRecord],
        }}
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
