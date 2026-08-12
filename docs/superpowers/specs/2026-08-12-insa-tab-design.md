# 신규 인사시스템 탭 설계

## 목표

기존 Jade 출퇴근 기록 화면은 그대로 유지하면서, 상단 탭으로 분리된 `신규 인사시스템` 화면에서 `https://insa.kwe.co.kr`의 HTML 응답을 Cookie 인증으로 가져온다. 신규 화면은 개인 출퇴근 기록, 내 휴가 사용내역과 잔여시간, 다른 직원의 날짜별 휴가·시간 일정 정보를 하나의 신규 달력에 표시한다.

이번 단계는 별도 백엔드 서버 없이 현재 CRA 개발 프록시와 Vercel 서버리스 프록시를 사용해 연동 가능성을 검증하는 범위로 한정한다.

## 확정 요구사항

- 기존 Jade 인증, API 호출, XML 파서, 출퇴근 표시 로직과 신규 시스템 로직을 합치지 않는다.
- 기존 탭의 화면과 동작은 회귀 없이 유지한다.
- 앱 상단에 `기존 시스템`과 `신규 인사시스템` 탭을 둔다.
- 신규 시스템은 기존 Jade Cookie와 별도의 Cookie 입력 및 저장 공간을 사용한다.
- 홈 일정은 `GET /main.asp?Sel_Year=YYYY&Sel_Month=M&Sel_Day=D`로 조회한다.
- 개인 출퇴근은 `POST /worktime/01_list.asp`에 `sType=0&sdt=YYYY-MM-DD&edt=YYYY-MM-DD` form body로 조회한다.
- 내 휴가는 `GET /leave/01_list.asp`로 조회한다.
- 브라우저에서는 위 경로에 `/api/insa`를 붙여 호출하고, 프록시가 같은 경로를 `https://insa.kwe.co.kr`로 전달한다.
- 사용자가 제공한 Cookie만 upstream `Cookie` 헤더로 전달한다. 요청에 제시된 나머지 브라우저 헤더는 복제하지 않는다.
- 신규 응답은 모두 JSON이 아닌 EUC-KR HTML이다. 브라우저에서 raw bytes를 받은 뒤 `TextDecoder('euc-kr')`로 디코딩한다.
- 월 변경 시 홈 월간 일정, 해당 월의 개인 출퇴근, 내 휴가 목록을 병렬 조회한다.
- 홈 월간 응답에서는 각 날짜의 `휴가`와 `시간` 건수를 파싱한다.
- 다른 직원의 이름과 일정 유형은 선택 날짜 응답에만 있으므로 날짜 클릭 시 해당 날짜의 홈 상세를 추가 조회한다. 모든 날짜를 미리 조회하지 않는다.
- 개인 출퇴근 조회는 서버 제한에 맞춰 한 번에 최대 한 달로 요청한다. 현재 월은 어제까지만, 지난 월은 월 시작일부터 말일까지 조회하며 미래 월에는 요청하지 않는다.
- 내 휴가 목록의 날짜, 사용량, 휴가 유형, 사유, 신청일, 승인 진행상태를 파싱하고 선택 월 데이터만 달력에 결합한다.
- 휴가 발생·사용·잔여시간 요약은 신규 화면 상단에 표시한다.
- Cookie는 기존 앱과 마찬가지로 브라우저 `localStorage`에 저장하며, 화면이나 로그에 원문을 출력하지 않는다.

## 응답 분석

### 홈 `/main.asp`

홈 응답은 다음 정보를 하나의 HTML 문서에 포함한다.

1. `onclick` 안의 `Sel_Year`, `Sel_Month`, `Sel_Day`로 식별 가능한 월간 달력 날짜 셀
2. 날짜 셀 내부의 `/images/icon_dot_schedule0.gif` 일정 아이콘과 휴가 건수
3. 날짜 셀 내부의 `/images/icon_dot_schedule1.gif` 일정 아이콘과 시간 건수
4. `Sel_Day`로 선택된 날짜의 상세 일정 영역
5. 연간 휴가 현황 및 신청 현황 영역

파서는 화면 문구만 단순 검색하지 않고 날짜 링크와 아이콘 위치를 함께 사용한다. `icon_dot_schedule0.gif`는 휴가 건수, `icon_dot_schedule1.gif`는 시간 일정 건수로 해석한다.

### 출퇴근 `/worktime/01_list.asp`

출퇴근 응답의 결과 행은 14개의 직접 자식 셀을 가진다.

1. 순번
2. 사번
3. 이름
4. 근무일
5. 휴가 시간
6. 실제 OT
7. 예정 출근
8. 예정 퇴근
9. 실제 출근
10. 실제 퇴근
11. 정정 신청 출근
12. 정정 신청 퇴근
13. 정정 상태
14. 비고

첨부 응답의 조회 범위는 2026-07-28부터 2026-08-11까지이며, 각 날짜의 예정·실제 출퇴근과 휴가 시간을 날짜 키로 변환할 수 있다. body는 JSON이 아니라 정확히 `sType=0&sdt=2026-07-28&edt=2026-08-11` 형태의 form-urlencoded 문자열이다.

### 내 휴가 `/leave/01_list.asp`

내 휴가 응답은 두 영역으로 나뉜다.

- 연도별 요약: 귀속연도, 사용기간, 발생시간, 사용시간, 잔여시간
- 휴가 이력: 사용일, 일수 또는 시간, 휴가 유형, 사유, 첨부 여부, 신청일, 승인 진행상태

첨부 응답에는 2026년 발생 186시간, 사용 60시간, 잔여 126시간과 10건의 휴가 이력이 있다. 휴가 이력은 출퇴근 응답의 휴가 시간보다 상세하므로 같은 날짜에 둘 다 존재하면 휴가 유형과 표시는 내 휴가 이력을 우선하고 출퇴근 휴가 시간은 보조값으로 사용한다.

## 구조

### 화면

- `App.tsx`
  - 시스템 탭 상태만 관리한다.
  - 기존 시스템 선택 시 현재 `Setup` 또는 `CalendarPage`를 그대로 렌더링한다.
  - 신규 시스템 선택 시 신규 페이지를 독립적으로 렌더링한다.
- 신규 페이지 컴포넌트
  - 신규 Cookie 입력 및 초기화
  - 월 이동, 오늘, 새로고침
  - 휴가 발생·사용·잔여시간 요약
  - 개인 출퇴근·내 휴가·다른 직원 일정 건수를 결합한 신규 달력
  - 날짜 클릭 시 다른 직원 일정 상세 패널
- 기존 `CalendarPage`, `CalendarCell`, `transformAttendance.ts`는 신규 응답 타입을 알지 못한다.

### 데이터 흐름

```text
신규 탭 Cookie 입력
        |
        v
localStorage: insa_kwe_cookie_v1
        |
        v
월 변경 시 병렬 조회
  GET  /api/insa/main.asp?Sel_Year=...&Sel_Month=...&Sel_Day=1
  POST /api/insa/worktime/01_list.asp
  GET  /api/insa/leave/01_list.asp
        |
        v
CRA proxy / Vercel function
        |
        v
https://insa.kwe.co.kr/main.asp + Cookie
        |
        v
EUC-KR HTML 디코딩
  -> 홈 일정 파서
  -> 출퇴근 파서
  -> 내 휴가 파서
  -> 날짜 키로 신규 화면 안에서만 결합
        |
        v
날짜 클릭 시 선택일 홈 상세 추가 조회
```

### 프록시

- 개발: `src/setupProxy.js`에 `/api/insa` 전용 middleware를 추가한다.
- 배포: `api/insa/[...path].js`를 새로 만든다.
- 기존 `/api/jade`의 target, 헤더, 로그, body 처리에는 변경을 가하지 않는다.
- 신규 프록시는 GET과 form-urlencoded POST를 지원한다.
- 신규 프록시는 `X-Insa-Cookie`만 받아 upstream `Cookie`로 바꾸고, hop-by-hop 헤더와 브라우저가 보낸 원본 Cookie는 전달하지 않는다.
- upstream 응답의 status, content-type, content-encoding 등 필요한 응답 헤더를 유지해 EUC-KR HTML을 브라우저가 정상적으로 받을 수 있게 한다.

## 파싱 모델

신규 파서는 기존 `AttendanceRecord`와 별개의 타입을 사용한다.

```ts
interface InsaHomeDaySummary {
  ymd: string;
  vacationCount: number;
  timeCount: number;
}

interface InsaWorktimeRecord {
  ymd: string;
  scheduledIn: string;
  scheduledOut: string;
  actualIn: string;
  actualOut: string;
  leaveLabel: string;
  overtimeLabel: string;
}

interface InsaLeaveRecord {
  ymd: string;
  durationLabel: string;
  type: string;
  reason: string;
  appliedAt: string;
  approvalStatus: string;
}

interface InsaLeaveBalance {
  year: number;
  period: string;
  accruedHours: number;
  usedHours: number;
  remainingHours: number;
}

interface InsaCalendarDay {
  ymd: string;
  worktime: InsaWorktimeRecord | null;
  ownLeave: InsaLeaveRecord[];
  teamSchedule: InsaHomeDaySummary | null;
}
```

홈 파싱 규칙:

- 날짜 셀의 `main.asp?Sel_Year=...&Sel_Month=...&Sel_Day=...`에서 날짜를 추출한다.
- 해당 셀의 `icon_dot_schedule0.gif` 행 끝 숫자를 `vacationCount`로 저장한다.
- 해당 셀의 `icon_dot_schedule1.gif` 행 끝 숫자를 `timeCount`로 저장한다.
- 해당 아이콘이나 숫자가 없으면 해당 값은 `0`이다.
- 월간 응답에서 날짜가 하나도 파싱되지 않으면 로그인 만료 또는 HTML 구조 변경 오류로 처리한다.

출퇴근 파싱 규칙:

- 직접 자식 `td`가 14개인 결과 행만 처리한다.
- 네 번째 셀의 `YYYY-MM-DD`를 날짜 키로 사용한다.
- 예정·실제 출퇴근, 휴가, OT, 정정 정보의 원문을 보존한다.
- 미래 날짜에는 실제 출퇴근 누락 경고를 만들지 않는다.

내 휴가 파싱 규칙:

- 연도별 요약 테이블과 휴가 이력 테이블을 각각 식별한다.
- 요약 시간은 굵은 숫자를 기준으로 시간 단위 숫자로 저장한다.
- 이력은 사용일을 날짜 키로 사용하며 한 날짜에 복수 휴가가 있어도 배열로 보존한다.
- 휴가 종류와 시간 표시는 응답의 디코딩된 원문을 사용한다.

결합 규칙:

- 세 파서의 결과는 `YYYY-MM-DD` 키로 신규 화면 안에서만 결합한다.
- 내 휴가 이력이 있으면 해당 유형과 사용량을 표시한다.
- 내 휴가 이력이 없고 출퇴근 행에 휴가 시간이 있으면 출퇴근 휴가 값을 표시한다.
- 실제 출퇴근이 있으면 실제 값을 표시하고 예정 시간은 상세 정보로 유지한다.
- 홈 일정은 개인 기록과 구분되는 `팀 휴가 N`, `팀 시간 N` 배지로 표시한다.

## 오류 처리

- Cookie가 비어 있으면 신규 요청을 시작하지 않는다.
- HTTP 오류는 데이터 소스 이름과 상태 코드를 신규 화면에 표시한다.
- 세 요청 중 하나가 실패해도 성공한 데이터는 달력에 표시한다.
- HTML 응답에서 해당 페이지의 핵심 테이블이나 날짜 셀을 찾지 못하면 로그인 만료 또는 응답 구조 변경으로 처리한다.
- 네트워크 취소는 사용자 오류로 표시하지 않는다.
- Cookie 원문은 console log, 오류 메시지, React 화면에 포함하지 않는다.

## 테스트 전략

- HTML 파서 단위 테스트
  - 대표 응답 조각에서 2026-08-05의 휴가 1건과 시간 1건을 추출한다.
  - 일정이 없는 날짜를 0건으로 반환한다.
  - 출퇴근 14열 행에서 날짜, 예정·실제 출퇴근, 휴가와 OT를 추출한다.
  - 휴가 페이지에서 연도별 잔여시간과 휴가 이력을 추출한다.
  - 날짜 링크나 핵심 테이블이 없으면 명확한 오류를 반환한다.
- 요청 생성 단위 테스트
  - 연도·월·일이 query string에 올바르게 들어간다.
  - 출퇴근 요청이 form-urlencoded body와 최대 한 달 범위를 사용한다.
  - 현재 월의 종료일이 어제로 제한되고 미래 월에는 출퇴근 요청을 생략한다.
  - Cookie는 `X-Insa-Cookie` 헤더로만 전달된다.
- UI 테스트
  - 기존/신규 탭 전환이 독립적으로 동작한다.
  - 신규 Cookie가 없을 때 입력 화면이 보인다.
  - 개인 출퇴근, 내 휴가, 팀 일정 건수가 서로 구분된 배지로 표시된다.
  - 날짜 클릭 시 팀 일정 상세를 지연 조회한다.
  - 한 데이터 소스가 실패해도 나머지 데이터가 표시된다.
- 검증 명령
  - 신규 파서 테스트
  - 전체 테스트
  - `npm run build`

## 범위 밖

- 기존 Jade와 신규 시스템의 데이터를 한 달력에 합치는 작업
- 날짜별 팀 상세 정보를 얻기 위한 31회 선조회
- 신규 시스템의 Cookie 자동 갱신 또는 로그인 기능
- 신규 시스템의 휴가 신청, 출퇴근 정정, 취소 등 쓰기 작업
