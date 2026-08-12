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

function buildCompleteHomeFixture(): string {
  const calendarDays = Array.from({length: 31}, (_, index) => {
    const day = index + 1;
    const schedules = day === 5 ? `
      <table><tbody>
        <tr><td><img src="/images/icon_dot_schedule0.gif" alt="vacation"></td><td>Vacation <b>1</b></td></tr>
        <tr><td><img src="/images/icon_dot_schedule1.gif" alt="time"></td><td>Time <b>1</b></td></tr>
      </tbody></table>` : '';
    return `<td onclick="location.replace('main.asp?Sel_Year=2026&Sel_Month=8&Sel_Day=${day}')">${schedules}</td>`;
  }).join('');

  return `
    <table><tbody><tr>${calendarDays}</tr></tbody></table>
    <table><tbody>
      <tr><td>
        <div class="scroll"><table><tbody>
          <tr>
            <td></td><td><img src="/images/icon_dot_schedule0.gif" alt="vacation"></td>
            <td>Synthetic Person Alpha <span>Synthetic annual leave <font class="cGR font_11">4 hours</font></span></td><td></td>
          </tr>
          <tr>
            <td></td><td><img src="/images/icon_dot_schedule1.gif" alt="time"></td>
            <td>Synthetic Person Beta <span>Synthetic late arrival <font class="cGR font_11">2 hours</font></span></td><td></td>
          </tr>
        </tbody></table></div>
      </td></tr>
      <tr><td><img src="/images/main_schedule_detail_bottom.gif" alt="detail end"></td></tr>
    </tbody></table>`;
}

function buildCompleteWorktimeFixture(): string {
  const dates = [
    '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01',
    '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
    '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11',
  ];
  const rows = dates.map((ymd, index) => {
    const number = index + 1;
    return `<tr>
      <td>${number}</td><td>SYN-${String(number).padStart(3, '0')}</td><td>Workday</td><td>${ymd}</td>
      <td>${number === 10 ? 'Synthetic leave 4h' : ''}</td><td>${number === 10 ? 'Synthetic OT 1h' : ''}</td>
      <td>09:00</td><td>18:00</td><td>08:55</td><td>18:10</td>
      <td></td><td></td><td>${number === 10 ? 'Approved' : ''}</td><td>Synthetic note ${number}</td>
    </tr>`;
  }).join('');
  return `<table class="tbltop"><tbody>${rows}</tbody></table>`;
}

function buildCompleteLeaveFixture(): string {
  const balanceRows = `
    <tr><td>2025</td><td>2025-01-01 ~ 2025-12-31</td><td>Annual</td><td><b>80</b></td><td><b>40</b></td><td><b>40</b></td></tr>
    <tr><td>2026</td><td>2026-01-01 ~ 2026-12-31</td><td>Annual</td><td><b>160</b></td><td><b>48</b></td><td><b>112</b></td></tr>`;
  const recordRows = Array.from({length: 10}, (_, index) => {
    const number = index + 1;
    return `<tr>
      <td>${number}</td><td>2026-08-${String(number).padStart(2, '0')}</td><td>${number === 4 ? '4 hours' : '1 day'}</td>
      <td>Synthetic leave type ${number}</td><td>Synthetic reason ${number}</td><td>None</td>
      <td>2026-07-${String(20 + number).padStart(2, '0')}</td><td>${number === 4 ? 'Approved' : 'Complete'}</td>
    </tr>`;
  }).join('');

  return `
    <table class="tbltop"><tbody>${balanceRows}</tbody></table>
    <table class="tbltop"><tbody>${recordRows}</tbody></table>`;
}

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

  test('rejects a structural calendar when no date belongs to the requested month', () => {
    const html = `
      <table><tbody><tr>
        <td onclick="location.replace('main.asp?Sel_Year=2026&Sel_Month=7&Sel_Day=31')"></td>
      </tr></tbody></table>`;

    expect(() => parseInsaHomeHtml(html, 2026, 8)).toThrow(
      'INSA home response format is invalid'
    );
  });

  test('parses complete synthetic response structures with reproducible record counts', () => {
    const homeHtml = buildCompleteHomeFixture();
    const home = parseInsaHomeHtml(homeHtml, 2026, 8);
    const details = parseInsaDayDetails(homeHtml, '2026-08-05');
    const worktime = parseInsaWorktimeHtml(buildCompleteWorktimeFixture());
    const leave = parseInsaLeaveHtml(buildCompleteLeaveFixture());

    expect(Object.keys(home.days)).toHaveLength(31);
    expect(home.days['2026-08-05']).toEqual({
      ymd: '2026-08-05',
      vacationCount: 1,
      timeCount: 1,
    });
    expect(details).toHaveLength(2);
    expect(details[1]).toEqual({
      ymd: '2026-08-05',
      name: 'Synthetic Person Beta',
      scheduleLabel: 'Synthetic late arrival',
      durationLabel: '2 hours',
    });
    expect(worktime).toHaveLength(15);
    expect(worktime[9]).toEqual({
      ymd: '2026-08-06',
      scheduledIn: '09:00',
      scheduledOut: '18:00',
      actualIn: '08:55',
      actualOut: '18:10',
      leaveLabel: 'Synthetic leave 4h',
      overtimeLabel: 'Synthetic OT 1h',
      correctionIn: '',
      correctionOut: '',
      correctionStatus: 'Approved',
      note: 'Synthetic note 10',
    });
    expect(leave.balances).toHaveLength(2);
    expect(leave.balances[1]).toEqual({
      year: 2026,
      period: '2026-01-01 ~ 2026-12-31',
      accruedHours: 160,
      usedHours: 48,
      remainingHours: 112,
    });
    expect(leave.records).toHaveLength(10);
    expect(leave.records[3]).toEqual({
      ymd: '2026-08-04',
      durationLabel: '4 hours',
      type: 'Synthetic leave type 4',
      reason: 'Synthetic reason 4',
      appliedAt: '2026-07-24',
      approvalStatus: 'Approved',
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

  test('parses the real four-column schedule detail structure without duplicating duration', () => {
    const html = `
      <table><tbody>
        <tr><td>
          <div class="scroll"><table><tbody>
            <tr>
              <td></td>
              <td><img src="/images/icon_dot_schedule0.gif" alt="vacation"></td>
              <td>
                Employee Alpha
                <span>Annual leave <font class="cGR font_11">(4 hours)</font></span>
              </td>
              <td></td>
            </tr>
            <tr>
              <td></td>
              <td><img src="/images/icon_dot_schedule1.gif" alt="time"></td>
              <td>Employee Beta <span>Late arrival <font class="cGR font_11">(2 hours)</font></span></td>
              <td></td>
            </tr>
          </tbody></table></div>
        </td></tr>
        <tr><td><img src="/images/main_schedule_detail_bottom.gif" alt="detail end"></td></tr>
      </tbody></table>`;

    expect(parseInsaDayDetails(html, '2026-08-05')).toEqual([
      {
        ymd: '2026-08-05',
        name: 'Employee Alpha',
        scheduleLabel: 'Annual leave',
        durationLabel: '(4 hours)',
      },
      {
        ymd: '2026-08-05',
        name: 'Employee Beta',
        scheduleLabel: 'Late arrival',
        durationLabel: '(2 hours)',
      },
    ]);
  });

  test('returns no details for a structurally valid empty schedule detail section', () => {
    const html = `
      <table><tbody>
        <tr><td><div class="scroll"><table><tbody></tbody></table></div></td></tr>
        <tr><td><img src="/images/main_schedule_detail_bottom.gif" alt="detail end"></td></tr>
      </tbody></table>`;

    expect(parseInsaDayDetails(html, '2026-08-05')).toEqual([]);
  });

  test('rejects a marked schedule detail section without its inner table', () => {
    const html = `
      <table><tbody>
        <tr><td><div class="scroll"></div></td></tr>
        <tr><td><img src="/images/main_schedule_detail_bottom.gif" alt="detail end"></td></tr>
      </tbody></table>`;

    expect(() => parseInsaDayDetails(html, '2026-08-05')).toThrow(
      'INSA day details response format is invalid'
    );
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
