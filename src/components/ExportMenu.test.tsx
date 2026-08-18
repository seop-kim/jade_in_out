import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportMenu from './ExportMenu';
import {CsvRow} from '../lib/csvExport';

const columns = [
  {key: 'date', label: '날짜'},
  {key: 'name', label: '이름'},
  {key: 'workType', label: '근무 유형'},
  {key: 'workList', label: '근무 상세'},
  {key: 'status', label: '상태'},
];

const rows = [
  {date: '2026-08-05', name: '김태섭', workType: '기본근무', workList: '연장 2시간', status: '정상'},
];

describe('ExportMenu', () => {
  test('opens a popup with one shared date range calendar', () => {
    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
      />
    );

    userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));

    expect(screen.getByRole('dialog', {name: 'CSV 다운로드 설정'})).toBeInTheDocument();
    expect(document.querySelector('.export-settings-grid')).toBeInTheDocument();
    expect(document.querySelector('.export-columns-panel')).toBeInTheDocument();
    expect(document.querySelector('.export-date-picker-section')).toHaveClass('export-date-picker-panel');
    expect(document.querySelector('.export-preview-section')).toBeInTheDocument();
    expect(document.querySelector('.export-date-selection-status')).not.toBeInTheDocument();
    expect(document.querySelector('.export-date-instruction')).not.toBeInTheDocument();
    expect(document.querySelector('.export-calendar')).toBeInTheDocument();
    expect(screen.queryByText('1 시작일')).not.toBeInTheDocument();
    expect(screen.queryByText('2 종료일')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('시작일');
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('종료일');
    expect(screen.getByRole('checkbox', {name: '날짜 포함'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: '이름 포함'})).toBeChecked();

    userEvent.click(screen.getByRole('button', {name: '2026년 8월 5일'}));
    expect(screen.getByRole('button', {name: '2026년 8월 5일'})).toHaveClass('is-start');
    expect(document.querySelector('.export-date-selection-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('2026. 08. 05');
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('종료일');

    userEvent.click(screen.getByRole('button', {name: '2026년 8월 10일'}));
    expect(screen.getByRole('button', {name: '2026년 8월 10일'})).toHaveClass('is-end');
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('2026. 08. 05');
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('2026. 08. 10');
    expect(screen.getByRole('columnheader', {name: '날짜'})).toHaveClass('export-preview-column-date');
    expect(screen.getByRole('columnheader', {name: '근무 유형'})).toHaveClass('export-preview-column-work-type');
    expect(screen.getByRole('columnheader', {name: '근무 상세'})).toHaveClass('export-preview-column-work-list');
  });

  test('locks page scrolling while the file save popup is open', () => {
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'scroll';

    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
      />
    );

    fireEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', {name: 'CSV 다운로드 설정 닫기'}));
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('scroll');

    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousRootOverflow;
  });

  test('shows one clear control when a date is selected and clears the whole range', async () => {
    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
      />
    );

    await userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
    await userEvent.click(screen.getByRole('button', {name: '2026년 8월 5일'}));
    expect(screen.getByRole('button', {name: '선택한 기간 초기화'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '2026년 8월 10일'}));
    expect(screen.getByRole('button', {name: '선택한 기간 초기화'})).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: '선택한 기간 초기화'}));
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('시작일');
    expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('종료일');
    expect(screen.queryByRole('button', {name: '선택한 기간 초기화'})).not.toBeInTheDocument();
  });

  test('keeps the file save popup open when the backdrop is clicked', async () => {
    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
      />
    );

    await userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
    const backdrop = document.querySelector<HTMLElement>('.export-modal-backdrop');
    if (!backdrop) throw new Error('Export modal backdrop is missing');

    fireEvent.mouseDown(backdrop);

    expect(screen.getByRole('dialog', {name: 'CSV 다운로드 설정'})).toBeInTheDocument();
  });

  test('keeps the file save action disabled when export is unavailable', () => {
    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
        disabled
        hideTrigger
        open
      />
    );

    fireEvent.click(screen.getByRole('button', {name: '2026년 8월 5일'}));
    fireEvent.click(screen.getByRole('button', {name: '2026년 8월 10일'}));

    expect(screen.getByRole('button', {name: '파일 저장'})).toBeDisabled();
  });

  test('allows a column to be excluded and reordered with drag and drop', () => {
    const {unmount} = render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
      />
    );

    userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
    userEvent.click(screen.getByRole('checkbox', {name: '상태 포함'}));
    const nameHandle = screen.getByRole('button', {name: '이름 순서 변경'});
    const dateRow = screen.getByTestId('export-column-row-date');
    fireEvent.dragStart(nameHandle);
    fireEvent.dragOver(dateRow);
    fireEvent.drop(dateRow);

    expect(screen.getByRole('checkbox', {name: '상태 포함'})).not.toBeChecked();
    const labels = screen.getAllByTestId('export-column-label').map((element) => element.textContent);
    expect(labels).toEqual(['이름', '날짜', '근무 유형', '근무 상세', '상태']);

    unmount();
    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2026-08-01"
        maxDate="2026-08-31"
        fileName="test.csv"
      />
    );
    userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));

    expect(screen.getByRole('checkbox', {name: '상태 포함'})).toBeChecked();
    expect(screen.getAllByTestId('export-column-label').map((element) => element.textContent))
      .toEqual(['날짜', '이름', '근무 유형', '근무 상세', '상태']);
  });

  test('requests the selected date range only after file save is clicked', async () => {
    const onRangeDataRequest = jest.fn(
      (_startDate: string, _endDate: string, _signal?: AbortSignal) => new Promise<CsvRow[]>(() => undefined),
    );

    render(
      <ExportMenu
        rows={[]}
        columns={columns}
        minDate="2020-01-01"
        maxDate="2030-12-31"
        initialDate="2026-08-01"
        fileName="test.csv"
        onRangeDataRequest={onRangeDataRequest}
      />
    );

    userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
    userEvent.click(screen.getByRole('button', {name: '2026년 8월 5일'}));
    userEvent.click(screen.getByRole('button', {name: '2026년 8월 10일'}));

    expect(onRangeDataRequest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: '파일 저장'}));
    await waitFor(() => expect(onRangeDataRequest).toHaveBeenCalledWith(
      '2026-08-05',
      '2026-08-10',
      expect.any(AbortSignal),
    ));
    expect(screen.getByRole('dialog', {name: '다운로드 진행 상황'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '다운로드 취소'})).toBeInTheDocument();
    const firstCall = onRangeDataRequest.mock.calls[0];
    if (!firstCall) throw new Error('Export request was not recorded');
    const requestSignal = firstCall[2] as unknown as AbortSignal;
    await userEvent.click(screen.getByRole('button', {name: '다운로드 취소'}));
    expect(requestSignal.aborted).toBe(true);
    expect(screen.queryByRole('dialog', {name: '다운로드 진행 상황'})).not.toBeInTheDocument();
    expect(screen.getByText('실제 조회 결과는 파일 저장 시 반영됩니다')).toBeInTheDocument();
    expect(screen.queryByText('김태섭')).not.toBeInTheDocument();
  });

  test('clears the selected date range after a successful file save', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });

    try {
      const onRangeDataRequest = jest.fn(async () => rows);

      render(
        <ExportMenu
          rows={[]}
          columns={columns}
          minDate="2020-01-01"
          maxDate="2030-12-31"
          initialDate="2026-08-01"
          fileName="test.csv"
          onRangeDataRequest={onRangeDataRequest}
        />
      );

      await userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
      await userEvent.click(screen.getByRole('button', {name: '2026년 8월 5일'}));
      await userEvent.click(screen.getByRole('button', {name: '2026년 8월 10일'}));
      await userEvent.click(screen.getByRole('button', {name: '파일 저장'}));

      await waitFor(() => expect(screen.getByText('다운로드가 완료되었습니다.')).toBeInTheDocument());
      expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('시작일');
      expect(screen.getByTestId('export-date-range-display')).toHaveTextContent('종료일');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  test('uses the attendance calendar month picker before selecting days', async () => {
    render(
      <ExportMenu
        rows={rows}
        columns={columns}
        minDate="2020-01-01"
        maxDate="2030-12-31"
        initialDate="2026-08-01"
        fileName="test.csv"
      />
    );

    userEvent.click(screen.getByRole('button', {name: 'CSV 다운로드'}));
    const calendar = screen.getByLabelText('다운로드 기간 선택');
    const monthButton = within(calendar).getByRole('button', {name: '2026년 08월'});
    expect(monthButton).toHaveClass('month-title', 'month-title-btn');

    await userEvent.click(monthButton);
    const monthPicker = within(calendar).getByRole('dialog');
    expect(within(monthPicker).getByText('2026년')).toBeInTheDocument();
    await userEvent.click(within(monthPicker).getByRole('button', {name: '12월'}));

    expect(within(calendar).getByRole('button', {name: '2026년 12월 5일'})).toBeInTheDocument();
    expect(screen.queryByRole('combobox', {name: '조회 연도'})).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', {name: '조회 월'})).not.toBeInTheDocument();
  });
});
