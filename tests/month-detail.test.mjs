// tests/month-detail.test.mjs — api/_aggregate.js의 report[] 월별 weekday/hourly 분해 (T3)
// 명세: docs/t3-test-spec.md 1절 (G1~G2). 기대값은 명세를 그대로 전사한 것 — 임의 추가/변경 금지.
// tests/aggregate.test.mjs(T0 고정본)는 건드리지 않고 새 파일로 추가.
import assert from 'node:assert/strict';
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

function wdOf(entry, label) {
  return entry.weekday.find((w) => w.label === label);
}
function hrOf(entry, label) {
  return entry.hourly.find((h) => h.label === label);
}

// ---- G1. 월별 weekday 분해 ----
test('G1 월별 weekday 분해', () => {
  // 2026-06-01/06-08 = 월요일, 2026-06-02 = 화요일, 2026-07-01 = 수요일
  // (2026-07-06=월요일 앵커에서 역산; t3-test-spec.md 명시)
  const rows = [
    { created_at: '2026-06-01T03:00:00Z', mode: null },
    { created_at: '2026-06-01T03:10:00Z', mode: null },
    { created_at: '2026-06-01T03:20:00Z', mode: null },
    { created_at: '2026-06-02T03:00:00Z', mode: null },
    { created_at: '2026-06-02T03:10:00Z', mode: null },
    { created_at: '2026-06-02T03:20:00Z', mode: null },
    { created_at: '2026-06-02T03:30:00Z', mode: null },
    { created_at: '2026-06-08T03:00:00Z', mode: null },
    { created_at: '2026-06-08T03:10:00Z', mode: null },
    { created_at: '2026-06-08T03:20:00Z', mode: null },
    { created_at: '2026-07-01T03:00:00Z', mode: null },
    { created_at: '2026-07-01T03:10:00Z', mode: null },
    { created_at: '2026-07-01T03:20:00Z', mode: null },
    { created_at: '2026-07-01T03:30:00Z', mode: null },
    { created_at: '2026-07-01T03:40:00Z', mode: null },
  ];
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);

  const june = s.report.find((r) => r.month === '2026-06');
  const july = s.report.find((r) => r.month === '2026-07');
  assert.ok(june, '2026-06 report 항목 없음');
  assert.ok(july, '2026-07 report 항목 없음');

  assert.deepEqual(wdOf(june, '월'), { label: '월', count: 6, activeDays: 2, avg: 3 });
  assert.deepEqual(wdOf(june, '화'), { label: '화', count: 4, activeDays: 1, avg: 4 });
  for (const lbl of ['수', '목', '금', '토', '일']) {
    assert.deepEqual(wdOf(june, lbl), { label: lbl, count: 0, activeDays: 0, avg: 0 });
  }
  // 7월 데이터가 6월 분해에 섞이지 않음
  assert.deepEqual(wdOf(july, '수'), { label: '수', count: 5, activeDays: 1, avg: 5 });
  for (const lbl of ['월', '화', '목', '금', '토', '일']) {
    assert.deepEqual(wdOf(july, lbl), { label: lbl, count: 0, activeDays: 0, avg: 0 });
  }

  // top-level weekday(12개월 총합)는 기존 형태 그대로 — T2 회귀 없음
  const wdTop = Object.fromEntries(s.weekday.map((w) => [w.label, w.count]));
  assert.equal(wdTop['월'], 6);
  assert.equal(wdTop['화'], 4);
  assert.equal(wdTop['수'], 5);
});

// ---- G2. 월별 hourly 분해 + share ----
test('G2 월별 hourly 분해 + share', () => {
  const rows = [
    // 2026-06: 14시(KST) 6건
    { created_at: '2026-06-10T05:00:00Z', mode: null },
    { created_at: '2026-06-10T05:05:00Z', mode: null },
    { created_at: '2026-06-11T05:00:00Z', mode: null },
    { created_at: '2026-06-11T05:05:00Z', mode: null },
    { created_at: '2026-06-12T05:00:00Z', mode: null },
    { created_at: '2026-06-12T05:05:00Z', mode: null },
    // 2026-06: 10시(KST) 4건
    { created_at: '2026-06-15T01:00:00Z', mode: null },
    { created_at: '2026-06-15T01:05:00Z', mode: null },
    { created_at: '2026-06-16T01:00:00Z', mode: null },
    { created_at: '2026-06-16T01:05:00Z', mode: null },
    // 2026-07: 14시 1건
    { created_at: '2026-07-01T05:00:00Z', mode: null },
  ];
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);

  const june = s.report.find((r) => r.month === '2026-06');
  const july = s.report.find((r) => r.month === '2026-07');

  assert.deepEqual(hrOf(june, '14시'), { label: '14시', count: 6, share: 60 });
  assert.deepEqual(hrOf(june, '10시'), { label: '10시', count: 4, share: 40 });
  const nonZeroJune = june.hourly.filter((h) => h.count > 0).map((h) => h.label).sort();
  assert.deepEqual(nonZeroJune, ['10시', '14시']);

  assert.deepEqual(hrOf(july, '14시'), { label: '14시', count: 1, share: 100 });
});

// ---- G3. 추가 필드의 비침습성 ----
// 별도 케이스 불필요 — tests/aggregate.test.mjs, funnel.test.mjs, weekday-hourly.test.mjs가
// 한 줄도 수정되지 않은 채 전부 통과하는 것 자체가 증명(완료 보고에 명시).

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
