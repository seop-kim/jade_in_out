import {buildCsv, filterRowsByDateRange} from './csvExport';

describe('CSV export', () => {
  test('uses the selected column order and escapes CSV values', () => {
    const csv = buildCsv(
      [
        {key: 'name', label: '이름'},
        {key: 'note', label: '메모'},
      ],
      [
        {name: '김태섭', note: '연차, 오전'},
        {name: '홍길동', note: '줄바꿈\n메모'},
      ],
    );

    expect(csv).toBe('\uFEFF이름,메모\r\n김태섭,"연차, 오전"\r\n홍길동,"줄바꿈\n메모"');
  });

  test('filters rows inclusively by the selected date range', () => {
    const rows = [
      {date: '2026-08-01', value: 'before'},
      {date: '2026-08-05', value: 'inside'},
      {date: '2026-08-10', value: 'inside-end'},
      {date: '2026-08-11', value: 'after'},
    ];

    expect(filterRowsByDateRange(rows, 'date', '2026-08-05', '2026-08-10')).toEqual([
      rows[1],
      rows[2],
    ]);
  });
});
