import {fetchAttendanceForDate, fetchLeaveUsageForYear} from './jadeApi';

describe('Jade API', () => {
  test('uses a browser transport when Jade credentials stay in the logged-in tab', async () => {
    const controller = new AbortController();
    const post = jest.fn().mockResolvedValue(`
      <ROOT>
        <ETC KEY="I_IN_HM">08:50</ETC>
        <ETC KEY="I_OUT_HM">18:10</ETC>
        <ETC KEY="WORK_DAY">Y</ETC>
        <ETC KEY="WORK_TYPE_NM">정상근무</ETC>
      </ROOT>
    `);

    await fetchAttendanceForDate({
      cookie: '',
      parsedBody: {S_STD_YMD: '20260801', S_EMP_ID: '20250304'},
      ymd: '2026-08-12',
      signal: controller.signal,
      transport: {post},
    });

    expect(post).toHaveBeenCalledWith(
      '/commonAction.do',
      'S_STD_YMD=2026-08-12&S_EMP_ID=20250304',
      controller.signal,
    );
  });

  test('retries a temporary failure for the same date', async () => {
    const post = jest.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(`
        <ROOT>
          <ETC KEY="I_IN_HM">08:50</ETC>
          <ETC KEY="I_OUT_HM">18:10</ETC>
        </ROOT>
      `);

    await fetchAttendanceForDate({
      cookie: '',
      parsedBody: {},
      ymd: '2026-08-12',
      retryCount: 1,
      retryDelayMs: 0,
      transport: {post},
    });

    expect(post).toHaveBeenCalledTimes(2);
  });

  test('identifies an expired Jade session from the response', async () => {
    const post = jest.fn().mockResolvedValue(`
      <SHEET>
        <MESSAGE><![CDATA[LOGIN_CHECK_FAIL:LOGOUT]]></MESSAGE>
      </SHEET>
    `);

    await expect(fetchAttendanceForDate({
      cookie: 'expired-cookie',
      parsedBody: {},
      ymd: '2026-08-12',
      transport: {post},
    })).rejects.toMatchObject({name: 'JadeAuthenticationError'});
  });

  test('loads a year month-by-month and reports bounded day progress', async () => {
    const dates: string[] = [];
    const progress: Array<{completed: number; total: number}> = [];
    const transport = {
      post: jest.fn((_path: string, body: string) => {
        dates.push(new URLSearchParams(body).get('S_STD_YMD') ?? '');
        return Promise.resolve('<ROOT><ETC KEY="I_IN_HM">08:50</ETC></ROOT>');
      }),
    };

    const records = await fetchLeaveUsageForYear({
      cookie: '',
      parsedBody: {},
      year: 2026,
      retryCount: 0,
      transport,
      onProgress: (value) => progress.push(value),
    });

    expect(records).toHaveLength(365);
    expect(dates.filter((date) => date.endsWith('01'))).toEqual([
      '20260101', '20260201', '20260301', '20260401', '20260501', '20260601',
      '20260701', '20260801', '20260901', '20261001', '20261101', '20261201',
    ]);
    expect(progress[progress.length - 1]).toEqual({completed: 365, total: 365});
  });

  test('treats empty pre-employment dates as unused days during annual loading', async () => {
    const transport = {
      post: jest.fn((_path: string, body: string) => {
        const ymd = new URLSearchParams(body).get('S_STD_YMD') ?? '';
        return ymd < '20250304'
          ? Promise.resolve('')
          : Promise.resolve('<ROOT><ETC KEY="I_IN_HM">08:50</ETC></ROOT>');
      }),
    };

    const records = await fetchLeaveUsageForYear({
      cookie: '',
      parsedBody: {},
      year: 2025,
      retryCount: 0,
      transport,
    });

    expect(records).toHaveLength(365);
    expect(records.find((record) => record.ymd === '20250101')).toEqual(expect.objectContaining({
      ymd: '20250101',
      clockIn: '',
      workList: [],
    }));
    expect(records.find((record) => record.ymd === '20250304')).toEqual(expect.objectContaining({
      ymd: '20250304',
      clockIn: '08:50',
    }));
  });

  test('stops the annual loader immediately when Jade authentication expires', async () => {
    const post = jest.fn().mockResolvedValue(`
      <SHEET>
        <MESSAGE><![CDATA[LOGIN_CHECK_FAIL:LOGOUT]]></MESSAGE>
      </SHEET>
    `);

    await expect(fetchLeaveUsageForYear({
      cookie: 'expired-cookie',
      parsedBody: {},
      year: 2026,
      transport: {post},
    })).rejects.toMatchObject({name: 'JadeAuthenticationError'});
    expect(post).toHaveBeenCalledTimes(4);
    expect(post.mock.calls.every((call) => call[1].includes('202601'))).toBe(true);
  });
});
