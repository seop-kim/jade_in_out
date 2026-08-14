export interface CsvColumn {
  key: string;
  label: string;
}

export type CsvRow = Record<string, string | number | null | undefined>;

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
