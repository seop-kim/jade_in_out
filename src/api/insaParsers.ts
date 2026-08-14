import {appConfig} from '../config';

export interface InsaHomeDaySummary {
  ymd: string;
  vacationCount: number;
  timeCount: number;
  holidayLabel?: string;
}

export interface InsaHomeMonthData {
  year: number;
  month: number;
  days: Record<string, InsaHomeDaySummary>;
}

export interface InsaTeamDetail {
  ymd: string;
  name: string;
  scheduleLabel: string;
  durationLabel: string;
}

export interface InsaWorktimeRecord {
  ymd: string;
  scheduledIn: string;
  scheduledOut: string;
  actualIn: string;
  actualOut: string;
  leaveLabel: string;
  overtimeLabel: string;
  correctionIn: string;
  correctionOut: string;
  correctionStatus: string;
  note: string;
}

export interface InsaLeaveRecord {
  ymd: string;
  durationLabel: string;
  type: string;
  reason: string;
  appliedAt: string;
  approvalStatus: string;
}

export interface InsaLeaveBalance {
  year: number;
  period: string;
  accruedHours: number;
  usedHours: number;
  remainingHours: number;
}

export interface InsaLeavePageData {
  balances: InsaLeaveBalance[];
  records: InsaLeaveRecord[];
}

const HOME_FORMAT_ERROR = 'INSA home response format is invalid';
const DAY_DETAILS_FORMAT_ERROR = 'INSA day details response format is invalid';
const WORKTIME_FORMAT_ERROR = 'INSA worktime response format is invalid';
const LEAVE_FORMAT_ERROR = 'INSA leave response format is invalid';

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function cleanText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function directText(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function directCells(row: Element): HTMLTableCellElement[] {
  return Array.from(row.children).filter(
    (child): child is HTMLTableCellElement => child.tagName === 'TD'
  );
}

function parseYmd(text: string): string | null {
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function parseNumber(text: string): number | null {
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseLastNumber(text: string): number {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches?.length ? Number(matches[matches.length - 1]) : 0;
}

function parseQueryNumber(onclick: string, parameter: string): number | null {
  const match = onclick.match(new RegExp(`[?&]${parameter}=(\\d+)`));
  return match?.[1] ? Number(match[1]) : null;
}

function numberFromSummaryCell(cell: HTMLTableCellElement): number {
  const emphasizedNumber = cell.querySelector('b, strong');
  return parseNumber(emphasizedNumber ? cleanText(emphasizedNumber) : cleanText(cell)) ?? 0;
}

function normalizeHolidayLabel(text: string): string {
  const compact = text.replace(/\s+/g, '').trim();
  if (compact === '대체공휴일') return '대체 공휴일';
  return text.replace(/\s+/g, ' ').trim();
}

function holidayLabelFromCell(cell: HTMLTableCellElement): string {
  const holidayElement = Array.from(cell.querySelectorAll('font')).find((element) => {
    const color = element.getAttribute('color')?.replace(/\s+/g, '').toUpperCase();
    return color === '#FF9900' && Boolean(cleanText(element));
  });
  return holidayElement ? normalizeHolidayLabel(cleanText(holidayElement)) : '';
}

export function parseInsaHomeHtml(
  html: string,
  expectedYear: number,
  expectedMonth: number
): InsaHomeMonthData {
  const doc = parseDocument(html);
  const dateCells = Array.from(doc.querySelectorAll<HTMLTableCellElement>(`${appConfig.insa.parser.dateCellSelectorPrefix}`));
  if (dateCells.length === 0) throw new Error(HOME_FORMAT_ERROR);
  const days: Record<string, InsaHomeDaySummary> = {};

  for (const cell of dateCells) {
    const onclick = cell.getAttribute('onclick') ?? '';
    const year = parseQueryNumber(onclick, appConfig.insa.query.year);
    const month = parseQueryNumber(onclick, appConfig.insa.query.month);
    const day = parseQueryNumber(onclick, appConfig.insa.query.day);
    if (year !== expectedYear || month !== expectedMonth || !day) continue;

    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const countForIcon = (iconFileName: string): number => {
      const icon = cell.querySelector(`img[src*="${iconFileName}"]`);
      return icon?.closest('tr') ? parseLastNumber(cleanText(icon.closest('tr')!)) : 0;
    };
    const holidayLabel = holidayLabelFromCell(cell);
    days[ymd] = {
      ymd,
      vacationCount: countForIcon(appConfig.insa.parser.vacationIcon),
      timeCount: countForIcon(appConfig.insa.parser.timeIcon),
      ...(holidayLabel ? {holidayLabel} : {}),
    };
  }

  if (Object.keys(days).length === 0) throw new Error(HOME_FORMAT_ERROR);
  return {year: expectedYear, month: expectedMonth, days};
}

export function parseInsaDayDetails(html: string, expectedYmd: string): InsaTeamDetail[] {
  const doc = parseDocument(html);
  const detailEnd = doc.querySelector(`img[src*="${appConfig.insa.parser.detailBottomIcon}"]`);

  if (detailEnd) {
    let sectionTable = detailEnd.closest('table');
    let detailTable: HTMLTableElement | null = null;
    while (sectionTable && !detailTable) {
      detailTable = sectionTable.querySelector<HTMLTableElement>(appConfig.insa.parser.detailScrollSelector);
      sectionTable = sectionTable.parentElement?.closest('table') ?? null;
    }
    if (!detailTable) throw new Error(DAY_DETAILS_FORMAT_ERROR);

    return Array.from(detailTable.querySelectorAll('tr')).flatMap((row) => {
      const cells = directCells(row);
      if (cells.length !== appConfig.insa.parser.detailColumnCount) return [];
      const iconCell = cells[1];
      const detailCell = cells[2];
      const icon = iconCell?.querySelector(
        `img[src*="${appConfig.insa.parser.vacationIcon}"], img[src*="${appConfig.insa.parser.timeIcon}"]`
      );
      if (!icon) return [];
      if (!detailCell) throw new Error(DAY_DETAILS_FORMAT_ERROR);

      const scheduleElement = Array.from(detailCell.children).find(
        (child) => child.tagName === 'SPAN'
      );
      const durationElement = scheduleElement?.querySelector(appConfig.insa.parser.durationSelector);
      const name = directText(detailCell);
      if (!scheduleElement || !durationElement || !name) {
        throw new Error(DAY_DETAILS_FORMAT_ERROR);
      }

      const scheduleWithoutDuration = scheduleElement.cloneNode(true) as Element;
      scheduleWithoutDuration.querySelectorAll(appConfig.insa.parser.durationSelector).forEach((element) => element.remove());
      const scheduleLabel = cleanText(scheduleWithoutDuration);
      const durationLabel = cleanText(durationElement);
      if (!scheduleLabel) throw new Error(DAY_DETAILS_FORMAT_ERROR);

      return [{ymd: expectedYmd, name, scheduleLabel, durationLabel}];
    });
  }

  const table = doc.querySelector(appConfig.insa.parser.tableSelector);
  if (!table) throw new Error(DAY_DETAILS_FORMAT_ERROR);

  return Array.from(table.querySelectorAll('tr')).flatMap((row) => {
    const cells = directCells(row);
    if (cells.length !== 3) return [];
    const [nameCell, scheduleCell, durationCell] = cells;
    if (!nameCell || !scheduleCell || !durationCell) return [];
    return [{
      ymd: expectedYmd,
      name: cleanText(nameCell),
      scheduleLabel: cleanText(scheduleCell),
      durationLabel: cleanText(durationCell),
    }];
  });
}

export function parseInsaWorktimeHtml(html: string): InsaWorktimeRecord[] {
  const doc = parseDocument(html);
  const table = doc.querySelector(appConfig.insa.parser.tableSelector);
  if (!table) throw new Error(WORKTIME_FORMAT_ERROR);

  return Array.from(table.querySelectorAll('tr')).flatMap((row) => {
    const cells = directCells(row);
    if (cells.length !== appConfig.insa.parser.worktimeColumnCount) return [];
    const ymd = parseYmd(cleanText(cells[3]!));
    if (!ymd) return [];
    return [{
      ymd,
      leaveLabel: cleanText(cells[4]!),
      overtimeLabel: cleanText(cells[5]!),
      scheduledIn: cleanText(cells[6]!),
      scheduledOut: cleanText(cells[7]!),
      actualIn: cleanText(cells[8]!),
      actualOut: cleanText(cells[9]!),
      correctionIn: cleanText(cells[10]!),
      correctionOut: cleanText(cells[11]!),
      correctionStatus: cleanText(cells[12]!),
      note: cleanText(cells[13]!),
    }];
  });
}

export function parseInsaLeaveHtml(html: string): InsaLeavePageData {
  const doc = parseDocument(html);
  const tables = Array.from(doc.querySelectorAll(appConfig.insa.parser.tableSelector));
  if (tables.length < 2) throw new Error(LEAVE_FORMAT_ERROR);

  const balances: InsaLeaveBalance[] = [];
  const records: InsaLeaveRecord[] = [];

  for (const table of tables) {
    for (const row of Array.from(table.querySelectorAll('tr'))) {
      const cells = directCells(row);
      if (cells.length === appConfig.insa.parser.balanceColumnCount) {
        const year = parseNumber(cleanText(cells[0]!));
        if (year === null) continue;
        balances.push({
          year,
          period: cleanText(cells[1]!),
          accruedHours: numberFromSummaryCell(cells[3]!),
          usedHours: numberFromSummaryCell(cells[4]!),
          remainingHours: numberFromSummaryCell(cells[5]!),
        });
      }
      if (cells.length === appConfig.insa.parser.leaveRecordColumnCount) {
        const ymd = parseYmd(cleanText(cells[1]!));
        if (!ymd) continue;
        records.push({
          ymd,
          durationLabel: cleanText(cells[2]!),
          type: cleanText(cells[3]!),
          reason: cleanText(cells[4]!),
          appliedAt: cleanText(cells[6]!),
          approvalStatus: cleanText(cells[7]!),
        });
      }
    }
  }

  return {balances, records};
}
