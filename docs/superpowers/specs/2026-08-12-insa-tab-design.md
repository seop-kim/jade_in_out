# 신규 인사시스템 탭 설계

## 목표

기존 Jade 출퇴근 기록 화면은 그대로 유지하면서, 상단 탭으로 분리된 `신규 인사시스템` 화면에서 `https://insa.kwe.co.kr`의 월간 HTML 응답을 Cookie 인증으로 가져와 날짜별 휴가 정보를 표시한다.

이번 단계는 별도 백엔드 서버 없이 현재 CRA 개발 프록시와 Vercel 서버리스 프록시를 사용해 연동 가능성을 검증하는 범위로 한정한다.

## 확정 요구사항

- 기존 Jade 인증, API 호출, XML 파서, 출퇴근 표시 로직과 신규 시스템 로직을 합치지 않는다.
- 기존 탭의 화면과 동작은 회귀 없이 유지한다.
- 앱 상단에 `기존 시스템`과 `신규 인사시스템` 탭을 둔다.
- 신규 시스템은 기존 Jade Cookie와 별도의 Cookie 입력 및 저장 공간을 사용한다.
- 신규 요청은 `GET /main.asp?Sel_Year=YYYY&Sel_Month=M&Sel_Day=D` 형태로 전송한다.
- 브라우저에서는 `/api/insa/main.asp`를 호출하고, 프록시가 `https://insa.kwe.co.kr/main.asp`로 전달한다.
- 사용자가 제공한 Cookie만 upstream `Cookie` 헤더로 전달한다. 요청에 제시된 나머지 브라우저 헤더는 복제하지 않는다.
- 신규 응답은 JSON이 아닌 EUC-KR HTML이며, 월간 달력의 날짜 셀에 포함된 일정 아이콘과 건수를 파싱한다.
- 1차 검증에서는 월 1회 요청으로 각 날짜의 `휴가`와 `시간` 건수를 표시한다.
- 선택 날짜 상세의 연차·반차 같은 정확한 명칭과 시간은 현재 응답 구조상 선택 날짜에 대해서만 제공되므로, 날짜별 상세 조회는 후속 범위로 둔다.
- Cookie는 기존 앱과 마찬가지로 브라우저 `localStorage`에 저장하며, 화면이나 로그에 원문을 출력하지 않는다.

## 응답 분석

신규 시스템 응답은 다음 정보를 하나의 HTML 문서에 포함한다.

1. `onclick` 안의 `Sel_Year`, `Sel_Month`, `Sel_Day`로 식별 가능한 월간 달력 날짜 셀
2. 날짜 셀 내부의 `/images/icon_dot_schedule0.gif` 일정 아이콘과 휴가 건수
3. 날짜 셀 내부의 `/images/icon_dot_schedule1.gif` 일정 아이콘과 시간 건수
4. `Sel_Day`로 선택된 날짜의 상세 일정 영역
5. 연간 휴가 현황 및 신청 현황 영역

파서는 화면 문구만 단순 검색하지 않고 날짜 링크와 아이콘 위치를 함께 사용한다. 따라서 기존 HTML의 오래된 테이블 구조와 EUC-KR 응답을 견딜 수 있다.

## 구조

### 화면

- `App.tsx`
  - 시스템 탭 상태만 관리한다.
  - 기존 시스템 선택 시 현재 `Setup` 또는 `CalendarPage`를 그대로 렌더링한다.
  - 신규 시스템 선택 시 신규 페이지를 독립적으로 렌더링한다.
- 신규 페이지 컴포넌트
  - 신규 Cookie 입력 및 초기화
  - 월 이동, 오늘, 새로고침
  - 신규 응답에서 얻은 휴가/시간 건수 달력 표시
- 기존 `CalendarPage`, `CalendarCell`, `transformAttendance.ts`는 신규 응답 타입을 알지 못한다.

### 데이터 흐름

```text
신규 탭 Cookie 입력
        |
        v
localStorage: insa_kwe_cookie_v1
        |
        v
GET /api/insa/main.asp?Sel_Year=...&Sel_Month=...&Sel_Day=1
        |
        v
CRA proxy / Vercel function
        |
        v
https://insa.kwe.co.kr/main.asp + Cookie
        |
        v
EUC-KR HTML 디코딩 -> 날짜 셀 파싱 -> 신규 달력 표시
```

### 프록시

- 개발: `src/setupProxy.js`에 `/api/insa` 전용 middleware를 추가한다.
- 배포: `api/insa/[...path].js`를 새로 만든다.
- 기존 `/api/jade`의 target, 헤더, 로그, body 처리에는 변경을 가하지 않는다.
- 신규 프록시는 `X-Insa-Cookie`만 받아 upstream `Cookie`로 바꾸고, hop-by-hop 헤더와 인증 헤더는 전달하지 않는다.
- upstream 응답의 status, content-type, content-encoding 등 필요한 응답 헤더를 유지해 EUC-KR HTML을 브라우저가 정상적으로 받을 수 있게 한다.

## 파싱 모델

신규 파서는 기존 `AttendanceRecord`와 별개의 타입을 사용한다.

```ts
interface InsaDayRecord {
  ymd: string;
  vacationCount: number;
  timeCount: number;
}

interface InsaMonthData {
  year: number;
  month: number;
  days: Record<string, InsaDayRecord>;
}
```

파싱 규칙:

- 날짜 셀의 `main.asp?Sel_Year=...&Sel_Month=...&Sel_Day=...`에서 날짜를 추출한다.
- 해당 셀의 `icon_dot_schedule0.gif` 행 끝 숫자를 `vacationCount`로 저장한다.
- 해당 셀의 `icon_dot_schedule1.gif` 행 끝 숫자를 `timeCount`로 저장한다.
- 해당 아이콘이나 숫자가 없으면 해당 값은 `0`이다.
- 월간 응답에서 날짜가 하나도 파싱되지 않으면 로그인 만료 또는 HTML 구조 변경 오류로 처리한다.

## 오류 처리

- Cookie가 비어 있으면 신규 요청을 시작하지 않는다.
- HTTP 오류는 상태 코드와 함께 신규 화면에 표시한다.
- HTML 응답에서 날짜 셀을 찾지 못하면 `신규 시스템 응답 형식을 확인할 수 없습니다` 메시지를 표시한다.
- 네트워크 취소는 사용자 오류로 표시하지 않는다.
- Cookie 원문은 console log, 오류 메시지, React 화면에 포함하지 않는다.

## 테스트 전략

- HTML 파서 단위 테스트
  - 대표 응답 조각에서 2026-08-05의 휴가 1건과 시간 1건을 추출한다.
  - 일정이 없는 날짜를 0건으로 반환한다.
  - 날짜 링크가 없거나 HTML이 손상된 경우 명확한 오류를 반환한다.
- 요청 생성 단위 테스트
  - 연도·월·일이 query string에 올바르게 들어간다.
  - Cookie는 `X-Insa-Cookie` 헤더로만 전달된다.
- UI 테스트
  - 기존/신규 탭 전환이 독립적으로 동작한다.
  - 신규 Cookie가 없을 때 입력 화면이 보인다.
  - 신규 데이터가 휴가/시간 배지로 표시된다.
- 검증 명령
  - 신규 파서 테스트
  - 전체 테스트
  - `npm run build`

## 범위 밖

- 기존 Jade와 신규 시스템의 데이터를 한 달력에 합치는 작업
- 신규 시스템의 연차 잔여시간 전체를 별도 대시보드로 만드는 작업
- 날짜별 상세 정보를 얻기 위한 31회 병렬 조회
- 신규 시스템의 Cookie 자동 갱신 또는 로그인 기능

