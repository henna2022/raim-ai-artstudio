// tests/report.test.mjs — js/report.js 단위 테스트
// T0(R1)까지는 "동작 고정", T3(M1~M11)부터는 docs/t3-test-spec.md가 정의하는 "새 사양"이다.
// buildMonthlyReportSheets가 targetMonth를 받는 새 시그니처로 바뀌면서 T0의 R2~R8은
// (12개월 개요 시트 자체는 M7로 재정착했지만) 구조가 달라져 이 파일 전체를 재작성했다.
// R1(buildSnapshotSheets 2케이스)만 T0 그대로 유지 — 스냅샷 기능은 T3와 무관.
import assert from 'node:assert/strict';
import { buildSnapshotSheets, buildMonthlyReportSheets, defaultReportMonth, buildInsights } from '../js/report.js';

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok - ' + name);
  } catch (e) {
    failures++;
    process.exitCode = 1;
    console.error('  FAIL - ' + name);
    console.error('    ' + ((e && e.stack) || e));
  }
}

function sheetByName(sheets, name) {
  const sheet = sheets.find((s) => s.name === name);
  assert.ok(sheet, `시트 '${name}' 없음`);
  return sheet;
}
function summarySheet(sheets) {
  const sheet = sheets.find((s) => s.name.startsWith('요약'));
  assert.ok(sheet, `요약 시트 없음 (이름들: ${sheets.map((s) => s.name).join(', ')})`);
  return sheet;
}
// 요약 시트는 행 순서가 아니라 [항목] 키로 조회한다 (t3-test-spec.md 지시)
const val = (sheet, name) => sheet.rows.find((r) => r[0] === name)?.[1];

// report 항목 fixture 헬퍼 — T3 필드(weekday/hourly) 포함해 시트가 읽는 필드를 전부 채운다
function reportEntry(o) {
  return {
    month: o.month,
    monthLabel: o.monthLabel ?? o.month,
    total: o.total,
    blocks: o.blocks ?? 0,
    chat: o.chat ?? 0,
    blocksPct: o.blocksPct ?? 0,
    activeDays: o.activeDays ?? 0,
    avgActive: o.avgActive ?? 0,
    peakLabel: o.peakLabel ?? '',
    peakCount: o.peakCount ?? 0,
    weekday: o.weekday ?? [],
    hourly: o.hourly ?? [],
  };
}

// ---- R1. (유지) buildSnapshotSheets — T0 그대로, 수정 금지 ----
test('R1 buildSnapshotSheets 기본', () => {
  const stats = {
    today: 5, thisWeek: 12, thisMonth: 40,
    daily: [{ label: '07/05(일)', count: 3 }, { label: '07/04(토)', count: 2 }],
    weekly: [{ label: '06/29~07/05', count: 9 }],
    monthly: [{ label: '2026.07', count: 40 }],
  };
  const sheets = buildSnapshotSheets(stats, '2026-07-06 00:10');

  assert.deepEqual(sheets.map((s) => s.name), ['요약', '일별', '주별', '월별']);

  const sumRows = sheetByName(sheets, '요약').rows;
  assert.deepEqual(sumRows[1], ['오늘', 5]);
  assert.deepEqual(sumRows[4], []);
  assert.deepEqual(sumRows[5], ['내보낸 시각', '2026-07-06 00:10 (KST)']);

  const dailyRows = sheetByName(sheets, '일별').rows;
  assert.deepEqual(dailyRows[0], ['날짜', '생성 수']);
  assert.deepEqual(dailyRows[1], ['07/05(일)', 3]);
});

test('R1 buildSnapshotSheets 결손 방어', () => {
  const sheets = buildSnapshotSheets({}, 'x');
  const sumRows = sheetByName(sheets, '요약').rows;
  assert.deepEqual(sumRows[1], ['오늘', 0]);
  assert.deepEqual(sumRows[2], ['이번 주', 0]);
  assert.deepEqual(sumRows[3], ['이번 달', 0]);
  assert.equal(sheetByName(sheets, '일별').rows.length, 1);
  assert.equal(sheetByName(sheets, '주별').rows.length, 1);
  assert.equal(sheetByName(sheets, '월별').rows.length, 1);
});

// =====================================================================
// buildMonthlyReportSheets(stats, nowYmd, targetMonth) — T3 (M1~M11)
// =====================================================================

// 공통 fixture STATS_F (nowYmd = '2026-07-06')
const JUNE_WEEKDAY = [
  { label: '월', count: 5, activeDays: 2, avg: 2.5 },
  { label: '화', count: 8, activeDays: 2, avg: 4 },
  { label: '수', count: 0, activeDays: 0, avg: 0 },
  { label: '목', count: 0, activeDays: 0, avg: 0 },
  { label: '금', count: 0, activeDays: 0, avg: 0 },
  { label: '토', count: 20, activeDays: 2, avg: 10 },
  { label: '일', count: 12, activeDays: 3, avg: 4 },
];
const JUNE_HOURLY = Array.from({ length: 24 }, (_, h) => {
  const label = String(h).padStart(2, '0') + '시';
  if (h === 14) return { label, count: 30, share: 67 };
  if (h === 20) return { label, count: 15, share: 33 };
  return { label, count: 0, share: 0 };
});

const STATS_F = {
  // top-level weekday/hourly는 buildMonthlyReportSheets가 더 이상 참조하지 않는다(월별 분해로 대체).
  // M6에서 entry.weekday/hourly와 확실히 구분되도록 일부러 다른(터무니없이 큰) 값을 넣어둔다.
  weekday: [
    { label: '월', count: 999, activeDays: 50, avg: 20 },
    { label: '화', count: 0, activeDays: 0, avg: 0 },
    { label: '수', count: 0, activeDays: 0, avg: 0 },
    { label: '목', count: 0, activeDays: 0, avg: 0 },
    { label: '금', count: 0, activeDays: 0, avg: 0 },
    { label: '토', count: 0, activeDays: 0, avg: 0 },
    { label: '일', count: 0, activeDays: 0, avg: 0 },
  ],
  hourly: [],
  report: [
    reportEntry({ month: '2025-06', monthLabel: '2025.06', total: 30 }), // 전년 동월 검증용
    reportEntry({ month: '2026-03', monthLabel: '2026.03', total: 40, blocks: 30, chat: 10 }),
    reportEntry({ month: '2026-04', monthLabel: '2026.04', total: 50, blocks: 25, chat: 20 }), // 미분류 5
    reportEntry({
      month: '2026-06', monthLabel: '2026.06', total: 45, blocks: 20, chat: 25,
      activeDays: 9, avgActive: 5, peakLabel: '06/20(토)', peakCount: 8,
      weekday: JUNE_WEEKDAY, hourly: JUNE_HOURLY,
    }),
    reportEntry({ month: '2026-07', monthLabel: '2026.07', total: 9, blocks: 5, chat: 4 }), // 진행 중인 달
  ],
  dailyFull: [
    { date: '2026-06-05', label: '06/05(금)', month: '2026-06', count: 10 },
    { date: '2026-06-12', label: '06/12(금)', month: '2026-06', count: 12 },
    { date: '2026-06-20', label: '06/20(토)', month: '2026-06', count: 8 },
    { date: '2026-06-27', label: '06/27(토)', month: '2026-06', count: 15 }, // 합 45
    { date: '2026-07-01', label: '07/01(수)', month: '2026-07', count: 5 },
    { date: '2026-07-02', label: '07/02(목)', month: '2026-07', count: 4 },
  ],
  funnel: {
    visits: 20, modeSelects: 15, ok: 9, blocked: 1, error: 0, blockRate: 10, perSession: 0.5,
    monthly: [
      { month: '2026-06', monthLabel: '2026.06', visits: 80, modeSelects: 70, ok: 45, blocked: 5, error: 2, blockRate: 10, perSession: 0.7 },
      { month: '2026-07', monthLabel: '2026.07', visits: 20, modeSelects: 15, ok: 9, blocked: 1, error: 0, blockRate: 10, perSession: 0.5 },
    ],
  },
};

// ---- M1. defaultReportMonth ----
test('M1 defaultReportMonth', () => {
  assert.equal(defaultReportMonth(STATS_F.report, '2026-07-06'), '2026-06'); // 최신 완결월(2026-07 제외)
  assert.equal(
    defaultReportMonth([reportEntry({ month: '2026-07', monthLabel: '2026.07', total: 9 })], '2026-07-06'),
    '2026-07', // 완결월 없으면 진행 중인 달
  );
  assert.equal(defaultReportMonth([], '2026-07-06'), null);

  // buildMonthlyReportSheets 3번째 인자 생략 시 위 규칙으로 동작(D6)
  // T4: '핵심 요약'이 sheets[0]으로 삽입되어 '요약(...)'은 sheets[1]로 밀림(시트 인덱스 참조만 갱신)
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06');
  assert.equal(sheets[1].name, '요약(2026.06)');
});

// ---- M2. 시트 구성·이름 ----
// T4: '핵심 요약'이 맨 앞에 삽입되어 시트 이름 목록·개수가 바뀜(허용된 갱신 범위)
test('M2 시트 구성·이름', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['핵심 요약', '요약(2026.06)', '일별', '요일별', '시간대별', '12개월 개요', '모드별', '이용 퍼널'],
  );
});

test('M2 funnel 없는 stats → 7개, 이용 퍼널 없음, 오류 없음(D7)', () => {
  const noFunnel = { ...STATS_F };
  delete noFunnel.funnel;
  const sheets = buildMonthlyReportSheets(noFunnel, '2026-07-06', '2026-06');
  assert.equal(sheets.length, 7);
  assert.ok(!sheets.some((s) => s.name === '이용 퍼널'));
});

// ---- M3. 요약 — 완결월(2026-06) ----
test('M3 요약 — 완결월(2026-06)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const sum = summarySheet(sheets);

  assert.equal(val(sum, '총 생성'), 45);
  assert.equal(val(sum, '전월 대비(%)'), '—'); // 직전 배열 항목이 2026-04 = 5월 갭
  assert.equal(val(sum, '전년 동월 총 생성'), 30); // 2025-06 존재(D3)
  assert.equal(val(sum, '블록'), 20);
  assert.equal(val(sum, '대화'), 25);
  assert.equal(val(sum, '미분류'), 45 - 20 - 25);
  assert.equal(val(sum, '가동일수'), 9);
  assert.equal(val(sum, '가동일 평균'), 5);
  assert.equal(val(sum, '최다 생성일'), '06/20(토)');
  assert.equal(val(sum, '최다 수'), 8);
  assert.equal(val(sum, '대상 월'), '2026.06');
  assert.equal(sum.rows.some((r) => r[0] === '월말 예상(단순 추정)'), false); // 완결월엔 없음
});

test('M3 요약 — target 2026-04 (전월 대비 숫자, 전년 동월 없음)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-04');
  const sum = summarySheet(sheets);
  assert.equal(val(sum, '전월 대비(%)'), 25); // 숫자 25(문자열 '+25%' 아님, D2)
  assert.equal(typeof val(sum, '전월 대비(%)'), 'number');
  assert.equal(val(sum, '전년 동월 총 생성'), '—'); // 2025-04 없음
});

// ---- M4. 요약 — 진행 중인 달(2026-07) ----
test('M4 요약 — 진행 중인 달(2026-07)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-07');
  const sum = summarySheet(sheets);
  assert.equal(val(sum, '대상 월'), '2026.07 (진행 중)');
  assert.equal(val(sum, '전월 대비(%)'), '진행 중');
  // 경과일수=6(nowYmd.slice(8,10)), 그달일수=31 → 9/6*31=46.5 → 47 (반올림 경계)
  assert.equal(val(sum, '월말 예상(단순 추정)'), 47);
});

// ---- M5. 일별 — 해당 월만 + 월 누적 ----
test('M5 일별 — 해당 월만(2026-06) + 월 누적', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const daily = sheetByName(sheets, '일별');
  assert.deepEqual(daily.rows[0], ['날짜', '생성 수', '월 누적']);
  assert.equal(daily.rows.length, 5); // 헤더 + 6월 4행(7월 날짜 없음)

  const cum = daily.rows.slice(1).map((r) => r[2]);
  assert.deepEqual(cum, [10, 22, 30, 45]);
  assert.equal(cum[cum.length - 1], val(summarySheet(sheets), '총 생성')); // 마지막 누적 === 요약 총 생성
});

// ---- M6. 요일별/시간대별 — 월 단위 분해 사용(top-level 아님) ----
test('M6 요일별/시간대별 — entry.weekday/hourly 사용(top-level과 구분)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');

  const wd = sheetByName(sheets, '요일별');
  assert.deepEqual(wd.rows[0], ['요일', '생성 수', '가동일수', '가동일 평균']);
  assert.deepEqual(wd.rows[1], ['월', 5, 2, 2.5]); // entry(JUNE_WEEKDAY) 값 — top-level(999)과 다름
  assert.deepEqual(wd.rows[6], ['토', 20, 2, 10]);
  assert.notEqual(wd.rows[1][1], STATS_F.weekday[0].count); // top-level(999)과 확실히 다름

  const hr = sheetByName(sheets, '시간대별');
  assert.deepEqual(hr.rows[0], ['시간대', '생성 수', '비율(%)']);
  const row14 = hr.rows.find((r) => r[0] === '14시');
  assert.deepEqual(row14, ['14시', 30, 67]);
  assert.equal(typeof row14[2], 'number'); // 비율(%) 숫자 셀
});

// ---- M7. 12개월 개요 — 기존 월별 분석 표, T5: 전월 대비·블록 비율 숫자 셀 ----
test('M7 12개월 개요 — 전월 대비·블록 비율 숫자 셀(T5)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const rows = sheetByName(sheets, '12개월 개요').rows;
  assert.deepEqual(rows[0], ['월', '총 생성', '전월 대비(%)', '블록', '대화', '블록 비율(%)', '가동일수', '가동일 평균', '최다 생성일', '최다 수']);

  const byLabel = (label) => rows.find((r) => r[0] === label);
  assert.equal(byLabel('2026.07 (진행 중)')[2], ''); // 진행 중 → 빈 문자열(라벨의 "(진행 중)"은 유지)
  assert.equal(byLabel('2026.04')[2], 25); // 숫자 25(문자열 '+25%' 아님, T5)
  assert.equal(byLabel('2026.06')[2], ''); // 갭(직전 배열 항목 2026-04) → 빈 문자열
  assert.equal(byLabel('2026.03')[2], ''); // 갭(직전 배열 항목 2025-06) → 빈 문자열
  assert.equal(typeof byLabel('2026.04')[2], 'number');
  assert.equal(typeof byLabel('2026.06')[5], 'number'); // 블록 비율(%) 숫자 셀
});

// ---- M8. 모드별 — 해당 월 기준, T5: 비율 숫자 셀 ----
test('M8 모드별 — target 2026-04(미분류 있음), 비율 숫자 셀(T5)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-04');
  const rows = sheetByName(sheets, '모드별').rows;
  assert.deepEqual(rows, [
    ['모드', '생성 수', '비율(%)'],
    ['블록', 25, 50],
    ['대화', 20, 40],
    ['미분류', 5, 10],
    ['합계', 50, 100],
  ]);
  rows.slice(1).forEach((r) => assert.equal(typeof r[2], 'number'));
});

test('M8 모드별 — target 2026-06(blocks+chat=total, 미분류 없음)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const rows = sheetByName(sheets, '모드별').rows;
  assert.equal(rows.length, 4); // 헤더+블록+대화+합계
});

// ---- M9. 이용 퍼널 ----
test('M9 이용 퍼널 — target 2026-06', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const rows = sheetByName(sheets, '이용 퍼널').rows;
  assert.deepEqual(rows, [
    ['항목', '값'],
    ['방문', 80], ['모드 선택', 70], ['생성 성공', 45], ['차단', 5], ['오류', 2],
    ['차단율(%)', 10], ['세션당 시도', 0.7],
  ]);
  rows.slice(1).forEach((r) => assert.equal(typeof r[1], 'number'));
});

test('M9 funnel은 있는데 monthly에 target 월이 없으면 전부 0', () => {
  const f2 = { ...STATS_F, funnel: { ...STATS_F.funnel, monthly: STATS_F.funnel.monthly.filter((m) => m.month !== '2026-06') } };
  const sheets = buildMonthlyReportSheets(f2, '2026-07-06', '2026-06');
  const rows = sheetByName(sheets, '이용 퍼널').rows;
  rows.slice(1).forEach((r) => assert.equal(r[1], 0));
});

// ---- M10. 갭/빈 데이터 안전성(D4) ----
test('M10 갭 — target이 report에 없는 달(2026-05)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-05');
  const sum = summarySheet(sheets);
  assert.equal(val(sum, '총 생성'), 0);
  assert.equal(val(sum, '전월 대비(%)'), '—');
  assert.equal(val(sum, '최다 생성일'), '—');
  assert.equal(sheetByName(sheets, '일별').rows.length, 1);
  assert.equal(sheetByName(sheets, '요일별').rows.length, 1);
  assert.equal(sheetByName(sheets, '시간대별').rows.length, 1);
  assert.deepEqual(sheetByName(sheets, '모드별').rows, [
    ['모드', '생성 수', '비율(%)'],
    ['블록', 0, 0],
    ['대화', 0, 0],
    ['합계', 0, 100],
  ]);
});

test('M10 완전 빈 stats — targetMonth 생략(default null), 예외 없음', () => {
  const sheets = buildMonthlyReportSheets({ report: [], dailyFull: [] }, '2026-07-06');
  assert.equal(sheets.length, 7); // funnel 없음 (T4: '핵심 요약' 삽입으로 6→7, 시트 인덱스/개수 참조 갱신)
  const sum = summarySheet(sheets);
  assert.equal(val(sum, '총 생성'), 0);
  assert.equal(val(sum, '전월 대비(%)'), '—');
  assert.equal(sheetByName(sheets, '일별').rows.length, 1);
  assert.equal(sheetByName(sheets, '요일별').rows.length, 1);
  assert.equal(sheetByName(sheets, '시간대별').rows.length, 1);
});

// ---- M11. 시트 간 총계 정합 ----
test('M11 시트 간 총계 정합(2026-06) — 요약=일별합=모드별합계=12개월개요행, 전부 45', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const summaryTotal = val(summarySheet(sheets), '총 생성');
  const dailySum = sheetByName(sheets, '일별').rows.slice(1).reduce((n, r) => n + r[1], 0);
  const modeTotal = sheetByName(sheets, '모드별').rows.find((r) => r[0] === '합계')[1];
  const overviewTotal = sheetByName(sheets, '12개월 개요').rows.find((r) => r[0] === '2026.06')[1];

  assert.equal(summaryTotal, 45);
  assert.equal(dailySum, 45);
  assert.equal(modeTotal, 45);
  assert.equal(overviewTotal, 45);
});

// =====================================================================
// buildInsights(stats, targetMonth, nowMonth) + '핵심 요약' 시트 — T4
// =====================================================================

// ---- 기본 동작: 최다/최저 월 · 최다 요일 · 피크 시간대 (target 2026-06, STATS_F) ----
test('T4 buildInsights 기본 — 최다/최저 월·최다 요일·피크 시간대', () => {
  const insights = buildInsights(STATS_F, '2026-06', '2026-07');
  assert.deepEqual(insights, [
    '최다 생성 달: 2026.04(50건)',
    '최저 생성 달: 2025.06(30건)',
    '최다 생성 요일: 토요일(평균 10건)',
    '피크 시간대: 14시(30건)',
  ]);
  // 2026-06의 직전 배열 항목은 2026-04(5월 갭) → 전월 대비 문장 없음, blocks+chat=total → 미분류 문장 없음
});

// ---- 미분류 안내 문구 (target 2026-04, STATS_F: blocks25+chat20≠total50) ----
test('T4 buildInsights — 미분류 안내 문구', () => {
  const insights = buildInsights(STATS_F, '2026-04', '2026-07');
  assert.ok(insights.includes('모드 미기록 5건 포함(전체의 10%)'));
});

// ---- ±10% 정확 경계: 정확히 10%도 "증가/감소" 언급에 포함(D2 아님, T4 결정) ----
test('T4 buildInsights — 전월 대비 ±10% 정확 경계', () => {
  const rf = (month, total) => ({ month, monthLabel: month.replace('-', '.'), total, blocks: 0, chat: 0, weekday: [], hourly: [] });

  // 정확히 +10% → "증가" 언급 (미만이 아니라 이상 — 정확 경계 포함)
  const up10 = { report: [rf('2026-05', 100), rf('2026-06', 110)] };
  assert.ok(buildInsights(up10, '2026-06', '2026-07').includes('직전월 대비 증가(+10%)'));

  // 정확히 -10% → "감소" 언급
  const down10 = { report: [rf('2026-05', 100), rf('2026-06', 90)] };
  assert.ok(buildInsights(down10, '2026-06', '2026-07').includes('직전월 대비 감소(-10%)'));

  // 9% (미만) → "비슷한 수준" (증가/감소 언급 없음) — 경계 대조군
  const up9 = { report: [rf('2026-05', 100), rf('2026-06', 109)] };
  const insightsUp9 = buildInsights(up9, '2026-06', '2026-07');
  assert.ok(insightsUp9.includes('직전월과 비슷한 수준'));
  assert.ok(!insightsUp9.some((line) => line.includes('증가') || line.includes('감소')));
});

// ---- 동률: 완결월 중 최다가 동률이면 최근 것 ----
test('T4 buildInsights — 최다 월 동률이면 최근 것', () => {
  const rf = (month, total) => ({ month, monthLabel: month.replace('-', '.'), total, blocks: 0, chat: 0, weekday: [], hourly: [] });
  // 2026-04·2026-05 둘 다 total 50으로 동률(최다), 2026-06(20)이 최저
  const stats = { report: [rf('2026-04', 50), rf('2026-05', 50), rf('2026-06', 20)] };
  const insights = buildInsights(stats, '2026-06', '2026-07');
  assert.ok(insights.includes('최다 생성 달: 2026.05(50건)')); // 동률 중 더 최근인 05
  assert.ok(insights.includes('최저 생성 달: 2026.06(20건)'));
});

// ---- 2개월 미만: 비교 문장 전부 생략 + '데이터 누적 중' 한 줄만 ----
test('T4 buildInsights — 데이터 2개월 미만이면 데이터 누적 중만', () => {
  const rf = (month, total) => ({ month, monthLabel: month.replace('-', '.'), total, blocks: 0, chat: 0, weekday: [], hourly: [] });
  assert.deepEqual(buildInsights({ report: [rf('2026-07', 9)] }, '2026-07', '2026-07'), ['데이터 누적 중']);
  assert.deepEqual(buildInsights({ report: [] }, null, '2026-07'), ['데이터 누적 중']);
});

// ---- 인접 시간대 병합: 상위 2개 시간대가 인접하면 "14~15시" 형태로 병합 ----
test('T4 buildInsights — 인접 시간대 병합(14~15시)', () => {
  const hourly = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, '0') + '시', count: 0, share: 0 }));
  hourly[14] = { label: '14시', count: 10, share: 56 };
  hourly[15] = { label: '15시', count: 8, share: 44 };
  const rf = (month, total, extra) => ({ month, monthLabel: month.replace('-', '.'), total, blocks: 0, chat: 0, weekday: [], hourly: [], ...extra });
  const stats = { report: [rf('2026-05', 3), rf('2026-06', 18, { hourly })] };
  const insights = buildInsights(stats, '2026-06', '2026-07');
  assert.ok(insights.includes('피크 시간대: 14~15시(10건)'));
});

// ---- '핵심 요약' 시트 — sheets[0], 생성 시각(stampText 주입)·데이터 범위 포함 ----
test('T4 핵심 요약 시트 — sheets[0], 생성 시각/데이터 범위', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06', '2026-07-06 12:00');
  assert.equal(sheets[0].name, '핵심 요약');
  const rows = sheets[0].rows;
  assert.deepEqual(rows[0], ['항목', '내용']);
  assert.ok(rows.some((r) => r[1] === '최다 생성 달: 2026.04(50건)'));
  assert.deepEqual(rows.find((r) => r[0] === '생성 시각'), ['생성 시각', '2026-07-06 12:00 (KST)']);
  assert.deepEqual(rows.find((r) => r[0] === '데이터 범위'), ['데이터 범위', '2025.06 ~ 2026.07']);
});

test('T4 핵심 요약 시트 — stampText 없으면 생성 시각 행 생략(Date 접근 없음 확인)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const rows = sheets[0].rows;
  assert.ok(!rows.some((r) => r[0] === '생성 시각'));
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
