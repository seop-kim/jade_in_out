import * as XLSX from 'xlsx-js-style';

export interface CsvColumn {
  key: string;
  label: string;
}

export type CsvRow = Record<string, string | number | null | undefined>;
export type ExportColumnWidths = Record<string, number>;

function valueToString(value: CsvRow[string]): string {
  return value === null || value === undefined ? '' : String(value);
}

function escapeCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsv(columns: CsvColumn[], rows: CsvRow[]): string {
  const lines = [
    columns.map((column) => escapeCsv(column.label)).join(','),
    ...rows.map((row) =>
      columns.map((column) => escapeCsv(valueToString(row[column.key]))).join(','),
    ),
  ];

  return `\uFEFF${lines.join('\r\n')}`;
}

function excelColumnWidth(widthInPixels: number | undefined): number {
  return Math.max(8, Math.round((widthInPixels ?? 140) / 7));
}

export function buildExportFileName(systemName: string, startDate: string, endDate: string): string {
  const baseName = systemName.trim().replace(/\.(?:xlsx|xls|csv)$/i, '');
  const safeSystemName = (baseName || '근태').replace(/[\\/:*?"<>|]/g, '-');
  return `${safeSystemName}_${startDate}~${endDate}.xlsx`;
}

export function buildExcelFile(
  columns: CsvColumn[],
  rows: CsvRow[],
  columnWidths: ExportColumnWidths = {},
): ArrayBuffer {
  const values = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => valueToString(row[column.key]))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(values);
  worksheet['!cols'] = columns.map((column) => ({
    wch: excelColumnWidth(columnWidths[column.key]),
  }));
  const headerStyle = {
    font: {bold: true, color: {rgb: 'FFFFFF'}},
    fill: {patternType: 'solid', fgColor: {rgb: '1F4E78'}},
    alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
  };
  columns.forEach((_column, index) => {
    const headerCell = worksheet[XLSX.utils.encode_cell({r: 0, c: index})];
    if (headerCell) headerCell.s = headerStyle;
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '근태');
  return XLSX.write(workbook, {bookType: 'xlsx', type: 'array', cellStyles: true}) as ArrayBuffer;
}

export function filterRowsByDateRange<T extends CsvRow>(
  rows: T[],
  dateKey: string,
  startDate: string,
  endDate: string,
): T[] {
  return rows.filter((row) => {
    const date = valueToString(row[dateKey]);
    return date >= startDate && date <= endDate;
  });
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadExcel(
  filename: string,
  columns: CsvColumn[],
  rows: CsvRow[],
  columnWidths: ExportColumnWidths = {},
): void {
  const blob = new Blob([buildExcelFile(columns, rows, columnWidths)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
