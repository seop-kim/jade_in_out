function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredNumberEnv(name: string): number {
  const value = Number(requiredEnv(name));
  if (!Number.isInteger(value) || value < 1) throw new Error(`Environment variable must be a positive integer: ${name}`);
  return value;
}

export const appConfig = {
  jade: {
    origin: requiredEnv('REACT_APP_JADE_ORIGIN'),
    apiBasePath: requiredEnv('REACT_APP_JADE_API_BASE_PATH'),
    requestPath: requiredEnv('REACT_APP_JADE_REQUEST_PATH'),
    fields: {
      requestDate: requiredEnv('REACT_APP_JADE_REQUEST_DATE_FIELD'),
      datasetClass: requiredEnv('REACT_APP_JADE_DATASET_CLASS_FIELD'),
      datasetMethod: requiredEnv('REACT_APP_JADE_DATASET_METHOD_FIELD'),
      formDate: requiredEnv('REACT_APP_JADE_FORM_DATE_FIELD'),
      employeeId: requiredEnv('REACT_APP_JADE_EMPLOYEE_ID_FIELD'),
      employeeName: requiredEnv('REACT_APP_JADE_EMPLOYEE_NAME_FIELD'),
      attendanceDate: requiredEnv('REACT_APP_JADE_ATTENDANCE_DATE_FIELD'),
      attendanceEmployeeId: requiredEnv('REACT_APP_JADE_ATTENDANCE_EMPLOYEE_ID_FIELD'),
      workType: requiredEnv('REACT_APP_JADE_WORK_TYPE_FIELD'),
      clockIn: requiredEnv('REACT_APP_JADE_CLOCK_IN_FIELD'),
      clockOut: requiredEnv('REACT_APP_JADE_CLOCK_OUT_FIELD'),
      correctedClockIn: requiredEnv('REACT_APP_JADE_CORRECTED_CLOCK_IN_FIELD'),
      correctedClockOut: requiredEnv('REACT_APP_JADE_CORRECTED_CLOCK_OUT_FIELD'),
      workDay: requiredEnv('REACT_APP_JADE_WORK_DAY_FIELD'),
      workDetail: requiredEnv('REACT_APP_JADE_WORK_DETAIL_FIELD'),
    },
  },
  insa: {
    origin: requiredEnv('REACT_APP_INSA_ORIGIN'),
    apiBasePath: requiredEnv('REACT_APP_INSA_API_BASE_PATH'),
    paths: {
      home: requiredEnv('REACT_APP_INSA_HOME_PATH'),
      worktime: requiredEnv('REACT_APP_INSA_WORKTIME_PATH'),
      leave: requiredEnv('REACT_APP_INSA_LEAVE_PATH'),
    },
    query: {
      year: requiredEnv('REACT_APP_INSA_QUERY_YEAR'),
      month: requiredEnv('REACT_APP_INSA_QUERY_MONTH'),
      day: requiredEnv('REACT_APP_INSA_QUERY_DAY'),
    },
    worktimeForm: {
      typeField: requiredEnv('REACT_APP_INSA_WORKTIME_TYPE_FIELD'),
      typeValue: requiredEnv('REACT_APP_INSA_WORKTIME_TYPE_VALUE'),
      startField: requiredEnv('REACT_APP_INSA_WORKTIME_START_FIELD'),
      endField: requiredEnv('REACT_APP_INSA_WORKTIME_END_FIELD'),
    },
    parser: {
      tableSelector: requiredEnv('REACT_APP_INSA_TABLE_SELECTOR'),
      dateCellSelectorPrefix: requiredEnv('REACT_APP_INSA_DATE_CELL_SELECTOR_PREFIX'),
      vacationIcon: requiredEnv('REACT_APP_INSA_VACATION_ICON'),
      timeIcon: requiredEnv('REACT_APP_INSA_TIME_ICON'),
      detailBottomIcon: requiredEnv('REACT_APP_INSA_DETAIL_BOTTOM_ICON'),
      detailScrollSelector: requiredEnv('REACT_APP_INSA_DETAIL_SCROLL_SELECTOR'),
      durationSelector: requiredEnv('REACT_APP_INSA_DURATION_SELECTOR'),
      detailColumnCount: requiredNumberEnv('REACT_APP_INSA_DETAIL_COLUMN_COUNT'),
      worktimeColumnCount: requiredNumberEnv('REACT_APP_INSA_WORKTIME_COLUMN_COUNT'),
      balanceColumnCount: requiredNumberEnv('REACT_APP_INSA_BALANCE_COLUMN_COUNT'),
      leaveRecordColumnCount: requiredNumberEnv('REACT_APP_INSA_LEAVE_RECORD_COLUMN_COUNT'),
    },
  },
} as const;
