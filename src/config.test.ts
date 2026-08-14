import {appConfig} from './config';

describe('application integration configuration', () => {
  test('loads public integration values from environment variables', () => {
    expect(appConfig.jade.origin).toBe(process.env.REACT_APP_JADE_ORIGIN);
    expect(appConfig.jade.requestPath).toBe(process.env.REACT_APP_JADE_REQUEST_PATH);
    expect(appConfig.jade.fields.requestDate).toBe(process.env.REACT_APP_JADE_REQUEST_DATE_FIELD);
    expect(appConfig.jade.fields.attendanceDate).toBe(process.env.REACT_APP_JADE_ATTENDANCE_DATE_FIELD);
    expect(appConfig.jade.fields.clockIn).toBe(process.env.REACT_APP_JADE_CLOCK_IN_FIELD);
    expect(appConfig.insa.origin).toBe(process.env.REACT_APP_INSA_ORIGIN);
    expect(appConfig.insa.paths.worktime).toBe(process.env.REACT_APP_INSA_WORKTIME_PATH);
  });
});
