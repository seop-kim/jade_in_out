import {fireEvent, render, screen} from '@testing-library/react';
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
    jadeAccruedHours: 96,
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
    jadeAccruedHours: 96,
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
    expect(screen.getByText('발생 160시간')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', {name: '수정'})[0]!);
    const accruedHours = screen.getByRole('spinbutton', {name: '발생시간 수정값'});
    expect(accruedHours).toHaveValue(160);
    await userEvent.clear(accruedHours);
    await userEvent.type(accruedHours, '96');
    await userEvent.click(screen.getAllByRole('button', {name: '수정'})[1]!);
    expect(screen.getByText('발생 96시간')).toBeInTheDocument();
    expect(screen.getAllByText('96시간').length).toBeGreaterThan(0);
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

  test('shows only the current year and the two previous years in the year selector', () => {
    render(
      <LeaveBalanceModal
        open
        onClose={jest.fn()}
        onLoad={jest.fn()}
        result={null}
        error={null}
        loading={false}
        progress={null}
      />
    );

    expect(screen.getByLabelText('조회 연도').querySelectorAll('option')).toHaveLength(3);
    expect(screen.getByLabelText('조회 연도')).toHaveDisplayValue('2026년');
    expect(screen.getByRole('option', {name: '2025년'})).toBeInTheDocument();
    expect(screen.getByRole('option', {name: '2024년'})).toBeInTheDocument();
    expect(screen.queryByRole('option', {name: '2023년'})).not.toBeInTheDocument();
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
    expect(screen.getByRole('columnheader', {name: '최종 판정'})).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', {name: '자동 판정'})).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '반영시간'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '발생기간'})).toHaveAttribute('data-tooltip', '이 휴가가 차감되는 발생 연차 기간입니다.');
    expect(screen.getByRole('columnheader', {name: '최종 판정'})).toHaveAttribute(
      'data-tooltip',
      '자동: 자동 판정 결과 적용 / 차감: 연차에서 차감 / 차감 제외: 연차에서 제외 / 중복 제외: 중복 기록에서 제외',
    );
    expect(screen.getByText('신규 사유')).toBeInTheDocument();
    expect(screen.getByText('연차휴가(시간차)')).toHaveAttribute('title', '연차휴가(시간차)');
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})).toHaveLength(2);
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})[0]).toHaveDisplayValue('자동 (차감)');
    expect(screen.getAllByRole('option', {name: /자동 \(/})).toHaveLength(2);
    expect(screen.getAllByRole('option', {name: '차감'})).toHaveLength(2);
    expect(screen.getAllByRole('option', {name: '차감 제외'})).toHaveLength(2);
    expect(screen.getAllByRole('option', {name: '중복 제외'})).toHaveLength(2);
    expect(screen.getByRole('button', {name: '엑셀 다운로드'})).toBeEnabled();
  });

  test('reorders the leave grid columns by dragging a header onto another header', () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    const dateHeader = screen.getByRole('columnheader', {name: '날짜'});
    const typeHeader = screen.getByRole('columnheader', {name: '휴가 유형'});
    expect(screen.getByRole('img', {name: '날짜 열 이동 핸들'})).toBeInTheDocument();
    const dataTransfer = {
      effectAllowed: '',
      setData: jest.fn(),
      getData: jest.fn(() => 'type'),
    };
    fireEvent.dragStart(typeHeader, {dataTransfer});
    fireEvent.dragOver(dateHeader, {clientX: 0});
    expect(dateHeader).toHaveClass('leave-balance-column-drop-before');
    fireEvent.drop(dateHeader, {dataTransfer, clientX: 0});

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.replace('⠿', '').replace('×', ''));
    expect(headers.slice(0, 3)).toEqual(['발생기간', '휴가 유형', '날짜']);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('2026-08-05');
  });

  test('removes a column from the current grid and restores it with column reset', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    fireEvent.click(screen.getByRole('button', {name: '컬럼 삭제 사유'}));
    expect(screen.queryByRole('columnheader', {name: '사유'})).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '컬럼 초기화'}));
    expect(screen.getByRole('columnheader', {name: '사유'})).toBeInTheDocument();
  });

  test('keeps date and hours columns required', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    for (const label of ['날짜', '시간', '관리']) {
      expect(screen.queryByRole('button', {name: `컬럼 삭제 ${label}`})).not.toBeInTheDocument();
    }

    expect(screen.getByRole('columnheader', {name: '날짜'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '시간'})).toBeInTheDocument();
  });

  test('resizes a leave grid column within its minimum and maximum width', () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    const dateHeader = screen.getByRole('columnheader', {name: '날짜'});
    const resizer = screen.getByRole('separator', {name: '날짜 열 너비 조절'});
    expect(dateHeader).toHaveStyle({width: '100px'});

    fireEvent.mouseDown(resizer, {clientX: 100});
    fireEvent.mouseMove(window, {clientX: 180});
    fireEvent.mouseUp(window);
    expect(dateHeader).toHaveStyle({width: '180px'});

    fireEvent.mouseDown(resizer, {clientX: 180});
    fireEvent.mouseMove(window, {clientX: -1000});
    fireEvent.mouseUp(window);
    expect(dateHeader).toHaveStyle({width: '72px'});

    const decisionHeader = screen.getByRole('columnheader', {name: '최종 판정'});
    const decisionResizer = screen.getByRole('separator', {name: '최종 판정 열 너비 조절'});
    fireEvent.mouseDown(decisionResizer, {clientX: 100});
    fireEvent.mouseMove(window, {clientX: -1000});
    fireEvent.mouseUp(window);
    expect(decisionHeader).toHaveStyle({width: '100px'});

    const appliedHoursHeader = screen.getByRole('columnheader', {name: '반영시간'});
    const appliedHoursResizer = screen.getByRole('separator', {name: '반영시간 열 너비 조절'});
    fireEvent.mouseDown(appliedHoursResizer, {clientX: 100});
    fireEvent.mouseMove(window, {clientX: -1000});
    fireEvent.mouseUp(window);
    expect(appliedHoursHeader).toHaveStyle({width: '90px'});
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

  test('allows editing applied hours for a known-duration row', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    const appliedHours = screen.getByRole('spinbutton', {name: '반영시간 2026-08-05 Jade'});
    expect(appliedHours).toHaveValue(4);
    await userEvent.clear(appliedHours);
    await userEvent.type(appliedHours, '2');

    expect(appliedHours).toHaveValue(2);
    expect(screen.getByText('최종 사용').parentElement).toHaveTextContent('2시간');
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

    expect(screen.getByRole('button', {name: '취소선 데이터 일괄 삭제 (2)'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '행 삭제 2026-08-05 Jade'}));
    expect(screen.getAllByRole('combobox', {name: /최종 판정/})).toHaveLength(1);
    expect(screen.queryByRole('button', {name: '행 삭제 2026-08-05 Jade'})).not.toBeInTheDocument();
    expect(screen.getByText('Jade 사용').parentElement).toHaveTextContent('0시간');
  });

  test('asks for confirmation before deleting an active row', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    await userEvent.click(screen.getByRole('button', {name: '행 삭제 2026-08-05 Jade'}));
    expect(screen.getByRole('dialog', {name: '행 삭제 확인'})).toHaveTextContent('취소선이 없는 사용 내역을 삭제할까요?');

    await userEvent.click(screen.getByRole('button', {name: '취소'}));
    expect(screen.getByRole('button', {name: '행 삭제 2026-08-05 Jade'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '행 삭제 2026-08-05 Jade'}));
    await userEvent.click(screen.getByRole('button', {name: '삭제'}));
    expect(screen.queryByRole('button', {name: '행 삭제 2026-08-05 Jade'})).not.toBeInTheDocument();
  });

  test('highlights active rows with the same date and clears it when one is dismissed', async () => {
    const duplicateResult: LeaveBalanceResult = {
      ...result,
      reviewRows: result.reviewRows.map((row) => ({...row, autoDecision: 'deduct' as const})),
    };
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={duplicateResult} error={null} loading={false} progress={null} />
    );

    const finalDecisions = screen.getAllByRole('combobox', {name: /최종 판정/});
    expect(finalDecisions[0]!.closest('tr')).toHaveClass('leave-balance-row-duplicate');
    expect(finalDecisions[1]!.closest('tr')).toHaveClass('leave-balance-row-duplicate');

    await userEvent.selectOptions(finalDecisions[1]!, 'duplicate');
    expect(finalDecisions[0]!.closest('tr')).not.toHaveClass('leave-balance-row-duplicate');
    expect(finalDecisions[1]!.closest('tr')).not.toHaveClass('leave-balance-row-duplicate');
    expect(finalDecisions[1]!.closest('tr')).toHaveClass('leave-balance-row-dismissed');
  });

  test('deletes all dismissed rows at once', async () => {
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={result} error={null} loading={false} progress={null} />
    );

    await userEvent.click(screen.getByRole('button', {name: /취소선 데이터 일괄 삭제/}));
    expect(screen.getByRole('dialog', {name: '취소선 데이터 삭제 확인'})).toHaveTextContent('취소선 데이터 1건을 삭제할까요?');
    await userEvent.click(screen.getByRole('button', {name: '삭제'}));

    expect(screen.queryAllByRole('combobox', {name: /최종 판정/})).toHaveLength(1);
    expect(screen.getByRole('button', {name: /취소선 데이터 일괄 삭제/})).toBeInTheDocument();
  });

  test('shows an empty-state popup when no dismissed rows exist', async () => {
    const cleanResult = {
      ...result,
      reviewRows: result.reviewRows.map((row) => ({...row, autoDecision: 'deduct' as const})),
    };
    render(
      <LeaveBalanceModal open onClose={jest.fn()} onLoad={jest.fn()} result={cleanResult} error={null} loading={false} progress={null} />
    );

    await userEvent.click(screen.getByRole('button', {name: /취소선 데이터 일괄 삭제/}));
    expect(screen.getByRole('dialog', {name: '취소선 데이터 삭제 확인'})).toHaveTextContent('삭제할 취소선 데이터가 없습니다.');
    await userEvent.click(screen.getByRole('button', {name: '확인'}));
    expect(screen.queryByRole('dialog', {name: '취소선 데이터 삭제 확인'})).not.toBeInTheDocument();
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
