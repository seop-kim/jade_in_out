import {fetchAttendanceForDate} from './jadeApi';

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
});
