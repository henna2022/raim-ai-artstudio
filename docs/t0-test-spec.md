# T0 테스트 케이스 명세 (상위 모델 설계본, 2026-07-06)

> **이 문서의 지위**: 아래 기대값은 현재 코드(`api/_aggregate.js`, `js/app.js`의
> `exportAdminXlsx`/`exportMonthlyReport`)를 **읽고 도출한 "동작 고정(pinning)" 값**이다.
> T0은 순수 리팩터링이므로, 테스트가 실패하면 **코드도 명세도 고치지 말고**
> 불일치 목록을 보고할 것 (버그인지 명세 오류인지는 상위 모델이 판정한다).
>
> **러너 규약**: `docs/stats-report-prompts.md` [공통 컨텍스트]대로 무의존 순수 node 스크립트.
> `import assert from 'node:assert/strict'` + 자체 `test(name, fn)` 헬퍼(실패 시 이름 출력 +
> `process.exitCode = 1`, 계속 진행). vitest 등 외부 러너 금지.
> 실행: `for f in tests/*.mjs; do node "$f"; done`
>
> **공통 주의**
> - 테스트 입력 rows는 항상 `created_at` **오름차순**으로 넣는다 (stats.js가 오름차순으로 읽고,
>   peak 동률 tie-break이 입력 순서에 의존하기 때문 — A6-b 참고).
> - `js/report.js`는 `Date`/현재 시각 접근 금지 — `nowYmd`, `stampText`는 전부 파라미터 주입.
>   (그래야 이 테스트들이 결정적이다. `kstYmd`/`kstStamp`는 app.js에 남긴다.)
> - Node 테스트에서 import는 쿼리 없는 경로(`../js/report.js`), 브라우저(app.js)에서만 `?v=` 사용.
> - 요일 기준일: 2026-07-06은 **월요일**이다 (아래 모든 요일 기대값의 앵커).

---

## 1. `tests/aggregate.test.mjs` — `api/_aggregate.js`

`import { aggregate, dayKey, weekKey, monthKey, windowStartISO, dayLabel, weekLabel, monthLabel } from '../api/_aggregate.js'`

rows 원소는 `{ created_at, mode }`. 아래에서 `U('2026-07-04T15:00:00Z')`는 `Date.parse(...)` 값.

### A1. KST 자정 경계 (핵심)
- 입력: r1 = `'2026-07-04T14:59:59Z'` (= KST 07-04 23:59:59 토), r2 = `'2026-07-04T15:00:00Z'` (= KST 07-05 00:00 일)
- `nowMs` = `'2026-07-05T01:00:00Z'` (= KST 07-05 10:00 일요일)
- 기대:
  - `dayKey(r1)==='2026-07-04'`, `dayKey(r2)==='2026-07-05'` — UTC로는 같은 날이지만 KST로 분리
  - `aggregate` 결과: `today===1` (r2만), `thisWeek===2` (둘 다 06-29 시작 주), `thisMonth===2`
  - `daily`는 **최신순**: `daily[0]` = `{label:'07/05(일)', count:1}`, `daily[1]` = `{label:'07/04(토)', count:1}`
  - `hourly[23].count===1` (KST 23시), `hourly[0].count===1` (KST 0시), 나머지 0
  - `weekday`: 토 1, 일 1 (라벨 순서는 월~일)

### A2. 주간 경계 = 월요일 시작 (일→월 전환)
- 입력: rSun = `'2026-07-05T14:50:00Z'` (KST 07-05 23:50 일), rMon = `'2026-07-05T15:05:00Z'` (KST 07-06 00:05 월)
- `nowMs` = `'2026-07-05T15:10:00Z'` (KST 07-06 00:10 월요일)
- 기대:
  - `weekKey(rSun)==='2026-06-29'`, `weekKey(rMon)==='2026-07-06'` — 일요일은 **지난주**로
  - `today===1`, `thisWeek===1` (rSun은 지난주), `thisMonth===2`
  - `weekly` 최신순: `[ {label:'07/06~07/12', count:1}, {label:'06/29~07/05', count:1} ]`
  - `weekLabel('2026-06-29')==='06/29~07/05'` — 월 경계를 넘는 주 라벨

### A3. 연말·연초 경계 + windowStartISO
- rNY = `'2025-12-31T15:30:00Z'` (= KST 2026-01-01 00:30 목)
- 기대:
  - `dayKey(rNY)==='2026-01-01'`, `monthKey(rNY)==='2026-01'`
  - `weekKey(rNY)==='2025-12-29'` — **1월 1일 행이 2025년 12월 날짜 키의 주에 묶인다** (버그 아님, 사양)
  - `weekLabel('2025-12-29')==='12/29~01/04'`, `dayLabel('2026-01-01')==='01/01(목)'`
  - `windowStartISO(Date.parse('2025-12-31T15:30:00Z'), 12) === '2025-01-31T15:00:00.000Z'`
    (KST 2025-02-01 00:00 — 연도 빌림 while 루프 검증)
  - `windowStartISO(Date.parse('2025-12-31T15:30:00Z'), 1) === '2025-12-31T15:00:00.000Z'` (당월 1일)
  - `windowStartISO(Date.UTC(2026,6,5,1,0), 12) === '2025-07-31T15:00:00.000Z'` (KST 2025-08-01)

### A4. 잘못된 created_at 방어
- 입력(오름차순 무관): `created_at`이 `null`, `undefined`, `''`, `'garbage'`, `0`, `false` 인 행 6개
  + 유효 행 2개: `'2026-07-01T03:00:00Z'`(ISO 문자열), `Date.UTC(2026,6,1,4,0)`(**숫자 ms** — 허용됨)
- `nowMs` = `'2026-07-05T01:00:00Z'`
- 기대: 유효 2건만 집계 — `thisMonth===2`, `daily`가 `[{label:'07/01(수)', count:2}]`,
  `report.length===1`, `report[0].total===2`. (null→epoch 0이 1970년으로 새는 것 차단 확인)

### A5. 13개월 입력 → report 12개 자르기 + dailyFull 정합 (삼중 정합의 근원)
- 입력: 2025-06 ~ 2026-06 각 달 15일 `'YYYY-MM-15T03:00:00Z'` 1건씩 = 13건
- `nowMs` = `'2026-07-05T01:00:00Z'`
- 기대:
  - `report.length===12`, `report[0].month==='2025-07'` (가장 오래된 2025-06 탈락), `report[11].month==='2026-06'`
  - `dailyFull`에 month `'2025-06'` 없음, `dailyFull.length===12`
  - `sum(dailyFull.count) === sum(report[].total) === 12` — **탈락 월이 양쪽에서 함께 빠져야 함**
  - `monthly[0].label==='2026.06'` (최신순, `monthLabel` 형식 'YYYY.MM')

### A6. 모드 집계 · blocksPct · avgActive · peak
- (a) 입력(오름차순, 전부 2026-06):
  - 06-10: blocks 2건 (`T05:00Z`, `T05:30Z`)
  - 06-11: chat 1건(`T05:00Z`), `mode:null` 1건(`T06:00Z`)
  - 06-20: blocks 1건(`T05:00Z`), chat 1건(`T05:30Z`), `mode:'weird'` 1건(`T06:00Z`)
  - 기대 (`report[0]`): `total===7`, `blocks===3`, `chat===2` (**null·미지의 문자열은 총계엔 포함,
    양쪽 모두 아님** → 미분류 2), `blocksPct===43` (반올림), `activeDays===3`,
    `avgActive===2.3` (7/3 → 소수 1자리 반올림), `peakLabel==='06/20(토)'`, `peakCount===3`
- (b) peak 동률: 06-10 2건, 06-11 2건만 입력(오름차순) → `peakLabel==='06/10(수)'` —
  **동률이면 먼저 등장한(=오름차순 입력 시 더 이른) 날짜** (strict `>` 비교의 결과, 사양으로 고정)

### A7. 빈 입력 안전성
- `aggregate([], nowMs)` 와 `aggregate(null, nowMs)` 둘 다:
  - `today===0`, `thisWeek===0`, `thisMonth===0`
  - `daily/weekly/monthly/report/dailyFull` 전부 `[]`
  - `weekday.length===7`, 라벨 순서 `['월','화','수','목','금','토','일']`, count 전부 0
  - `hourly.length===24`, `hourly[0].label==='00시'`, `hourly[23].label==='23시'`, count 전부 0

### A8. series 상한 (일별 14개)
- 입력: 2026-06-21 ~ 2026-07-05 연속 15일, 각 `'YYYY-MM-DDT03:00:00Z'` 1건
- 기대: `daily.length===14`, `daily[0].label==='07/05(일)'`(최신순), '06/21'은 탈락.
  `dailyFull`은 15개 전부 포함(오름차순) — series 상한은 화면용일 뿐.

---

## 2. `tests/report.test.mjs` — `js/report.js` (T0에서 신설)

`import { buildSnapshotSheets, buildMonthlyReportSheets } from '../js/report.js'`

report 항목 fixture는 시트가 읽는 필드를 전부 채울 것:
`{ month, monthLabel, total, blocks, chat, blocksPct, activeDays, avgActive, peakLabel, peakCount }`

### R1. buildSnapshotSheets(stats, stampText)
- stats = `{ today:5, thisWeek:12, thisMonth:40, daily:[{label:'07/05(일)',count:3},{label:'07/04(토)',count:2}], weekly:[{label:'06/29~07/05',count:9}], monthly:[{label:'2026.07',count:40}] }`, stampText = `'2026-07-06 00:10'`
- 기대: 시트 4개, 이름 순서 `['요약','일별','주별','월별']`
  - 요약: `rows[1]===['오늘',5]`, `rows[4]===[]`(빈 행 유지), `rows[5]===['내보낸 시각','2026-07-06 00:10 (KST)']`
  - 일별: `rows[0]===['날짜','생성 수']`, `rows[1]===['07/05(일)',3]` (입력 배열 순서 그대로 = 최신순)
- 결손 방어: `buildSnapshotSheets({}, 'x')` → 요약의 오늘/이번 주/이번 달 값이 `0`(`?? 0`),
  일별/주별/월별은 헤더 1행만. 예외 없어야 함.

### R2. 진행 중인 달 표기
- report = `[ {month:'2026-06', monthLabel:'2026.06', total:60, ...}, {month:'2026-07', monthLabel:'2026.07', total:9, ...} ]`, `nowYmd='2026-07-06'`
- 기대(월별 분석 시트): 2026-07 행의 1열 = `'2026.07 (진행 중)'`, '전월 대비' 열 = `'진행 중'`;
  2026-06 행은 라벨에 '(진행 중)' 없음.

### R3. 전월 대비(momPct) 매트릭스 — `nowYmd='2026-08-01'` (전부 완결월)
report(오름차순): `2026-03(total 40)`, `2026-04(total 50)`, `2026-06(total 45)`, `2026-07(total 30)`
- 2026-03: 첫 항목 → `'—'`
- 2026-04: 직전 항목이 진짜 전월 → `'+25%'` ((50−40)/40, `+` 부호 포함)
- 2026-06: 직전 항목이 2026-04 (5월 갭) → `'—'` — **report는 데이터 있는 달만 담으므로
  갭이 있으면 배열상 인접 ≠ 달력상 인접**. 이 구분이 momPct의 존재 이유.
- 2026-07: (30−45)/45 = −33.33 → `'-33%'` (Math.round는 음수에서 0 방향… 정확히는 +∞ 방향 반올림)
- 방어 분기: `2026-01(total 0)`, `2026-02(total 5)` 추가 fixture → 2026-02 행 = `'신규'`.
  (주석 필수: aggregate() 경유로는 total 0인 달이 report에 실릴 수 없어 — 행이 있어야 달이 생김 —
  손으로 만든 stats에서만 도달하는 방어 분기임을 명시)

### R4. 일별 추이 — 월 누적 리셋
- dailyFull = `[ {date:'2026-06-29',label:'06/29(월)',month:'2026-06',count:2}, {…06-30…count:3}, {…07-01…count:4}, {…07-02…count:1} ]`
- report = 2026-06(total 5), 2026-07(total 5) — dailyFull과 정합되게
- 기대(일별 추이 시트, 헤더 제외): 월 누적 열 = `2, 5, 4, 5` — **7월 1일에서 리셋**.
  각 월 마지막 누적 === 월별 분석의 해당 월 total.

### R5. 모드별 시트 — 미분류 행 조건부
- (a) report = 2026-06 `{total:60, blocks:40, chat:15}` + 2026-07 `{total:9, blocks:5, chat:4}`
  → totAll 69, 블록 45, 대화 19, 미분류 5
  - 기대 rows: `['블록',45,'65%']`, `['대화',19,'28%']`, `['미분류',5,'7%']`, `['합계',69,'100%']`
    (65/28/7은 각각 개별 반올림 — '100%'는 하드코딩 문자열)
- (b) blocks+chat===total인 fixture → 미분류 행 **없음**, rows 길이 = 4 (헤더+블록+대화+합계)

### R6. 빈 stats
- `buildMonthlyReportSheets({report:[],dailyFull:[],weekday:[],hourly:[]}, '2026-07-06')`
- 기대: 시트 5개 이름 `['월별 분석','일별 추이','요일별','시간대별','모드별']`,
  월별 분석/일별 추이/요일별/시간대별은 헤더 1행만, 모드별 =
  `[헤더, ['블록',0,'0%'], ['대화',0,'0%'], ['합계',0,'100%']]` (미분류 없음, 0나누기 예외 없음)

### R7. 통합 정합 (aggregate → report, 삼중 정합 불변식)
- A5+A6 스타일의 13개월·혼합 모드 rows → `aggregate(rows, nowMs)` → `buildMonthlyReportSheets(stats, nowYmd)`
- 기대: `sum(일별 추이 '생성 수' 열) === 모드별 '합계' 수치 === sum(월별 분석 '총 생성' 열)`
  (docs의 "시트 간 총계 정합 불변식" 그 자체)

### R8. 셀 타입 고정 (T5 전까지의 현재 사양)
- 생성 수·총 생성·가동일수·최다 수 등 카운트 셀: `typeof === 'number'`
- '블록 비율'(`'43%'`), '전월 대비'(`'+25%'`), 모드별 '비율' 셀: `typeof === 'string'` (% 포함)
  — T5에서 숫자화 예정이므로 **지금은 문자열이 정답**.

---

## 3. 구현 시 함정 목록 (테스트 대상 아님, 실수 방지용)

1. **요일별/시간대별 시트는 "12개월 총합"이다** — 대상 월 분해가 아님. T0에서 고치지 말 것 (T3 범위).
2. `series()`는 최신순, `dailyFull`/`report`는 오름차순 — 방향이 다른 게 사양.
3. `aggregate()`는 조회 창을 모름 — 12개월 밖 rows를 주면 그대로 집계한다. 창 책임은 stats.js
   (`windowStartISO`)에 있음. 테스트에서 혼동 금지.
4. `report.js`에 `downloadXlsx` import 금지 — report.js는 sheets 배열만 만들고,
   다운로드(DOM)는 app.js 얇은 핸들러에 남긴다. Node 테스트가 DOM 없이 돌아야 한다.
5. app.js 수정 시 `?v=` 버전 bump + `sw.js` CORE에 `./js/report.js` 추가 + CACHE 이름 bump
   ([공통 컨텍스트] 규칙).
6. 검증 마지막 단계: mock stats → `xlsxBytes(buildMonthlyReportSheets(...))` → python3+openpyxl로
   시트명·스팟 값 판독 (T0 프롬프트 5번 항목).
