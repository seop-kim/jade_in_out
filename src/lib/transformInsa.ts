import {
  InsaHomeDaySummary,
  InsaHomeMonthData,
  InsaLeaveRecord,
  InsaWorktimeRecord,
} from '../api/insaParsers';

export interface InsaCalendarDay {
  ymd: string;
  teamSchedule?: InsaHomeDaySummary;
  worktime?: InsaWorktimeRecord;
  ownLeave: InsaLeaveRecord[];
}

export type InsaCalendarMap = Record<string, InsaCalendarDay>;

function createMonthDays(year: number, month: number): InsaCalendarMap {
  const dayCount = new Date(year, month + 1, 0).getDate();
  const map: InsaCalendarMap = {};

  for (let day = 1; day <= dayCount; day += 1) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    map[ymd] = {ymd, ownLeave: []};
  }

  return map;
}

export function buildInsaCalendarMap(
  year: number,
  month: number,
  home: InsaHomeMonthData | null,
  worktime: InsaWorktimeRecord[],
  leaveRecords: InsaLeaveRecord[]
): InsaCalendarMap {
  const map = createMonthDays(year, month);

  for (const record of worktime) {
    const day = map[record.ymd];
    if (day) day.worktime = record;
  }

  for (const record of leaveRecords) {
    const day = map[record.ymd];
    if (day) day.ownLeave.push(record);
  }

  for (const summary of Object.values(home?.days ?? {})) {
    const day = map[summary.ymd];
    if (day) day.teamSchedule = summary;
  }

  return map;
}
