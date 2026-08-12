import {
  parseInsaDayDetails,
  parseInsaHomeHtml,
  parseInsaLeaveHtml,
  parseInsaWorktimeHtml,
} from './insaParsers';

const worktimeFixture = `
  <table class="tbltop"><tbody>
    <tr><td>번호</td><td>구분</td><td>요일</td><td>일자</td><td>휴가</td><td>OT</td><td>예정출근</td><td>예정퇴근</td><td>실제출근</td><td>실제퇴근</td></tr>
    <tr>
      <td>1</td><td>근무</td><td>금</td><td>2026-08-07</td><td>(후4)</td><td></td>
      <td>09:00</td><td>14:00</td><td></td><td></td>
      <td>09:05</td><td>14:02</td><td>승인</td><td>정정 없음</td>
    </tr>
  </tbody></table>`;

const leaveFixture = `
  <table class="tbltop"><tbody>
    <tr><td>연도</td><td>기간</td><td>구분</td><td>발생</td><td>사용</td><td>잔여</td></tr>
    <tr>
      <td>2026</td><td>2026-01-01 ~ 2026-12-31</td><td>연차</td>
      <td>발생 <b>186</b> 시간</td><td>사용 <b>60</b> 시간</td><td>잔여 <b>126</b> 시간</td>
    </tr>
  </tbody></table>
  <table class="tbltop"><tbody>
    <tr><td>번호</td><td>사용일</td><td>시간</td><td>휴가유형</td><td>사유</td><td>첨부</td><td>신청일</td><td>승인상태</td></tr>
    <tr>
      <td>1</td><td>2026-08-07</td><td>(후4)</td><td>연차휴가</td><td>개인 사유</td><td></td><td>2026-08-01</td><td>승인</td>
    </tr>
  </tbody></table>`;

describe('INSA HTML parsers', () => {
  test('parses monthly team counts by schedule icon and ignores adjacent-month cells', () => {
    const html = `
      <table><tbody><tr>
        <td onclick="location.replace('main.asp?Sel_Year=2026&Sel_Month=7&Sel_Day=31')"></td>
        <td onclick="location.replace('main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=5')">
          <table><tbody>
            <tr><td><img src="/images/icon_dot_schedule0.gif"></td><td>휴가:<font>1</font></td></tr>
            <tr><td><img src="/images/icon_dot_schedule1.gif"></td><td>시간:<font>2</font></td></tr>
          </tbody></table>
        </td>
        <td onclick="location.replace('main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=6')"></td>
      </tr></tbody></table>`;

    expect(parseInsaHomeHtml(html, 2026, 8).days).toEqual({
      '2026-08-05': {ymd: '2026-08-05', vacationCount: 1, timeCount: 2},
      '2026-08-06': {ymd: '2026-08-06', vacationCount: 0, timeCount: 0},
    });
  });

  test('parses selected-day team details from direct cells', () => {
    const html = `
      <table class="tbltop"><tbody>
        <tr><th>팀원</th><th>일정</th><th>시간</th></tr>
        <tr><td>팀원 1</td><td>휴가</td><td>(오전)</td></tr>
      </tbody></table>`;

    expect(parseInsaDayDetails(html, '2026-08-05')).toEqual([
      {ymd: '2026-08-05', name: '팀원 1', scheduleLabel: '휴가', durationLabel: '(오전)'},
    ]);
  });

  test('parses a 14-column worktime row without counting nested cells', () => {
    const html = worktimeFixture.replace(
      '<td>정정 없음</td>',
      '<td><table><tbody><tr><td>내부 셀</td></tr></tbody></table>정정 없음</td>'
    );

    expect(parseInsaWorktimeHtml(html)).toEqual([
      {
        ymd: '2026-08-07',
        scheduledIn: '09:00',
        scheduledOut: '14:00',
        actualIn: '',
        actualOut: '',
        leaveLabel: '(후4)',
        overtimeLabel: '',
        correctionIn: '09:05',
        correctionOut: '14:02',
        correctionStatus: '승인',
        note: '내부 셀정정 없음',
      },
    ]);
  });

  test('parses leave balances and usage rows using their direct cell counts', () => {
    expect(parseInsaLeaveHtml(leaveFixture)).toEqual({
      balances: [
        {
          year: 2026,
          period: '2026-01-01 ~ 2026-12-31',
          accruedHours: 186,
          usedHours: 60,
          remainingHours: 126,
        },
      ],
      records: [
        {
          ymd: '2026-08-07',
          durationLabel: '(후4)',
          type: '연차휴가',
          reason: '개인 사유',
          appliedAt: '2026-08-01',
          approvalStatus: '승인',
        },
      ],
    });
  });

  test('returns empty collections for present but empty result tables', () => {
    const emptyTables = '<table class="tbltop"><tbody><tr><th>요약</th></tr></tbody></table><table class="tbltop"><tbody><tr><th>이력</th></tr></tbody></table>';

    expect(parseInsaDayDetails('<table class="tbltop"></table>', '2026-08-05')).toEqual([]);
    expect(parseInsaWorktimeHtml('<table class="tbltop"></table>')).toEqual([]);
    expect(parseInsaLeaveHtml(emptyTables)).toEqual({balances: [], records: []});
  });

  test('throws page-specific errors when required response structure is absent', () => {
    expect(() => parseInsaHomeHtml('<html><body>로그인</body></html>', 2026, 8)).toThrow(
      'INSA home response format is invalid'
    );
    expect(() => parseInsaDayDetails('<html><body>로그인</body></html>', '2026-08-05')).toThrow(
      'INSA day details response format is invalid'
    );
    expect(() => parseInsaWorktimeHtml('<html><body>로그인</body></html>')).toThrow(
      'INSA worktime response format is invalid'
    );
    expect(() => parseInsaLeaveHtml('<table class="tbltop"></table>')).toThrow(
      'INSA leave response format is invalid'
    );
  });
});
