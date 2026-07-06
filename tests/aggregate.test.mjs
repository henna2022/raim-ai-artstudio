// tests/aggregate.test.mjs — api/_aggregate.js 단위 테스트
// 명세: docs/t0-test-spec.md 1절 (A1~A8). 기대값은 명세를 그대로 전사한 것 — 임의 추가/변경 금지.
import assert from 'node:assert/strict';
import { aggregate, dayKey, weekKey, monthKey, windowStartISO, dayLabel, weekLabel, monthLabel } from '../api/_aggregate.js';

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

const U = (s) => Date.parse(s);

// ---- A1. KST 자정 경계 (핵심) ----
test('A1 KST 자정 경계', () => {
  const r1 = '2026-07-04T14:59:59Z'; // KST 07-04 23:59:59 토
  const r2 = '2026-07-04T15:00:00Z'; // KST 07-05 00:00 일
  const nowMs = U('2026-07-05T01:00:00Z'); // KST 07-05 10:00 일

  assert.equal(dayKey(Date.parse(r1)), '2026-07-04');
  assert.equal(dayKey(Date.parse(r2)), '2026-07-05');

  const rows = [{ created_at: r1, mode: null }, { created_at: r2, mode: null }];
  const s = aggregate(rows, nowMs);

  assert.equal(s.today, 1);
  assert.equal(s.thisWeek, 2);
  assert.equal(s.thisMonth, 2);
  assert.deepEqual(s.daily[0], { label: '07/05(일)', count: 1 });
  assert.deepEqual(s.daily[1], { label: '07/04(토)', count: 1 });
  assert.equal(s.hourly[23].count, 1);
  assert.equal(s.hourly[0].count, 1);
  for (let h = 0; h < 24; h++) {
    if (h === 0 || h === 23) continue;
    assert.equal(s.hourly[h].count, 0);
  }
  const wd = Object.fromEntries(s.weekday.map((w) => [w.label, w.count]));
  assert.equal(wd['토'], 1);
  assert.equal(wd['일'], 1);
});

// ---- A2. 주간 경계 = 월요일 시작 (일→월 전환) ----
test('A2 주간 경계 = 월요일 시작', () => {
  const rSun = '2026-07-05T14:50:00Z'; // KST 07-05 23:50 일
  const rMon = '2026-07-05T15:05:00Z'; // KST 07-06 00:05 월
  const nowMs = U('2026-07-05T15:10:00Z'); // KST 07-06 00:10 월

  assert.equal(weekKey(Date.parse(rSun)), '2026-06-29');
  assert.equal(weekKey(Date.parse(rMon)), '2026-07-06');

  const rows = [{ created_at: rSun, mode: null }, { created_at: rMon, mode: null }];
  const s = aggregate(rows, nowMs);

  assert.equal(s.today, 1);
  assert.equal(s.thisWeek, 1);
  assert.equal(s.thisMonth, 2);
  assert.deepEqual(s.weekly, [
    { label: '07/06~07/12', count: 1 },
    { label: '06/29~07/05', count: 1 },
  ]);
  assert.equal(weekLabel('2026-06-29'), '06/29~07/05');
});

// ---- A3. 연말·연초 경계 + windowStartISO ----
test('A3 연말·연초 경계 + windowStartISO', () => {
  const rNY = '2025-12-31T15:30:00Z'; // KST 2026-01-01 00:30 목

  assert.equal(dayKey(Date.parse(rNY)), '2026-01-01');
  assert.equal(monthKey(Date.parse(rNY)), '2026-01');
  assert.equal(weekKey(Date.parse(rNY)), '2025-12-29');
  assert.equal(weekLabel('2025-12-29'), '12/29~01/04');
  assert.equal(dayLabel('2026-01-01'), '01/01(목)');

  assert.equal(windowStartISO(Date.parse('2025-12-31T15:30:00Z'), 12), '2025-01-31T15:00:00.000Z');
  assert.equal(windowStartISO(Date.parse('2025-12-31T15:30:00Z'), 1), '2025-12-31T15:00:00.000Z');
  assert.equal(windowStartISO(Date.UTC(2026, 6, 5, 1, 0), 12), '2025-07-31T15:00:00.000Z');
});

// ---- A4. 잘못된 created_at 방어 ----
test('A4 잘못된 created_at 방어', () => {
  const rows = [
    { created_at: null, mode: 'blocks' },
    { created_at: undefined, mode: 'blocks' },
    { created_at: '', mode: 'blocks' },
    { created_at: 'garbage', mode: 'blocks' },
    { created_at: 0, mode: 'blocks' },
    { created_at: false, mode: 'blocks' },
    { created_at: '2026-07-01T03:00:00Z', mode: 'blocks' }, // ISO 문자열, 유효
    { created_at: Date.UTC(2026, 6, 1, 4, 0), mode: 'blocks' }, // 숫자 ms, 유효
  ];
  const nowMs = U('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);

  assert.equal(s.thisMonth, 2);
  assert.deepEqual(s.daily, [{ label: '07/01(수)', count: 2 }]);
  assert.equal(s.report.length, 1);
  assert.equal(s.report[0].total, 2);
});

// ---- A5. 13개월 입력 → report 12개 자르기 + dailyFull 정합 ----
test('A5 13개월 입력 → report 12개 자르기 + dailyFull 정합', () => {
  const months = [];
  let y = 2025, m = 6; // 2025-06 시작
  for (let i = 0; i < 13; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  const rows = months.map((mk) => ({ created_at: `${mk}-15T03:00:00Z`, mode: null }));
  const nowMs = U('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);

  assert.equal(s.report.length, 12);
  assert.equal(s.report[0].month, '2025-07');
  assert.equal(s.report[11].month, '2026-06');
  assert.equal(s.dailyFull.some((d) => d.month === '2025-06'), false);
  assert.equal(s.dailyFull.length, 12);

  const sumDaily = s.dailyFull.reduce((n, d) => n + d.count, 0);
  const sumReport = s.report.reduce((n, r) => n + r.total, 0);
  assert.equal(sumDaily, 12);
  assert.equal(sumReport, 12);
  assert.equal(s.monthly[0].label, '2026.06');
});

// ---- A6. 모드 집계 · blocksPct · avgActive · peak ----
test('A6(a) 모드 집계 · blocksPct · avgActive · peak', () => {
  const rows = [
    { created_at: '2026-06-10T05:00:00Z', mode: 'blocks' },
    { created_at: '2026-06-10T05:30:00Z', mode: 'blocks' },
    { created_at: '2026-06-11T05:00:00Z', mode: 'chat' },
    { created_at: '2026-06-11T06:00:00Z', mode: null },
    { created_at: '2026-06-20T05:00:00Z', mode: 'blocks' },
    { created_at: '2026-06-20T05:30:00Z', mode: 'chat' },
    { created_at: '2026-06-20T06:00:00Z', mode: 'weird' },
  ];
  const nowMs = U('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);
  const r0 = s.report[0];

  assert.equal(r0.total, 7);
  assert.equal(r0.blocks, 3);
  assert.equal(r0.chat, 2);
  assert.equal(r0.blocksPct, 43);
  assert.equal(r0.activeDays, 3);
  assert.equal(r0.avgActive, 2.3);
  assert.equal(r0.peakLabel, '06/20(토)');
  assert.equal(r0.peakCount, 3);
});

test('A6(b) peak 동률 → 먼저 등장한(오름차순 입력 시 더 이른) 날짜', () => {
  const rows = [
    { created_at: '2026-06-10T05:00:00Z', mode: 'blocks' },
    { created_at: '2026-06-10T05:30:00Z', mode: 'blocks' },
    { created_at: '2026-06-11T05:00:00Z', mode: 'chat' },
    { created_at: '2026-06-11T05:30:00Z', mode: 'chat' },
  ];
  const nowMs = U('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);
  assert.equal(s.report[0].peakLabel, '06/10(수)');
});

// ---- A7. 빈 입력 안전성 ----
test('A7 빈 입력 안전성', () => {
  const nowMs = U('2026-07-05T01:00:00Z');
  for (const input of [[], null]) {
    const s = aggregate(input, nowMs);
    assert.equal(s.today, 0);
    assert.equal(s.thisWeek, 0);
    assert.equal(s.thisMonth, 0);
    assert.deepEqual(s.daily, []);
    assert.deepEqual(s.weekly, []);
    assert.deepEqual(s.monthly, []);
    assert.deepEqual(s.report, []);
    assert.deepEqual(s.dailyFull, []);
    assert.equal(s.weekday.length, 7);
    assert.deepEqual(s.weekday.map((w) => w.label), ['월', '화', '수', '목', '금', '토', '일']);
    assert.ok(s.weekday.every((w) => w.count === 0));
    assert.equal(s.hourly.length, 24);
    assert.equal(s.hourly[0].label, '00시');
    assert.equal(s.hourly[23].label, '23시');
    assert.ok(s.hourly.every((h) => h.count === 0));
  }
});

// ---- A8. series 상한 (일별 14개) ----
test('A8 series 상한 (일별 14개)', () => {
  const rows = [];
  const start = Date.UTC(2026, 5, 21); // 2026-06-21
  for (let i = 0; i < 15; i++) {
    const d = new Date(start + i * 86400000);
    const ymd = d.toISOString().slice(0, 10);
    rows.push({ created_at: `${ymd}T03:00:00Z`, mode: null });
  }
  const nowMs = U('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);

  assert.equal(s.daily.length, 14);
  assert.equal(s.daily[0].label, '07/05(일)');
  assert.equal(s.daily.some((d) => d.label.startsWith('06/21')), false);
  assert.equal(s.dailyFull.length, 15);
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
