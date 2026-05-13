# Jade 출퇴근 기록 (jade_in_out)

Jade HR 시스템(`ehr.jadehr.co.kr`)의 일별 출퇴근 데이터를 한 달치 캘린더로 모아 보여주는 개인용 웹 앱입니다. Jade의 공식 UI 대신, 사용자가 추출한 인증 정보로 직접 API를 호출해 깔끔한 달력 뷰로 변환합니다.

- React 19 + Create React App (CRA) 기반
- 사내 시스템 호출은 개발용 CRA 프록시(`src/setupProxy.js`)와 배포용 Vercel 함수(`api/jade/[...path].js`)에서 처리
- 인증 정보(Cookie / Request Body)는 브라우저 `localStorage`에만 저장됨 (서버 저장 없음)

---

## 주요 기능

### 달력 뷰
- 일/월/연도 7×N 그리드, 오늘은 강조 표시
- 셀 안에 날짜 + 상태 배지(휴일/휴가/휴일근무) + 출근/퇴근/야근 시간을 한눈에 노출
- 일요일/토요일 색상 구분, 이전·다음 달 셀은 흐리게 처리

### 월 이동 / 월 선택 picker
- `‹`, `›` 화살표로 한 달씩 이동 (조회 중에는 비활성)
- 월 타이틀(`YYYY년 MM월`) 클릭 시 popover가 떠서 **연도 ← →** + 12개월 그리드에서 원하는 달을 즉시 선택 가능
- 바깥 클릭 / `Esc` 키로 닫힘
- "오늘" 버튼으로 현재 달로 복귀, "새로고침"으로 같은 달 재조회

### 진행 상황 표시
- 한 달치 조회는 일별 API 호출이라 진행률이 보이도록 progress bar 표시 (`N / 31 일 조회 중`)
- 조회 중 월 이동/picker 모두 비활성 → 불필요한 동시 호출 방지

### 셀 표시 규칙 (자세히는 아래 [표시 규칙](#표시-규칙) 참고)
- **휴일**: `[28] [휴일]`
- **전일 휴가(8시간 이상)**: `[28] [연차휴가]`
- **부분 휴가**: `[28] [연차휴가 4시간]` + 출근/퇴근
- **휴무일 근무(주말 근무)**: `[28] [휴일근무]` + 출근/퇴근
- **야근(연장 근무)**: 퇴근 행 아래 `[야근] 5시간` 추가
- **퇴근 시간이 안 찍혀있고 보조 필드(`C_OUT_HM`)에 값 있음**: `[퇴근 변경] 18:00` (단, 오늘 이후 날짜는 폴백 적용 안 함)

---

## 디렉터리 구조

```
jade_in_out/
├── api/
│   └── jade/
│       └── [...path].js        # Vercel 서버리스 함수 — 운영 환경에서 Jade 백엔드로 프록시
├── public/                     # CRA 정적 자원
├── src/
│   ├── api/
│   │   └── jadeApi.js          # Jade XML 응답 파싱 + 한 달치 동시 조회 로직
│   ├── components/
│   │   ├── Calendar.js / .css  # 캘린더 그리드 + 셀 렌더링
│   │   └── Setup.js / .css     # 최초 진입 시 인증 정보 입력 폼
│   ├── App.js                  # 라우팅(인증 화면 vs 캘린더), 월 picker, 데이터 변환
│   ├── App.css                 # 툴바, 월 picker, 진행률 등 공용 스타일
│   ├── setupProxy.js           # 개발 서버용 CRA 프록시
│   └── index.js / index.css
├── package.json
└── README.md
```

---

## 빠른 시작

### 1. 의존성 설치 & 개발 서버

```bash
npm install
npm start
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 열기.

개발 서버는 `src/setupProxy.js`에 의해 `/api/jade/*` 요청을 `https://ehr.jadehr.co.kr/*`로 자동 프록시합니다 (CORS / 쿠키 우회).

### 2. 운영 빌드

```bash
npm run build
```

`build/` 폴더에 정적 빌드 산출물이 생성됩니다. Vercel에 배포하면 `api/jade/[...path].js`가 같은 역할의 프록시를 합니다.

### 3. 기타 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm test` | CRA 기본 테스트 러너 (인터랙티브 watch 모드) |
| `npm run eject` | CRA 설정 분리 — 권장하지 않음 |

---

## 인증 정보 추출 가이드 (Setup 화면)

이 앱은 자체 로그인 기능이 없습니다. 대신 사용자가 직접 Jade에 로그인한 후 브라우저의 활성 세션 정보(Cookie + Request Body)를 복사해 입력하면, 그 정보를 그대로 사용해 API를 호출합니다.

1. [Jade EHR](https://ehr.jadehr.co.kr)에 로그인하고 **출퇴근 메뉴**(`ess_tam_402_m01`)를 엽니다.
2. <kbd>F12</kbd> → **Network** 탭을 열고 `commonAction.do` 요청을 찾습니다.
3. **Headers** 탭의 `Cookie` 값을 전체 복사 → 앱의 **Cookie** 입력칸에 붙여 넣습니다.
4. **Payload** 탭의 Request Body를 전체 복사 → 앱의 **Request Body** 입력칸에 붙여 넣습니다.
   - `S_STD_YMD` 필드가 반드시 포함되어 있어야 합니다 (앱이 날짜만 갈아끼우며 호출).
5. "저장하고 달력 보기" 클릭 → `localStorage`에 저장되어 새로고침에도 유지됩니다.
6. 다른 계정/세션으로 바꾸려면 우상단 "인증 정보 재설정"을 누르면 됩니다.

Body 형식은 `KEY:VALUE` 줄 단위 또는 `key=value&...` URL-encoded 둘 다 인식합니다 (`src/components/Setup.js`의 `parseBody`).

---

## 데이터 흐름

```
┌─────────────┐  POST /api/jade/commonAction.do          ┌──────────────┐
│  Browser    │  body: S_STD_YMD=20260513&...            │  Proxy       │
│  (React)    │  headers: X-Jade-Cookie: <세션>          │  (CRA dev /  │
│             │ ───────────────────────────────────────► │   Vercel fn) │
│             │                                          │              │
│             │  XML (ETC KEY="...") ◄──────────────────│ jadehr.co.kr │
└─────────────┘                                          └──────────────┘
       │
       │ src/api/jadeApi.js
       │  - parseAttendanceXml: <ETC KEY="X">value</ETC> → { X: value }
       │  - vacationFromDetail / overtimeFromDetail / dayOffWorkFromDetail:
       │      WORK_DETAIL HTML 안의 <dl class="workList"> 행을 파싱
       │
       ▼
   { ymd, workType, vacation, overtime, dayOffWork, clockIn, clockOut, clockOutChanged }
       │
       │ src/App.js (CalendarPage useEffect)
       │  - 우선순위에 따라 kind 부여 → attendance map
       │
       ▼
   { kind: 'holiday' | 'vacation' | 'work' | error, ... }
       │
       │ src/components/Calendar.js
       │
       ▼
  [날짜 셀 렌더링]
```

### 동시 호출
한 달치 = 28~31일 만큼의 호출이 필요. `fetchAttendanceForMonth`가 **concurrency 4**의 워커 큐로 묶어 병렬 처리하고, 진행률을 `onProgress`로 알려줍니다.

### 보조 필드 (퇴근 변경)
`I_OUT_HM`이 비어있으면 `C_OUT_HM`(보정 입력값)을 폴백으로 사용합니다. 폴백이 적용된 경우 라벨이 `퇴근` → `퇴근 변경`(amber 배지)으로 바뀝니다. **오늘 이후 날짜는 폴백을 적용하지 않음** — 아직 퇴근 안 한 게 정상이라 잘못된 값이 박히지 않도록.

---

## 표시 규칙

`src/App.js`의 데이터 변환과 `src/components/Calendar.js`의 렌더링 분기로 구성됩니다. 우선순위 순서:

| 순위 | 조건 | 표시 | `kind` |
|---|---|---|---|
| 1 | API 에러 | `오류 + 메시지` | `error` |
| 2 | `WORK_TYPE_NM === '휴일'` **AND** WORK_DETAIL에 `휴무일` 없음 | `[휴일]` 배지만 | `holiday` |
| 3 | WORK_DETAIL에 `휴가` 포함 항목 8시간 이상 | `[연차휴가]` 등 배지만 | `vacation` |
| 4 | 그 외 (근무, 부분 휴가, 휴무일 근무 등) | 헤더 배지 + 출/퇴근/야근 | `work` |
| 5 | 데이터 없음 (`inMonth`) | `—` | — |

### `work` 셀 내부
- **헤더 배지**(있을 때): 우선순위 `dayOffWork → vacation`
  - `dayOffWork` → `휴일근무` (주황)
  - `vacation` (부분) → `{타입} {시간}` (시안) 예: `연차휴가 4시간`
- **출근 행**: `[출근] HH:MM` (없으면 `--:--`)
- **퇴근 행**: `[퇴근] HH:MM` — 단, `C_OUT_HM` 폴백 시 `[퇴근 변경]`(amber)
- **야근 행**(있을 때): WORK_DETAIL의 `연장` 항목 → `[야근] X시간`

### WORK_DETAIL 파싱 (`src/api/jadeApi.js`)
원본 XML 안에 HTML이 CDATA로 들어 있어서 `DOMParser('text/html')`로 다시 파싱합니다. `<dl class="workList">` 안의 `<tr>` 각 행에서 `[type, duration, time]` 세 칸을 추출:

- `vacationFromDetail` — `type`에 `휴가` 포함된 행 (`연차휴가`, `반차휴가` 등)
- `overtimeFromDetail` — `type === '연장'`인 행 (총 연장 시간, `평일연장`/`평일야간`은 그 분해라 사용 안 함)
- `dayOffWorkFromDetail` — `type === '휴무일'`인 행 (휴일에 일한 케이스)

`durationToHours`는 `"1d"`, `"0.5d"`, `"8시간"`, `"4시간"` 같은 표기를 시간 단위 숫자로 정규화합니다.

---

## 색상 팔레트

| 요소 | 배경 | 글자 |
|---|---|---|
| 출근 | `#dcfce7` | `#166534` (green) |
| 퇴근 | `#fee2e2` | `#991b1b` (red) |
| 퇴근 변경 | `#fef3c7` | `#92400e` (amber) |
| 야근 | `#e0e7ff` | `#3730a3` (indigo) |
| 휴일 | `#fce7f3` | `#9d174d` (pink) |
| 휴가 | `#cffafe` | `#155e75` (cyan) |
| 휴일근무 | `#ffedd5` | `#9a3412` (orange) |

---

## 보안 메모

- **Cookie / Request Body는 사용자 브라우저 `localStorage`에 평문 저장**됩니다. 공용 PC에서는 사용 후 "인증 정보 재설정"으로 비워주세요.
- 프록시는 `X-Jade-Cookie` 헤더를 받아 그대로 `Cookie`로 변환해 Jade 백엔드로 전달합니다. 프록시 자체는 토큰을 저장하지 않습니다.
- 로그 출력(`[jade-proxy] → ...`)에는 쿠키 값이 직접 찍히지 않고 길이만 로깅됩니다.
- 이 앱은 본인의 출퇴근 데이터를 본인이 조회하는 용도 외에 사용하면 안 됩니다.

---

## 알려진 한계 / TODO

- 자정을 넘기는 사용 세션에서는 "오늘" 기준이 마운트 시점에 고정 (`useMemo(() => new Date(), [])`) — 새로고침 시 갱신
- 매번 한 달 단위 재조회 — 캐싱 없음
- 휴가 분류가 `"휴가"` 포함 여부 기반이라 `병가`, `공가` 등 다른 변형은 일반 근무로 처리됨
- 동일 날짜에 휴가 + 휴무일 근무가 동시에 있는 케이스는 휴무일 근무가 우선
