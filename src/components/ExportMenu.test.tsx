import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportMenu from './ExportMenu';

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
    expect(document.querySelector('.export-preview-section')).toBeInTheDocument();
    expect(screen.getByText('시작일을 선택하세요')).toBeInTheDocument();
    expect(screen.getByText('종료일을 선택하세요')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', {name: '날짜 포함'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: '이름 포함'})).toBeChecked();

    userEvent.click(screen.getByRole('button', {name: '2026년 8월 5일'}));
    expect(screen.getByText('2026. 08. 05')).toBeInTheDocument();
    expect(screen.getByText('종료일을 선택하세요')).toBeInTheDocument();

    userEvent.click(screen.getByRole('button', {name: '2026년 8월 10일'}));
    expect(screen.getByText('2026. 08. 10')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '날짜'})).toHaveClass('export-preview-column-date');
    expect(screen.getByRole('columnheader', {name: '근무 유형'})).toHaveClass('export-preview-column-work-type');
    expect(screen.getByRole('columnheader', {name: '근무 상세'})).toHaveClass('export-preview-column-work-list');
  });

  test('allows a column to be excluded and moved without persisting it', () => {
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
    userEvent.click(screen.getByRole('button', {name: '이름 위로 이동'}));

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

  test('reloads rows when the selected date range is completed', async () => {
    const onRangeDataRequest = jest.fn().mockResolvedValue([
      {date: '2026-08-05', name: '김태섭', workType: '기본근무', workList: '연장 2시간', status: '정상'},
    ]);

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

    await waitFor(() => expect(onRangeDataRequest).toHaveBeenCalledWith('2026-08-05', '2026-08-10'));
    expect(screen.getByText('실제 조회 결과는 파일 저장 시 반영됩니다')).toBeInTheDocument();
    expect(screen.queryByText('김태섭')).not.toBeInTheDocument();
    expect(screen.getByText('연장 2시간 (18:00~20:00)')).toBeInTheDocument();
  });

  test('allows the calendar year and month to be changed before selecting days', () => {
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
    userEvent.selectOptions(screen.getByRole('combobox', {name: '조회 연도'}), '2025');
    userEvent.selectOptions(screen.getByRole('combobox', {name: '조회 월'}), '11');

    expect(screen.getByRole('button', {name: '2025년 12월 5일'})).toBeInTheDocument();
  });
});
