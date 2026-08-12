# Jade 출퇴근 기록 (jade_in_out)

Jade HR 시스템(`ehr.jadehr.co.kr`)의 일별 출퇴근 데이터를 한 달치 캘린더로 모아 보여주는 개인용 웹 앱입니다. Jade의 공식 UI 대신, 사용자가 추출한 인증 정보로 직접 API를 호출해 깔끔한 달력 뷰로 변환합니다.

- React 19 + Create React App (CRA) + TypeScript (`strict`, `noUncheckedIndexedAccess`)
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
- **출근/퇴근 보조 필드(`C_IN_HM`/`C_OUT_HM`)로 채워진 경우**: `[출근 변경] 09:00` / `[퇴근 변경] 18:00` (amber 배지)
- **과거 날짜인데 출근/퇴근 둘 다 없음**: `[출근 누락]` / `[퇴근 누락]` (짙은 빨강)
- **오늘 + 미래 날짜**: 보조 필드 폴백 & 누락 표시 모두 적용하지 않음 (아직 안 찍힌 게 정상)

---

## 디렉터리 구조

```
jade_in_out/
├── api/
│   └── jade/
│       └── [...path].js              # Vercel 서버리스 함수 — 운영 환경에서 Jade 백엔드로 프록시
├── public/                           # CRA 정적 자원
├── src/
│   ├── api/
│   │   └── jadeApi.ts                # Jade XML 응답 파싱 + 한 달치 동시 조회 (타입 포함)
│   ├── components/
│   │   ├── Calendar.tsx / .css       # 캘린더 그리드
│   │   ├── CalendarCell.tsx          # 단일 셀 렌더링 (kind별 분기)
│   │   ├── CalendarPage.tsx          # 월 단위 상태/조회/렌더링 컨테이너
│   │   ├── MonthPicker.tsx           # 연도/월 popover picker
│   │   └── Setup.tsx / .css          # 최초 진입 시 인증 정보 입력 폼
│   ├── lib/
│   │   ├── format.ts                 # 날짜/시간 포맷팅 (pad, dateKey, formatHm, isHolidayType)
│   │   ├── parseCurl.ts              # cURL/Body 텍스트 파서 (순수 함수)
│   │   ├── storage.ts                # localStorage 자격증명 관리 + Credentials 타입
│   │   └── transformAttendance.ts    # 원본 API 응답 → 화면용 DisplayRecord 매핑
│   ├── App.tsx                       # 라우팅(인증 화면 vs 캘린더)
│   ├── App.css                       # 툴바, 월 picker, 진행률 등 공용 스타일
│   ├── setupProxy.js                 # 개발 서버용 CRA 프록시
│   ├── react-app-env.d.ts            # CRA + CSS 모듈 타입 선언
│   └── index.tsx / index.css
├── tsconfig.json                     # TypeScript 설정 (strict + noUncheckedIndexedAccess)
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

이 앱은 자체 로그인 기능이 없습니다. 대신 사용자가 직접 Jade에 로그인한 후 브라우저 DevTools의 네트워크 요청에서 인증 정보를 가져옵니다. Setup 화면에는 두 가지 입력 방식이 탭으로 제공됩니다.

### 방식 1: cURL 붙여넣기 (권장 — 한 번에 붙여넣기)

1. [Jade EHR](https://ehr.jadehr.co.kr)에 로그인하고 **출퇴근 메뉴**(`ess_tam_402_m01`)를 엽니다.
2. <kbd>F12</kbd> → **Network** 탭을 열고 `commonAction.do` 요청을 찾습니다.
3. 해당 요청을 **우클릭 → Copy → Copy as cURL** 선택.
   - Windows에서는 PowerShell 옵션이 아닌 `cURL (bash)` 또는 `cURL (cmd)`로 복사 (PowerShell 포맷은 미지원).
4. 앱의 입력칸에 그대로 붙여넣기 → Cookie/Body 자동 추출.

### 방식 2: Cookie + Body 직접 입력 (수동)

1. 위 1~2 동일.
2. **Headers** 탭의 `Cookie` 값을 통째로 복사 → Cookie 칸.
3. **Payload** 탭의 Request Body를 통째로 복사 → Request Body 칸 (`KEY:VALUE` 줄 단위 또는 `key=value&...` URL-encoded 모두 인식).

### 공통
- `S_STD_YMD` 필드가 포함되어 있어야 정상 (앱이 날짜만 갈아끼우며 일별로 호출).
- "저장하고 달력 보기" 클릭 → `localStorage`에 Cookie + Body가 저장되어 새로고침에도 유지됩니다.
- 다른 계정/세션으로 바꾸려면 우상단 "인증 정보 재설정"을 누릅니다.

### 파서가 추출하는 것 (`src/lib/parseCurl.ts`)
**`parseCurl`** (cURL 탭):
- 라인 연속(`\` / `^` / 백틱) 제거 후 단일 라인으로 평탄화
- **cmd 포맷 자동 감지** (`^"`, `^%`, `^&` 패턴 발견 시 `^X` → `X`로 unescape)
- Cookie 추출 우선순위:
  1. `-b '...'` 또는 `--cookie '...'` 플래그 (Chrome DevTools가 실제로 쓰는 방식)
  2. fallback: `-H 'cookie: ...'` 헤더
- Body 추출: `--data-raw` / `--data` / `--data-binary` / `--data-urlencode` / `--data-ascii` / `-d`
- Body를 `URLSearchParams`로 디코드 → 필드 맵

**`parseBody`** (수동 탭):
- `key=value&...` URL-encoded 형태면 `URLSearchParams`로 파싱
- 그 외에는 줄 단위 `KEY:VALUE` 포맷으로 파싱

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
       │ src/api/jadeApi.ts
       │  - parseAttendanceXml: <ETC KEY="X">value</ETC> → { X: value }
       │  - parseWorkListRows: WORK_DETAIL HTML 안의 <dl class="workList"> 행을 한 번에 파싱
       │  - vacation/overtime/dayOffWork/localAttendanceFromRows: 위 결과를 type별로 필터
       │
       ▼
   AttendanceRecord { ymd, workType, vacation, overtime, dayOffWork, clockIn, clockInChanged, clockOut, clockOutChanged, ... }
       │
       │ src/lib/transformAttendance.ts (buildAttendanceMap)
       │  - 우선순위에 따라 kind 부여 → DisplayRecord 매핑
       │
       ▼
   DisplayRecord = { kind: 'holiday' | 'vacation' | 'work' | 'error', ... }
       │
       │ src/components/Calendar.tsx → CalendarCell.tsx (kind 별 분기)
       │
       ▼
  [날짜 셀 렌더링]
```

### 동시 호출
한 달치 = 28~31일 만큼의 호출이 필요. `fetchAttendanceForMonth`가 **concurrency 4**의 워커 큐로 묶어 병렬 처리하고, 진행률을 `onProgress`로 알려줍니다.

### 보조 필드 (출근 변경 / 퇴근 변경 / 누락)
- 출근: `I_IN_HM` 비어있으면 `C_IN_HM` 폴백 → `출근 변경`(amber)
- 퇴근: `I_OUT_HM` 비어있으면 `C_OUT_HM` 폴백 → `퇴근 변경`(amber)
- 과거 날짜인데 폴백까지 모두 없음: `출근 누락` / `퇴근 누락`(짙은 빨강) — 시간 칸 없이 라벨만 표시
- **오늘 이후 날짜는 폴백 & 누락 표시 모두 적용하지 않음** — 아직 안 찍힌 게 정상이라 잘못된 표시가 박히지 않도록

---

## 표시 규칙

`src/lib/transformAttendance.ts`의 데이터 변환과 `src/components/CalendarCell.tsx`의 렌더링 분기로 구성됩니다. 우선순위 순서:

| 순위 | 조건 | 표시 | `kind` |
|---|---|---|---|
| 1 | API 에러 | `오류 + 메시지` | `error` |
| 2 | WORK_DETAIL에 `재택근무` 항목 존재 | `[재택근무]` 배지 (+ 연차 정보 있으면 `[연차휴가 0.5d]` 등 추가 배지) — 출/퇴근 시각은 표시 안 함 | `remote` |
| 3 | `WORK_TYPE_NM`이 `휴일`/`휴무` 포함 (예: `휴일`, `휴무(토요일)`) **AND** WORK_DETAIL에 `휴무일` 없음 | `[휴일]` 배지만 | `holiday` |
| 4 | WORK_DETAIL에 `휴가`/`병가`/`공가` 키워드 항목 8시간 이상 | `[연차휴가]` / `[병가]` 등 배지만 | `vacation` |
| 5 | 그 외 (근무, 부분 휴가, 휴무일 근무 등) | 헤더 배지 + 출/퇴근/야근 | `work` |
| 6 | 데이터 없음 (`inMonth`) | `—` | — |

### `work` 셀 내부
- **헤더 배지**(있을 때): 우선순위 `dayOffWork → vacation`
  - `dayOffWork` → `휴일근무` (주황)
  - `vacation` (부분) → `{타입} {시간}` (시안) 예: `연차휴가 4시간`
- **출근 행**: `[출근] HH:MM` — `C_IN_HM` 폴백 시 `[출근 변경]`(amber), 과거 날짜에 둘 다 없으면 `[출근 누락]`(짙은 빨강)
- **퇴근 행**: `[퇴근] HH:MM` — `C_OUT_HM` 폴백 시 `[퇴근 변경]`(amber), 과거 날짜에 둘 다 없으면 `[퇴근 누락]`(짙은 빨강)
- **야근 행**(있을 때): WORK_DETAIL의 `연장` 항목 → `[야근] X시간`

### WORK_DETAIL 파싱 (`src/api/jadeApi.ts`)
원본 XML 안에 HTML이 CDATA로 들어 있어서 `DOMParser('text/html')`로 다시 파싱합니다. `parseWorkListRows`가 `<dl class="workList">` 안의 `<tr>` 각 행에서 `[type, duration, time]` 세 칸을 추출해 `WorkListRow[]`로 정리한 뒤, 종류별 함수가 그 위에서 type만 필터합니다:

- `vacationFromRows` — `type`에 `휴가`/`병가`/`공가` 키워드가 포함된 행 (`연차휴가`, `반차휴가`, `병가`, `공가` 등)
- `overtimeFromRows` — `type === '연장'`인 행
- `dayOffWorkFromRows` — `type === '휴무일'`인 행 (휴일에 일한 케이스)
- `remoteWorkFromRows` — `type === '재택근무'`인 행. 있으면 다른 어떤 카테고리보다 우선해 `[재택근무]` 배지로만 표시 (실 출퇴근 클럭/시각은 무시 — 재택일에 연차가 겹치는 등 클럭이 부정확할 수 있어서). 같은 날 휴가 정보가 있으면 `[연차휴가 X]` 배지를 추가로 함께 표시
- `localAttendanceFromRows` — `현지출근신청` / `현지퇴근신청` 행을 합쳐 `{in, out}` 시각 추출

`durationToHours`는 `"1d"`, `"0.5d"`, `"8시간"`, `"4시간"` 같은 표기를 시간 단위 숫자로 정규화합니다.

---

## 색상 팔레트

| 요소 | 배경 | 글자 |
|---|---|---|
| 출근 | `#dcfce7` | `#166534` (green) |
| 퇴근 | `#fee2e2` | `#991b1b` (red) |
| 출근 변경 / 퇴근 변경 | `#fef3c7` | `#92400e` (amber) |
| 출근 누락 / 퇴근 누락 | `#fecaca` | `#7f1d1d` (deep red) |
| 야근 | `#e0e7ff` | `#3730a3` (indigo) |
| 휴일 | `#fce7f3` | `#9d174d` (pink) |
| 휴가 | `#cffafe` | `#155e75` (cyan) |
| 휴일근무 | `#ffedd5` | `#9a3412` (orange) |
| 재택근무 | `#f3e8ff` | `#6b21a8` (violet) |

---

## 보안 메모

- **Cookie / Request Body는 사용자 브라우저 `localStorage`에 평문 저장**됩니다. 공용 PC에서는 사용 후 "인증 정보 재설정"으로 비워주세요.
- 프록시는 `X-Jade-Cookie` 헤더를 받아 그대로 `Cookie`로 변환해 Jade 백엔드로 전달합니다. 프록시 자체는 토큰을 저장하지 않습니다.
- 로그 출력(`[jade-proxy] → ...`)에는 쿠키 값이 직접 찍히지 않고 길이만 로깅됩니다.
- 이 앱은 본인의 출퇴근 데이터를 본인이 조회하는 용도 외에 사용하면 안 됩니다.

---

## 신규 인사시스템 연동 테스트

앱 상단의 **기존 시스템**과 **신규 인사시스템** 탭은 인증과 화면 상태를 서로 공유하지 않습니다. 기존 Jade 화면은 그대로 사용하고, INSA 테스트가 필요할 때만 신규 탭으로 전환합니다.

### INSA Cookie 입력

1. [INSA](https://insa.kwe.co.kr)에 로그인합니다.
2. 브라우저 개발자 도구(<kbd>F12</kbd>)의 **Network** 탭에서 `main.asp` 요청을 선택합니다.
3. **Request Headers**의 `Cookie` 값만 복사합니다. `Cookie:`라는 헤더 이름은 제외합니다.
4. 앱의 **신규 인사시스템** 탭에서 `INSA Cookie` 입력란에 붙여 넣고 저장합니다.

Cookie는 로그인 세션 값이므로 다른 사람에게 전달하거나 소스·이슈·로그에 남기지 마세요. INSA 세션이 만료되면 조회가 실패하며, 이 앱은 Cookie를 자동 갱신하거나 대신 로그인하지 않습니다. 그때는 INSA에 다시 로그인해 새 Cookie를 복사한 뒤 신규 탭의 인증 정보를 초기화하고 다시 입력해야 합니다.

### 조회 범위

신규 탭은 다음 세 엔드포인트에서 기존 기록을 읽기만 합니다. 휴가 신청, 출퇴근 정정, 승인 등 쓰기 작업은 하지 않습니다.

| 데이터 | 메서드와 경로 | 용도 |
| --- | --- | --- |
| 홈 일정 | `GET /main.asp` | 날짜별 팀 휴가·시간 일정과 선택일 상세 |
| 개인 출퇴근 | `POST /worktime/01_list.asp` | 지정 기간의 개인 출퇴근 기록 조회 |
| 내 휴가 | `GET /leave/01_list.asp` | 개인 휴가 사용내역 조회 |

브라우저는 위 경로 앞에 `/api/insa`를 붙여 호출합니다. 개발 환경에서는 `src/setupProxy.js`, Vercel 배포에서는 `api/insa/[...path].js`가 `X-Insa-Cookie`를 upstream `Cookie`로 바꾸고 INSA에 전달합니다. 프록시는 Cookie 원문이나 요청 헤더 전체를 로그에 출력하지 않습니다.

### 저장소와 배포 제약

- INSA Cookie는 `localStorage`의 `insa_kwe_cookie_v1`에 저장됩니다.
- 기존 Jade 인증은 `jade_in_out_credentials_v1`에 저장되며 INSA 저장소와 합치지 않습니다.
- 두 값 모두 브라우저에 평문으로 남으므로 공용 PC에서는 사용 후 각각의 인증 정보 초기화를 실행하세요.
- 순수 정적 호스팅만으로는 INSA를 호출할 수 없습니다. 브라우저 CORS 정책과 `Cookie` 헤더 제한 때문에 CRA 개발 프록시 또는 Vercel 함수가 반드시 함께 동작해야 합니다.

---

## 알려진 한계 / TODO

- 자정을 넘기는 사용 세션에서는 "오늘" 기준이 마운트 시점에 고정 (`useMemo(() => new Date(), [])`) — 새로고침 시 갱신
- 매번 한 달 단위 재조회 — 캐싱 없음
- 휴가 분류는 `휴가`/`병가`/`공가` 키워드 포함 여부 기반. 그 외 다른 종류의 부재(예: 외출, 출장)는 일반 근무로 처리됨
- 동일 날짜에 휴가 + 휴무일 근무가 동시에 있는 케이스는 휴무일 근무가 우선
