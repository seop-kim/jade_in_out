import {buildInsaExportRows, buildJadeExportRows, INSA_EXPORT_COLUMNS} from './exportRows';

describe('export row builders', () => {
  test('flattens Jade attendance details into CSV-friendly values', () => {
    expect(buildJadeExportRows({
      '20260805': {
        ymd: '20260805',
        workDay: '(수)',
        workType: '기본근무',
        vacation: null,
        overtime: {duration: '2시간', hours: 2},
        dayOffWork: null,
        remoteWork: null,
        clockIn: '0851',
        clockInChanged: false,
        clockInLocal: false,
        clockOut: '1800',
        clockOutChanged: false,
        clockOutLocal: false,
        workList: [{type: '연장', duration: '2시간', time: '18:00~20:00'}],
        raw: {},
      },
    })).toEqual([expect.objectContaining({
      date: '2026-08-05',
      clockIn: '08:51',
      clockOut: '18:00',
      overtime: '2시간',
      workList: '연장 2시간 (18:00~20:00)',
    })]);
  });

  test('includes INSA holiday and attendance fields for each calendar day', () => {
    expect(buildInsaExportRows({
      '2026-08-17': {
        ymd: '2026-08-17',
        teamSchedule: {
          ymd: '2026-08-17',
          vacationCount: 2,
          timeCount: 0,
          holidayLabel: '대체 공휴일',
        },
        worktime: {
          ymd: '2026-08-17',
          scheduledIn: '',
          scheduledOut: '',
          actualIn: '09:00',
          actualOut: '18:00',
          leaveLabel: '',
          overtimeLabel: '',
          correctionIn: '',
          correctionOut: '',
          correctionStatus: '',
          note: '',
        },
        ownLeave: [],
      },
    })).toEqual([expect.objectContaining({
      weekday: '월',
      holiday: '대체 공휴일',
      actualIn: '09:00',
      actualOut: '18:00',
    })]);
  });

  test('exports only personal leave fields for INSA downloads', () => {
    expect(INSA_EXPORT_COLUMNS.map((column) => column.key)).not.toEqual(
      expect.arrayContaining(['departmentLeave', 'departmentTime']),
    );
    expect(INSA_EXPORT_COLUMNS.map((column) => column.key)).toContain('leave');
  });
});
