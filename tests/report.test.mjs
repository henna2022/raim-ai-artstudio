// tests/report.test.mjs — js/report.js 단위 테스트
// 명세: docs/t0-test-spec.md 2절 (R1~R8). 기대값은 명세를 그대로 전사한 것 — 임의 추가/변경 금지.
import assert from 'node:assert/strict';
import { buildSnapshotSheets, buildMonthlyReportSheets } from '../js/report.js';
import { aggregate } from '../api/_aggregate.js';

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

// report 항목 fixture 헬퍼 — 시트가 읽는 필드를 전부 채운다
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
  };
}

// ---- R1. buildSnapshotSheets(stats, stampText) ----
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

// ---- R2. 진행 중인 달 표기 ----
test('R2 진행 중인 달 표기', () => {
  const report = [
    reportEntry({ month: '2026-06', monthLabel: '2026.06', total: 60 }),
    reportEntry({ month: '2026-07', monthLabel: '2026.07', total: 9 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull: [], weekday: [], hourly: [] }, '2026-07-06');
  const rows = sheetByName(sheets, '월별 분석').rows;

  assert.equal(rows[1][0], '2026.06');
  assert.equal(rows[2][0], '2026.07 (진행 중)');
  assert.equal(rows[2][2], '진행 중');
});

// ---- R3. 전월 대비(momPct) 매트릭스 ----
test('R3 전월 대비(momPct) 매트릭스', () => {
  const report = [
    reportEntry({ month: '2026-03', monthLabel: '2026.03', total: 40 }),
    reportEntry({ month: '2026-04', monthLabel: '2026.04', total: 50 }),
    reportEntry({ month: '2026-06', monthLabel: '2026.06', total: 45 }),
    reportEntry({ month: '2026-07', monthLabel: '2026.07', total: 30 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull: [], weekday: [], hourly: [] }, '2026-08-01');
  const rows = sheetByName(sheets, '월별 분석').rows;

  assert.equal(rows[1][2], '—'); // 2026-03: 첫 항목
  assert.equal(rows[2][2], '+25%'); // 2026-04: 직전 항목이 진짜 전월
  assert.equal(rows[3][2], '—'); // 2026-06: 직전 항목이 2026-04 (5월 갭)
  assert.equal(rows[4][2], '-33%'); // 2026-07: (30-45)/45
});

test('R3 momPct 방어 분기 — 신규', () => {
  // aggregate() 경유로는 total 0인 달이 report에 실릴 수 없음(행이 있어야 달이 생김) —
  // 손으로 만든 stats에서만 도달하는 방어 분기 검증
  const report = [
    reportEntry({ month: '2026-01', monthLabel: '2026.01', total: 0 }),
    reportEntry({ month: '2026-02', monthLabel: '2026.02', total: 5 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull: [], weekday: [], hourly: [] }, '2026-08-01');
  const rows = sheetByName(sheets, '월별 분석').rows;
  assert.equal(rows[2][2], '신규');
});

// ---- R4. 일별 추이 — 월 누적 리셋 ----
test('R4 일별 추이 — 월 누적 리셋', () => {
  const dailyFull = [
    { date: '2026-06-29', label: '06/29(월)', month: '2026-06', count: 2 },
    { date: '2026-06-30', label: '06/30(화)', month: '2026-06', count: 3 },
    { date: '2026-07-01', label: '07/01(수)', month: '2026-07', count: 4 },
    { date: '2026-07-02', label: '07/02(목)', month: '2026-07', count: 1 },
  ];
  const report = [
    reportEntry({ month: '2026-06', monthLabel: '2026.06', total: 5 }),
    reportEntry({ month: '2026-07', monthLabel: '2026.07', total: 5 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull, weekday: [], hourly: [] }, '2026-07-06');
  const rows = sheetByName(sheets, '일별 추이').rows;
  const cum = rows.slice(1).map((r) => r[2]);
  assert.deepEqual(cum, [2, 5, 4, 5]);

  // 각 월 마지막 누적 === 월별 분석의 해당 월 total
  const monthRows = sheetByName(sheets, '월별 분석').rows;
  assert.equal(cum[1], monthRows[1][1]); // 6월 마지막 누적 === 6월 total
  assert.equal(cum[3], monthRows[2][1]); // 7월 마지막 누적 === 7월 total
});

// ---- R5. 모드별 시트 — 미분류 행 조건부 ----
test('R5(a) 모드별 시트 — 미분류 포함', () => {
  const report = [
    reportEntry({ month: '2026-06', total: 60, blocks: 40, chat: 15 }),
    reportEntry({ month: '2026-07', total: 9, blocks: 5, chat: 4 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull: [], weekday: [], hourly: [] }, '2026-07-06');
  const rows = sheetByName(sheets, '모드별').rows;

  assert.deepEqual(rows[1], ['블록', 45, '65%']);
  assert.deepEqual(rows[2], ['대화', 19, '28%']);
  assert.deepEqual(rows[3], ['미분류', 5, '7%']);
  assert.deepEqual(rows[4], ['합계', 69, '100%']);
});

test('R5(b) 모드별 시트 — 미분류 없음', () => {
  const report = [
    reportEntry({ month: '2026-06', total: 60, blocks: 40, chat: 20 }),
    reportEntry({ month: '2026-07', total: 10, blocks: 6, chat: 4 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull: [], weekday: [], hourly: [] }, '2026-07-06');
  const rows = sheetByName(sheets, '모드별').rows;
  assert.equal(rows.length, 4); // 헤더+블록+대화+합계
});

// ---- R6. 빈 stats ----
test('R6 빈 stats', () => {
  const sheets = buildMonthlyReportSheets({ report: [], dailyFull: [], weekday: [], hourly: [] }, '2026-07-06');

  assert.deepEqual(sheets.map((s) => s.name), ['월별 분석', '일별 추이', '요일별', '시간대별', '모드별']);
  assert.equal(sheetByName(sheets, '월별 분석').rows.length, 1);
  assert.equal(sheetByName(sheets, '일별 추이').rows.length, 1);
  assert.equal(sheetByName(sheets, '요일별').rows.length, 1);
  assert.equal(sheetByName(sheets, '시간대별').rows.length, 1);

  const modeRows = sheetByName(sheets, '모드별').rows;
  assert.deepEqual(modeRows, [
    ['모드', '생성 수', '비율'],
    ['블록', 0, '0%'],
    ['대화', 0, '0%'],
    ['합계', 0, '100%'],
  ]);
});

// ---- R7. 통합 정합 (aggregate → report, 삼중 정합 불변식) ----
test('R7 통합 정합 (aggregate → report, 삼중 정합)', () => {
  // A5(13개월) + A6(혼합 모드) 스타일: 13개월 × 4건(blocks 2 + chat 1 + null 1)
  const rows = [];
  let y = 2025, m = 8;
  for (let i = 0; i < 13; i++) {
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    rows.push({ created_at: `${mk}-10T05:00:00Z`, mode: 'blocks' });
    rows.push({ created_at: `${mk}-10T05:30:00Z`, mode: 'blocks' });
    rows.push({ created_at: `${mk}-20T05:00:00Z`, mode: 'chat' });
    rows.push({ created_at: `${mk}-25T05:00:00Z`, mode: null });
    m++; if (m > 12) { m = 1; y++; }
  }
  const nowMs = Date.parse('2026-08-25T05:00:00Z'); // 마지막 달(2026-08) 내부 시각
  const s = aggregate(rows, nowMs);
  const sheets = buildMonthlyReportSheets(s, '2026-08-25');

  const trendSum = sheetByName(sheets, '일별 추이').rows.slice(1).reduce((n, r) => n + r[1], 0);
  const modeTotal = sheetByName(sheets, '모드별').rows.find((r) => r[0] === '합계')[1];
  const monthSum = sheetByName(sheets, '월별 분석').rows.slice(1).reduce((n, r) => n + r[1], 0);

  assert.equal(trendSum, modeTotal);
  assert.equal(modeTotal, monthSum);
  assert.equal(monthSum, 12 * 4); // 13개월 중 최초 1개월 탈락, 나머지 12개월 × 4건
});

// ---- R8. 셀 타입 고정 (T5 전까지의 현재 사양) ----
test('R8 셀 타입 고정', () => {
  const report = [
    reportEntry({ month: '2026-03', monthLabel: '2026.03', total: 40, blocks: 20, chat: 10, blocksPct: 50, activeDays: 3, avgActive: 2.3, peakLabel: '01/01(목)', peakCount: 2 }),
    reportEntry({ month: '2026-04', monthLabel: '2026.04', total: 50, blocks: 25, chat: 10, blocksPct: 50, activeDays: 3, avgActive: 2.3, peakLabel: '01/01(목)', peakCount: 2 }),
  ];
  const sheets = buildMonthlyReportSheets({ report, dailyFull: [], weekday: [], hourly: [] }, '2026-08-01');
  const monthRows = sheetByName(sheets, '월별 분석').rows;

  // [라벨, 총생성, 전월대비, 블록, 대화, 블록비율, 가동일수, 가동일평균, 최다생성일, 최다수]
  assert.equal(typeof monthRows[1][1], 'number'); // 총 생성
  assert.equal(typeof monthRows[1][6], 'number'); // 가동일수
  assert.equal(typeof monthRows[1][9], 'number'); // 최다 수
  assert.equal(typeof monthRows[1][5], 'string'); // 블록 비율(%)
  assert.equal(typeof monthRows[2][2], 'string'); // 전월 대비

  const modeRows = sheetByName(sheets, '모드별').rows;
  assert.equal(typeof modeRows[1][1], 'number'); // 모드별 생성 수
  assert.equal(typeof modeRows[1][2], 'string'); // 모드별 비율
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
