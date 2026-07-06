# T3 테스트 케이스 명세 (상위 모델 설계본, 2026-07-06)

> **이 문서의 지위**: T3는 T0과 달리 "동작 고정"이 아니라 **새 사양**이다. 아래가 곧 정답 —
> 구현이 이 명세와 다르면 구현을 고쳐라. 명세 자체가 모순이거나 불가능해 보이면
> 고치지 말고 보고 후 멈춰라.
>
> **T3 프롬프트(stats-report-prompts.md)의 모호점에 대한 확정 결정**:
> - D1. 월별 hourly 분해는 시트 ④가 "비율 포함"을 요구하므로 **share 포함** (T2와 동일 형태).
>   프롬프트 1번 항목의 "(라벨·count)"보다 이 결정이 우선한다.
> - D2. 요약 시트 ①의 '전월 대비'는 **숫자 셀**(25, -33), 없으면 문자열 `'—'`,
>   진행 중인 달이면 `'진행 중'`. (⑤ 12개월 개요의 문자열 `'+25%'`는 기존 그대로 — T5에서 변환)
> - D3. 전년 동월: report 배열에서 `targetMonth - 12개월` 키를 찾아 있으면 숫자, 없으면 `'—'`.
>   **현재 조회 창(12개월)에서는 라이브 데이터에 전년 동월이 존재할 수 없다** — 로직만 준비하고
>   창 확장은 금지(별도 승인 사항). 테스트는 손으로 만든 stats로 로직만 검증한다.
> - D4. targetMonth가 report에 없는 달(갭)이면: 요약은 0/`'—'`로 채우고, ②③④는 헤더만,
>   ⑥은 0 행들 + 합계 0. 예외를 던지지 않는다.
> - D5. 기본 월 선택 로직은 `defaultReportMonth(report, nowYmd)`로 **report.js에서 export**
>   (DOM 없는 순수 함수 → 단위 테스트 가능). app.js는 이 함수를 호출만 한다.
> - D6. buildMonthlyReportSheets(stats, nowYmd, targetMonth)에서 targetMonth 생략/null이면
>   내부에서 defaultReportMonth로 결정한다.
> - D7. ⑦ 이용 퍼널의 데이터 소스는 항상 `stats.funnel.monthly`에서 targetMonth를 찾는다
>   (현재 달이어도 top-level 필드가 아니라 monthly 조회 — 규칙 단일화). 해당 월이 없으면 전부 0.
>   `stats.funnel`이 없으면(=T1 SQL 미적용 서버) 시트 자체를 생략, 오류 금지.
>
> **러너 규약**: T0과 동일 — 무의존 node 스크립트, `node:assert/strict`.
>
> **기존 테스트 처리 규칙**:
> - `tests/aggregate.test.mjs`, `tests/funnel.test.mjs`, `tests/weekday-hourly.test.mjs`:
>   **한 줄도 수정 금지.** aggregate() 확장은 순수 추가 필드여야 하므로 전부 그대로 통과해야 한다.
>   통과 못 하면 구현이 침습적이라는 뜻 — 구현을 고쳐라.
> - `tests/report.test.mjs`: **이 명세대로 재작성.** 단 R1(buildSnapshotSheets 2케이스)은
>   그대로 유지(스냅샷 기능은 T3 무관·무변경).

---

## 1. aggregate() 월별 분해 확장 (`tests/aggregate.test.mjs`가 아니라 **새 파일** `tests/month-detail.test.mjs`)

report[] 각 항목에 추가되는 필드 (기존 필드는 절대 변경 금지):
- `weekday`: T2 top-level과 동일 형태 `[{label, count, activeDays, avg}]` — 월~일 순 7개,
  **그 달의** 데이터만으로 계산 (activeDays = 그 달 안에서 그 요일에 데이터가 있던 날짜 수)
- `hourly`: `[{label, count, share}]` 24개 — share 분모는 **그 달의** 총 건수, 0이면 0

### G1. 월별 weekday 분해
- 입력(오름차순): 2026-06 — 월요일 2일(06-01, 06-08) 각 3건, 화요일 1일(06-02) 4건;
  2026-07 — 수요일 1일(07-01) 5건. (시각은 전부 `T03:00:00Z` = 12:00 KST)
  ※ 2026-06-01은 월요일, 06-02 화요일, 07-01 수요일 (2026-07-06=월요일 앵커에서 역산).
- 기대:
  - 6월 entry: weekday 월 = `{count:6, activeDays:2, avg:3}`, 화 = `{count:4, activeDays:1, avg:4}`,
    수~일 = count 0/activeDays 0/avg 0. 7월 데이터가 6월 분해에 섞이지 않음.
  - 7월 entry: 수 = `{count:5, activeDays:1, avg:5}`, 나머지 0.
  - top-level weekday(12개월 총합)는 월 6, 화 4, 수 5 — 기존 형태 그대로 (T2 회귀 없음).

### G2. 월별 hourly 분해 + share
- 입력: 2026-06 — 14시(KST, `T05:00:00Z`) 6건, 10시(`T01:00:00Z`) 4건; 2026-07 — 14시 1건
- 기대: 6월 entry hourly '14시' = `{count:6, share:60}`, '10시' = `{count:4, share:40}`, 나머지 share 0;
  7월 entry '14시' = `{count:1, share:100}`. (share 분모가 그 달 총계임을 증명)

### G3. 추가 필드의 비침습성
- 별도 케이스 불필요 — **기존 3개 테스트 파일 무수정 통과가 곧 증명**. 완료 보고에 명시할 것.

---

## 2. `tests/report.test.mjs` 재작성 — buildMonthlyReportSheets(stats, nowYmd, targetMonth)

### 공통 fixture `STATS_F` (손으로 구성, nowYmd = '2026-07-06')
report (오름차순, 각 항목에 T3 필드 weekday/hourly 포함해 구성):
- `2025-06`: total 30 (전년 동월 검증용 — 라이브에선 불가능하지만 순수 함수라 주입 가능)
- `2026-03`: total 40, blocks 30, chat 10
- `2026-04`: total 50, blocks 25, chat 20 (미분류 5)
- `2026-06`: total 45, blocks 20, chat 25, activeDays 9, avgActive 5, peakLabel '06/20(토)', peakCount 8
- `2026-07`: total 9, blocks 5, chat 4 (진행 중인 달)
dailyFull: 6월 4일치(합 45가 되게, 예: 06-05:10, 06-12:12, 06-20:8, 06-27:15), 7월 2일치(07-01:5, 07-02:4)
funnel: `{ visits:100, ..., monthly:[ {month:'2026-06', visits:80, modeSelects:70, ok:45, blocked:5, error:2, blockRate:10, perSession:0.7}, {month:'2026-07', visits:20, ...} ] }`

요약 시트 검증은 행 순서가 아니라 **[항목] 키 조회 헬퍼**로 할 것:
`const val = (sheet, name) => sheet.rows.find(r => r[0] === name)?.[1]`

### M1. defaultReportMonth
- `defaultReportMonth(STATS_F.report, '2026-07-06') === '2026-06'` (최신 완결월 — 2026-07 제외)
- report가 `[2026-07]`뿐 → `'2026-07'` (완결월 없으면 진행 중인 달)
- report `[]` → `null`
- buildMonthlyReportSheets 3번째 인자 생략 시 위 규칙으로 동작 (D6)

### M2. 시트 구성·이름
- `buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06')` → 시트 이름 순서:
  `['요약(2026.06)', '일별', '요일별', '시간대별', '12개월 개요', '모드별', '이용 퍼널']`
- funnel 없는 stats(동일하되 `funnel` 삭제) → 6개, `'이용 퍼널'` 없음, 오류 없음 (D7)

### M3. 요약 — 완결월 (target '2026-06')
- `val('총 생성')===45`, `val('전월 대비(%)')==='—'` (**직전 배열 항목이 2026-04 = 5월 갭** — T0의
  R3 통찰 재사용), `val('전년 동월 총 생성')===30` (2025-06 존재, D3)
- target '2026-04'로 다시 호출: `val('전월 대비(%)')===25` (**숫자** 25, 문자열 '+25%' 아님, D2),
  `val('전년 동월 총 생성')==='—'` (2025-04 없음)
- `val('블록')`, `val('대화')`, `val('미분류')===total-blocks-chat`, `val('가동일수')`,
  `val('가동일 평균')`, `val('최다 생성일')==='06/20(토)'`, `val('최다 수')===8`
- **'월말 예상(단순 추정)' 행이 없음** (완결월), `val('대상 월')==='2026.06'`

### M4. 요약 — 진행 중인 달 (target '2026-07', nowYmd '2026-07-06')
- `val('대상 월')==='2026.07 (진행 중)'`, `val('전월 대비(%)')==='진행 중'`
- `val('월말 예상(단순 추정)') === Math.round(9/6*31) === 47`
  (경과일수 = Number(nowYmd.slice(8,10)) = 6, 그달일수 = 31 — `new Date(Date.UTC(2026,7,0)).getUTCDate()`)
  ※ 46.5→47 반올림 경계 그 자체가 테스트 포인트. 라벨에 '단순 추정' 포함 필수.

### M5. ② 일별 — 해당 월만 + 월 누적
- target '2026-06': 헤더 `['날짜','생성 수','월 누적']`, 행 4개(6월만 — 7월 날짜 없음),
  누적 열 = 10, 22, 30, 45. 마지막 누적 === 요약 '총 생성' 45.

### M6. ③ 요일별 / ④ 시간대별 — 월 단위 분해 사용
- 컬럼: T2와 동일 — `['요일','생성 수','가동일수','가동일 평균']` / `['시간대','생성 수','비율(%)']`
- 값은 `report entry의 weekday/hourly`에서 (top-level 12개월 총합 아님 — **다르게 만든 fixture로
  둘이 구분되는지 확인**: top-level과 월별 값을 일부러 다르게 넣고 월별 값이 시트에 나오는지)
- 비율(%) 셀 `typeof number`

### M7. ⑤ 12개월 개요 — 기존 월별 분석 표 그대로 (T0 R2·R3 재정착)
- 10컬럼 헤더 동일, 2026-07 행 라벨 `'2026.07 (진행 중)'` + 전월 대비 `'진행 중'`,
  2026-04 행 `'+25%'`(**여기는 문자열 유지**), 2026-06 행 `'—'`(갭), 2026-03 행 `'—'`(첫 완결월 아님 —
  주의: 2025-06이 첫 항목이므로 2026-03의 직전 배열 항목은 2025-06 → 갭 → `'—'`)

### M8. ⑥ 모드별 — 해당 월 기준
- target '2026-04' (미분류 있는 달): `['블록',25,'50%'], ['대화',20,'40%'], ['미분류',5,'10%'], ['합계',50,'100%']`
- target '2026-06' (blocks 20+chat 25=45=total): 미분류 행 **없음**, 행 수 4
- 비율은 **문자열 'N%' 유지** (T5에서 변환 예정 — 여기서 미리 바꾸지 말 것)

### M9. ⑦ 이용 퍼널
- target '2026-06': `[['항목','값'],['방문',80],['모드 선택',70],['생성 성공',45],['차단',5],['오류',2],['차단율(%)',10],['세션당 시도',0.7]]` — 전부 숫자 셀
- funnel은 있는데 monthly에 target 월이 없으면 → 값 전부 0 (오류 금지)

### M10. 갭/빈 데이터 안전성 (D4)
- target '2026-05' (report에 없는 달): 요약 `val('총 생성')===0`, 전월 대비 `'—'`, 최다 생성일 `'—'`;
  ②③④ 헤더만; ⑥ = `[헤더, ['블록',0,'0%'], ['대화',0,'0%'], ['합계',0,'100%']]`
- `buildMonthlyReportSheets({report:[],dailyFull:[]}, '2026-07-06')` (funnel 없음, targetMonth 생략
  → default null): 예외 없이 6개 시트, 요약은 0/'—' 채움, 나머지 헤더만

### M11. 시트 간 총계 정합 (불변식 재정의)
- target '2026-06': 요약 '총 생성' === ② 일별 '생성 수' 합 === ⑥ '합계' 수치 === ⑤ 12개월 개요의
  2026-06 행 '총 생성' — 넷이 전부 45

### R1. (유지) buildSnapshotSheets 2케이스 — T0 그대로, 수정 금지

---

## 3. UI(app.js) — 단위 테스트 범위 밖, 검증 방법 명시

- `<select id="reportMonth">`: 옵션 = report[] 월 최신순(라벨 monthLabel, 진행 중인 달엔 ' (진행 중)'),
  기본 선택 = `defaultReportMonth(...)` (null이면 select 숨기고 버튼 비활성).
- 레포트 버튼 핸들러: `downloadXlsx('라이미-월간보고서_' + targetMonth + '.xlsx', buildMonthlyReportSheets(adminStats, kstYmd(), targetMonth))` — **파일명은 오늘 날짜가 아니라 targetMonth** (파일명 규칙 변경: 라이미-월별레포트_→라이미-월간보고서_).
- CSS는 .adminTabs 톤에 맞춰 최소만.
- 검증: `node --check` + (프리뷰 가능하면) ?admin 화면에서 select 렌더 확인. 수동 검증이 안 되면
  보고에 "UI 미검증" 명시.

## 4. 하지 말 것
- 조회 창을 24개월로 확장 (전년 동월이 '—'로 나오는 게 현재 정상 — 창 확장은 별도 승인)
- aggregate()의 기존 필드/기존 반환 구조 변경 (추가만 허용)
- tests/aggregate·funnel·weekday-hourly.test.mjs 수정
- 스냅샷(통계 내보내기) 경로 변경
- ?v=/CACHE 규칙 위반 (report.js?v=3, app.js?v=23, index.html 반영)
