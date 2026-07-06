// tests/report.test.mjs — js/report.js 단위 테스트
// T0(R1)까지는 "동작 고정", T3(M1~M11)부터는 docs/t3-test-spec.md가 정의하는 "새 사양"이다.
// buildMonthlyReportSheets가 targetMonth를 받는 새 시그니처로 바뀌면서 T0의 R2~R8은
// (12개월 개요 시트 자체는 M7로 재정착했지만) 구조가 달라져 이 파일 전체를 재작성했다.
// R1(buildSnapshotSheets 2케이스)만 T0 그대로 유지 — 스냅샷 기능은 T3와 무관.
import assert from 'node:assert/strict';
import { buildSnapshotSheets, buildMonthlyReportSheets, defaultReportMonth } from '../js/report.js';

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
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06');
  assert.equal(sheets[0].name, '요약(2026.06)');
});

// ---- M2. 시트 구성·이름 ----
test('M2 시트 구성·이름', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['요약(2026.06)', '일별', '요일별', '시간대별', '12개월 개요', '모드별', '이용 퍼널'],
  );
});

test('M2 funnel 없는 stats → 6개, 이용 퍼널 없음, 오류 없음(D7)', () => {
  const noFunnel = { ...STATS_F };
  delete noFunnel.funnel;
  const sheets = buildMonthlyReportSheets(noFunnel, '2026-07-06', '2026-06');
  assert.equal(sheets.length, 6);
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

// ---- M7. 12개월 개요 — 기존 월별 분석 표 그대로 ----
test('M7 12개월 개요 — 기존 월별 분석 표 그대로(T0 R2·R3 재정착)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-06');
  const rows = sheetByName(sheets, '12개월 개요').rows;
  assert.deepEqual(rows[0], ['월', '총 생성', '전월 대비', '블록', '대화', '블록 비율', '가동일수', '가동일 평균', '최다 생성일', '최다 수']);

  const byLabel = (label) => rows.find((r) => r[0] === label);
  assert.equal(byLabel('2026.07 (진행 중)')[2], '진행 중');
  assert.equal(byLabel('2026.04')[2], '+25%'); // 여기는 문자열 유지(T5에서 변환)
  assert.equal(byLabel('2026.06')[2], '—'); // 직전 배열 항목이 2026-04 → 5월 갭
  assert.equal(byLabel('2026.03')[2], '—'); // 직전 배열 항목이 2025-06 → 갭(2026-03이 첫 완결월 아님)
});

// ---- M8. 모드별 — 해당 월 기준 ----
test('M8 모드별 — target 2026-04(미분류 있음)', () => {
  const sheets = buildMonthlyReportSheets(STATS_F, '2026-07-06', '2026-04');
  const rows = sheetByName(sheets, '모드별').rows;
  assert.deepEqual(rows, [
    ['모드', '생성 수', '비율'],
    ['블록', 25, '50%'],
    ['대화', 20, '40%'],
    ['미분류', 5, '10%'],
    ['합계', 50, '100%'],
  ]);
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
    ['모드', '생성 수', '비율'],
    ['블록', 0, '0%'],
    ['대화', 0, '0%'],
    ['합계', 0, '100%'],
  ]);
});

test('M10 완전 빈 stats — targetMonth 생략(default null), 예외 없음', () => {
  const sheets = buildMonthlyReportSheets({ report: [], dailyFull: [] }, '2026-07-06');
  assert.equal(sheets.length, 6); // funnel 없음
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

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
