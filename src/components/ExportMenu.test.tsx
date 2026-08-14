import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportMenu from './ExportMenu';

const columns = [
  {key: 'date', label: '날짜'},
  {key: 'name', label: '이름'},
  {key: 'status', label: '상태'},
];

const rows = [
  {date: '2026-08-05', name: '김태섭', status: '정상'},
];

describe('ExportMenu', () => {
  test('opens an unsaved column and date configuration panel', () => {
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
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-08-01');
    expect(screen.getByLabelText('종료일')).toHaveValue('2026-08-31');
    expect(screen.getByRole('checkbox', {name: '날짜 포함'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: '이름 포함'})).toBeChecked();
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
    expect(labels).toEqual(['이름', '날짜', '상태']);

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
      .toEqual(['날짜', '이름', '상태']);
  });
});
