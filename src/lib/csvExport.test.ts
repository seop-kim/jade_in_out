import * as XLSX from 'xlsx';
import {buildCsv, buildExcelFile, buildExportFileName, filterRowsByDateRange} from './csvExport';

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

  test('preserves preview column widths in the Excel file', () => {
    const file = buildExcelFile(
      [
        {key: 'date', label: '날짜'},
        {key: 'workList', label: '근무 상세'},
      ],
      [{date: '2026-08-05', workList: '연장 2시간'}],
      {date: 140, workList: 360},
    );
    const workbook = XLSX.read(file, {type: 'array', cellStyles: true});
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    if (!sheet) throw new Error('Excel worksheet is missing');

    expect(sheet['!cols']).toMatchObject([
      {wch: 20},
      {wch: 51},
    ]);
    expect(XLSX.utils.sheet_to_json(sheet, {header: 1})).toEqual([
      ['날짜', '근무 상세'],
      ['2026-08-05', '연장 2시간'],
    ]);
  });

  test('builds a system and date range based Excel file name', () => {
    expect(buildExportFileName('Jade', '2026-08-05', '2026-08-10'))
      .toBe('Jade_2026-08-05~2026-08-10.xlsx');
    expect(buildExportFileName('신규인사시스템.xlsx', '2026-08-05', '2026-08-10'))
      .toBe('신규인사시스템_2026-08-05~2026-08-10.xlsx');
  });
});
