# 통계 고도화 — 하위 모델 위임용 작업 프롬프트

사용법:
1. Claude Code 세션을 **`/Users/henna/Desktop/raim-ai-artstudio`에서** 연다 (Downloads 쪽은 빈 폴더).
2. 아래 **[공통 컨텍스트]** 블록을 먼저 붙여넣고, 이어서 작업 프롬프트 **1개만** 붙여넣는다 (한 세션 = 한 작업).
3. 권장 순서: **T0 → (T1, T2 병렬) → T3 → T4, T5 → T6**. T0이 끝나야 T3~T5가 안전하다.

---

## [공통 컨텍스트] — 모든 작업 프롬프트 앞에 붙일 것

```
[프로젝트 공통 컨텍스트]
- 앱: "라이미의 AI 그림 연구소" — 아동용 AI 그림 키오스크 PWA. 빌드 없는 vanilla JS
  (index.html + js/app.js ES 모듈 + js/i18n.js + css/styles.css) + Vercel 서버리스(api/*, ESM)
  + Supabase. 프런트에 외부 라이브러리 추가 금지.
- 데이터: generations 테이블은 {created_at(UTC, DB default now()), mode:'blocks'|'chat'|null}만 저장.
  아동용 앱이므로 개인정보(프롬프트 원문·IP·User-Agent 등) 저장 절대 금지.
- 핵심 모듈:
  * api/_aggregate.js — 순수 KST 집계 모듈. aggregate(rows, nowMs) →
    {today, thisWeek, thisMonth, daily, weekly, monthly, weekday, hourly, report[], dailyFull}.
    windowStartISO(nowMs, months)도 export.
  * api/stats.js — 12개월 창을 오름차순 페이지네이션으로 읽어 aggregate() 반환.
  * js/xlsx-mini.js — 무의존 .xlsx 생성기. 스타일/차트 미지원. 문자열=inlineStr, 숫자=<v>.
    downloadXlsx(filename, sheets)와 xlsxBytes(sheets) export. sheets = [{name, rows:[[...]]}].
  * js/app.js 하단 "관리자 통계" 섹션(?admin) — renderAdmin/syncAdmin/exportAdminXlsx/
    exportMonthlyReport/kstYmd/kstStamp.
- 규칙(어기면 안 됨):
  * 모든 집계·라벨은 KST 기준.
  * js/css 수정 시 index.html의 해당 ?v= 쿼리 버전을 1 올린다. app.js가 import하는 모듈을
    수정하면 app.js의 import ?v=도 올리고 index.html의 app.js ?v=도 올린다.
  * sw.js의 CORE 목록을 바꾸면 CACHE 이름을 bump한다. /api/* 는 SW가 캐시하지 않는다(유지).
  * 레포트의 시트 간 총계 정합 불변식: 일별 추이 합 = 모드별 합계 = 월별 분석 총 생성 합.
- 검증(완료 전 필수, 결과를 보고에 포함):
  * node --check <수정한 모든 js>
  * 리포지토리에 tests/가 있으면 전부 실행: for f in tests/*.mjs; do node "$f"; done
  * 엑셀 산출물이 바뀌면 Node로 xlsxBytes()를 호출해 파일을 만들고 python3 + openpyxl로
    실제 판독해 시트명·값·총계 정합을 확인한다.
- Supabase 실계정 접근은 없다고 가정하고, DB 스키마 변경은 SQL 파일로 저장 + 적용 안내만 한다.
```

---

## T0 — 레포트 로직 분리 + 테스트 리포지토리 편입 (P0, T3~T5의 선행)

```
[작업] 관리자 엑셀 레포트 빌더를 순수 모듈로 분리하고, 단위 테스트를 리포지토리에 편입해줘.

1) js/report.js 신설 (ES 모듈, 브라우저/Node 겸용 — DOM 접근 금지):
   - export function buildSnapshotSheets(stats, stampText) → 현재 js/app.js의
     exportAdminXlsx()가 만드는 sheets 배열(요약/일별/주별/월별)을 그대로 반환.
   - export function buildMonthlyReportSheets(stats, nowYmd) → 현재 exportMonthlyReport()가
     만드는 sheets 배열(월별 분석/일별 추이/요일별/시간대별/모드별)을 그대로 반환.
     nowYmd는 'YYYY-MM-DD' 문자열(진행 중인 달 판정에 사용: nowYmd.slice(0,7)).
   - momPct/prevMonthKey 등 내부 헬퍼도 함께 이동.
2) js/app.js: exportAdminXlsx/exportMonthlyReport는 얇은 핸들러로 축소 —
   adminStats 가드 후 downloadXlsx(파일명, buildXxx(adminStats, ...)) 호출만 남긴다.
   import { buildSnapshotSheets, buildMonthlyReportSheets } from "./report.js?v=1"; 추가.
3) sw.js CORE에 "./js/report.js" 추가 + CACHE 이름 bump. index.html/app.js의 ?v= 규칙 준수.
4) tests/ 디렉토리 신설(무의존, 순수 node 스크립트 — 실패 시 process.exitCode=1):
   - tests/aggregate.test.mjs: KST 자정 경계(UTC 15:30 → 다음날 00:30 KST), 주=월요일 시작,
     연말 경계(2025-12-29 주, 12월→1월 monthKey), null/0/false/문자열 created_at 무시,
     13개월 입력 시 report=12개월 & dailyFull이 report 월집합과 총계 일치, 빈 입력 안전.
   - tests/report.test.mjs: 진행 중인 달 라벨 "(진행 중)"+"진행 중", 완결월 momPct(인접 없으면 —),
     월 누적이 달 경계에서 리셋, mode:null 존재 시 미분류 행과 합계=총 생성, 미분류 0이면 행 없음,
     세 시트 총계 정합.
5) 동작 불변 확인: 분리 전후 동일 mock 입력으로 xlsxBytes() 결과를 openpyxl로 읽어
   시트명·모든 셀 값이 동일함을 확인(총계 비교로 갈음 가능).

완료 기준: 위 검증 전부 통과 + ?v=/CACHE 규칙 준수 + app.js의 레포트 조립 코드가 report.js로 이동.
하지 말 것: 수치·라벨·시트 구성 변경(순수 리팩터링), 외부 라이브러리 추가.
```

---

## T1 — 이벤트 로깅 도입: 세션·퍼널·차단/오류 (P0, 독립 — 가장 중요)

```
[작업] 지금은 "성공한 생성"만 기록돼서(무엇을: api/generate.js 87행 부근 logGeneration이 업로드
성공 후에만 호출) 방문자 수·전환율·차단율을 전혀 알 수 없어. 개인정보 없이 이벤트 로깅을 추가해줘.

1) DB: docs/sql/2026-07-events.sql 파일로 저장(적용은 사람이 Supabase SQL Editor에서 함):
   create table if not exists events (
     id bigint generated always as identity primary key,
     created_at timestamptz not null default now(),
     session_id uuid,
     type text not null check (type in
       ('visit','mode_select','generate_ok','generate_blocked','generate_error')),
     mode text,          -- 'blocks' | 'chat' | null
     lang text,          -- 'ko' | 'en' | null
     detail text         -- 차단 사유 'banned'|'copyright', 오류 요약(100자 이내). 프롬프트 원문 금지
   );
   create index if not exists events_created_at_idx on events (created_at);

2) api/log.js 신설(POST): body {session_id, type, mode, lang} 화이트리스트 검증 후 events에
   insert. type이 visit/mode_select만 허용(생성 계열은 서버가 직접 기록). 실패해도 200 반환
   (로깅이 UX를 깨면 안 됨).

3) js/app.js:
   - 세션: let sessionId = crypto.randomUUID(); — 페이지 로드 시 1회 + resetToStart()(193행 부근,
     '처음으로' 확정)와 유휴 리셋(onIdle, 659행 부근)에서 재발급. 키오스크에서 "새 방문" 단위가 됨.
   - 전송 헬퍼 logEvent(type, extra): navigator.sendBeacon(API_BASE+'/api/log', Blob(JSON)) 우선,
     실패 시 fetch(..., {keepalive:true}).catch(()=>{}) — 절대 await로 UI를 막지 말 것.
   - 발화 지점: 초기화 직후 logEvent('visit', {lang}) / 모드 카드 클릭(data-mode 핸들러)에서
     logEvent('mode_select', {mode, lang}).
   - /api/generate fetch(211행 부근) body에 session_id와 lang을 추가.

4) api/generate.js: 요청 body에서 session_id/lang 수령(uuid 형식 검증, 불일치 시 null).
   - 금칙어 400(24행)·저작권 400(43행) 직전에 events에 {type:'generate_blocked', detail:'banned'|'copyright', mode, lang, session_id} insert(try/catch, 실패 무시).
   - 502/500 경로에 generate_error(detail=사유 앞 100자).
   - 성공 시 generate_ok insert + 기존 generations insert도 유지(하위 호환 이중 기록).

5) api/stats.js + api/_aggregate.js: events를 같은 12개월 창으로 읽어(events 테이블 없거나 비면
   전부 0/null로 우아하게 처리 — 42P01 잡아서 무시) 응답에 funnel 필드 추가:
   {visits, modeSelects, ok, blocked, error, blockRate, perSession} (이번 달 기준 + 월별 배열).
   화면/시트 반영은 이 작업 범위 밖(T3에서 함) — 필드만 추가.

완료 기준: node --check 전부 통과, tests/ 통과(있으면), aggregate 확장분에 대한 단위 테스트 추가
(mock events 배열로 blockRate 계산 검증), SQL 파일 저장, 개인정보 미저장 확인(프롬프트 원문이
어디에도 insert되지 않음을 grep으로 증명).
하지 말 것: 프롬프트 원문/IP/UA 저장, 로깅 실패로 생성 흐름 차단, 동기 대기.
```

---

## T2 — 요일·시간대 통계 정규화 (P1, 독립)

```
[작업] api/_aggregate.js의 weekday는 12개월 "총합"이라 관측 기회가 많은 요일이 무조건 커 보여
(운영일 편중·성장 추세와 교란). 정규화해줘.

1) _aggregate.js: weekday 항목을 {label, count, activeDays, avg}로 확장.
   - activeDays = 그 요일에 데이터가 있었던 날짜 수(dMap 키를 요일로 분류해 카운트).
   - avg = activeDays ? Math.round(count/activeDays*10)/10 : 0. (가동일당 평균)
2) hourly 항목에 share 추가: 전체 대비 비율(%) = Math.round(count/total*100), total=0이면 0.
3) js/report.js(T0 후) 또는 js/app.js의 레포트: '요일별' 시트 컬럼을
   [요일, 생성 수, 가동일수, 가동일 평균]으로, '시간대별' 시트를 [시간대, 생성 수, 비율(%)]로.
   비율(%)은 숫자 셀(문자열 "12%" 금지).
4) 관리자 화면 요일별 탭: 막대 기준을 avg로, 숫자 표기는 "평균 3.2 (총 63)" 형식.
   adminChartHTML이 {label, count}를 가정하므로 요일 탭만 avg를 쓰도록 분기.
5) tests/aggregate.test.mjs에 케이스 추가: 월요일 2일×각 3건, 화요일 1일×4건 →
   월 avg=3, 화 avg=4 (총합은 월 6 > 화 4지만 평균은 화가 큼 — 정규화 목적 그 자체).

완료 기준: 테스트 통과 + openpyxl로 새 컬럼 판독 + ?v= 규칙 준수.
하지 말 것: 기존 count 필드 제거(하위 호환 유지), 시트 간 총계 정합 훼손.
```

---

## T3 — 진짜 "월간" 보고서: 대상 월 선택 + 월 상세 (P1, T0 이후)

```
[작업] 현재 "월별 레포트"는 12개월 개요라 특정 월의 상세(그 달의 일별·요일·시간대)가 없어.
대상 월을 선택하는 진짜 월간 보고서로 바꿔줘.

1) api/_aggregate.js: monthAgg에 요일(wd[7])·시간대(hr[24]) 분해를 추가하고 report[] 각 항목에
   weekday(라벨·count·activeDays·avg)와 hourly(라벨·count)를 포함시킨다(월 단위 분해).
2) 관리자 화면(js/app.js renderAdmin): "📄 월별 레포트" 버튼 옆에 <select id="reportMonth">
   추가 — 옵션은 report[]의 월 최신순, 기본값은 "가장 최근의 완결월"(진행 중인 달 제외,
   완결월이 없으면 진행 중인 달). CSS는 .adminTabs 톤과 어울리게 최소만 추가.
3) js/report.js: buildMonthlyReportSheets(stats, nowYmd, targetMonth)로 확장. 시트 구성:
   ① "요약(YYYY.MM)" — 총 생성, 전월 대비(완결월만, 숫자%), 전년 동월(데이터 있으면), 블록/대화/
      미분류, 가동일수·가동일 평균, 최다 생성일. 대상이 진행 중인 달이면 "(진행 중)" 표기 +
      월말 단순 추정 = Math.round(총생성/경과일수*그달일수) 행 추가, 라벨에 "단순 추정" 명시.
   ② "일별" — 해당 월만, [날짜, 생성 수, 월 누적].
   ③ "요일별" — 해당 월의 weekday(avg 포함). ④ "시간대별" — 해당 월의 hourly(비율 포함).
   ⑤ "12개월 개요" — 기존 월별 분석 표 유지. ⑥ "모드별" — 해당 월 기준(미분류 규칙 동일).
   T1이 이미 반영돼 stats.funnel이 있으면 ⑦ "이용 퍼널" — 방문·모드선택·성공·차단·오류·전환율.
   없으면 시트 생략(오류 금지).
   파일명: 라이미-월간보고서_YYYY-MM.xlsx.
4) tests/report.test.mjs 확장: 대상 월 필터링, 진행 중 달 추정 계산, 완결월 기본 선택 로직,
   ①~⑥ 총계 정합(요약 총생성 = 일별 합 = 모드별 합계).

완료 기준: 테스트 통과 + mock stats로 xlsxBytes → openpyxl 판독(시트 7±, 값 스팟체크) +
?v= 규칙 준수.
하지 말 것: 12개월 개요 시트 삭제, 추정치를 라벨 없이 표기, 전년 동월을 위해 조회 창을
말없이 24개월로 늘리기(창 확장이 필요하면 보고에 명시하고 별도 승인 요청).
```

---

## T4 — 요약·자동 코멘트 시트 (P1, T0 이후 — T3와 같은 세션에서 해도 됨)

```
[작업] 보고서 맨 앞에 사람이 바로 읽는 "핵심 요약" 시트를 추가해줘. 코멘트는 데이터에서만
규칙 기반으로 생성(추측·수식어 금지).

js/report.js에 buildInsights(stats, targetMonth) 추가 → 문자열 배열 반환, 규칙:
  - 최다/최저 월: report에서 완결월 중 max/min (동률이면 최근 것).
  - 직전월 대비: 완결월 기준 ±10% 이상일 때만 "증가/감소" 언급, 미만이면 "비슷한 수준".
  - 최다 요일: weekday avg 기준 1위 (avg 차이가 0.5 미만이면 언급 생략).
  - 피크 시간대: hourly 1위 구간, 상위 2개가 인접하면 "14~15시" 형태로 병합.
  - 미분류가 있으면: "모드 미기록 N건 포함(전체의 M%)" 안내.
  - 데이터 2개월 미만이면 비교 문장 전부 생략하고 "데이터 누적 중" 한 줄.
'핵심 요약' 시트 = [항목, 내용] 2열, 위 문장들 + 생성 시각(KST) + 데이터 범위.
tests/report.test.mjs에 규칙별 경계 케이스(±10% 경계, 동률, 2개월 미만) 추가.

완료 기준: 테스트 통과 + openpyxl 판독. 하지 말 것: 임계값 하드코딩 산재(상수로 모아두기),
데이터에 없는 원인 해석("날씨 때문" 류) 생성.
```

---

## T5 — 셀 수치화 + 원본 데이터 내보내기 (P1, T0 이후)

```
[작업 A] 레포트의 "62%", "+6%" 같은 문자열 셀은 엑셀에서 후속 계산·피벗이 안 돼. 수치로 바꿔줘.
  - 월별 분석: '블록 비율(%)' → 숫자 62, '전월 대비(%)' → 숫자 6/-20 (없거나 진행 중이면 빈 셀,
    월 라벨의 "(진행 중)"은 유지).
  - 모드별·시간대별 비율도 숫자 컬럼으로. 헤더에 (%) 단위 명시.
  - tests/report.test.mjs에서 해당 셀 typeof number 검증.

[작업 B] 원본 데이터 내보내기:
  - api/export.js 신설: 12개월 창(windowStartISO 재사용)의 generations를 오름차순 페이지네이션으로
    모두 읽어 [{t: KST 'YYYY-MM-DD HH:mm', mode}] JSON 반환. (events는 T1 반영 시 type 포함 별도
    배열로 함께 반환 — 없으면 생략)
  - 관리자 화면에 "🗂 원본 데이터" 버튼(secondary 스타일) → /api/export 호출 →
    xlsx 1~2시트(생성기록: [일시(KST), 모드], 이벤트: [일시, 종류, 모드, 언어]) 다운로드.
    파일명 라이미-원본_YYYY-MM-DD.xlsx.
  - 수만 행까지 가정: 시트당 최대 50,000행 넘으면 최신순으로 자르고 마지막 행에
    "이후 생략 (총 N행)" 표기.

완료 기준: node --check + 테스트 + mock 데이터로 openpyxl 판독(숫자 타입·행수) + ?v= 규칙.
하지 말 것: /api/stats 응답에 원본 행을 끼워넣기(payload 비대), 개인정보 컬럼 추가.
```

---

## T6 — 인쇄용 HTML 보고서 (차트 포함, PDF 저장) (P2, T3 이후 권장)

```
[작업] xlsx-mini는 차트를 지원하지 않아(자체 OOXML 차트 구현은 금지 — 비용 대비 무리).
시각 자료가 있는 보고서는 브라우저 인쇄(PDF 저장)로 제공해줘.

1) 관리자 화면에 "🖨 인쇄용 보고서" 버튼 → renderPrintReport(targetMonth):
   #s-admin 내용을 보고서 DOM으로 교체 — 제목/기간, KPI 카드(오늘·이번 주·이번 달 또는 대상 월
   요약), 월별 추이 막대(.adminBarRow 재사용), 요일별(avg)·시간대별 막대, 핵심 요약 문장(T4의
   buildInsights 재사용), 하단 "돌아가기" 버튼(renderAdmin 복귀).
2) css/styles.css에 @media print 블록: 헤더/버튼/blob 숨김, -webkit-print-color-adjust: exact,
   페이지 여백, 섹션 page-break 회피. 버튼 클릭 시 DOM 렌더 후 window.print() 호출.
3) iPad standalone PWA에서는 print가 동작하지 않을 수 있음 — matchMedia('(display-mode:
   standalone)') 감지 시 "데스크톱 브라우저에서 열어 주세요" 안내 문구로 대체.
4) 외부 라이브러리·캔버스 차트 금지 — 기존 CSS 막대 스타일만 재사용.

완료 기준: node --check + ?v= 규칙 + (가능하면) 프리뷰 서버로 ?admin에서 버튼 → 보고서 DOM
스크린샷. 하지 말 것: 차트 라이브러리 추가, s-admin 외 화면/키오스크 흐름 변경.
```
