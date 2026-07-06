// tests/funnel.test.mjs — api/_aggregate.js의 aggregateFunnel() 단위 테스트 (T1 확장분)
// docs/stats-report-prompts.md T1 + 보완 지침의 엣지 케이스(ⓐ~ⓓ)를 포함한다.
// tests/aggregate.test.mjs·tests/report.test.mjs(T0 고정본)는 건드리지 않고 새 파일로 추가.
import assert from 'node:assert/strict';
import { aggregateFunnel, monthKey } from '../api/_aggregate.js';

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

// ---- 기본 집계: 타입별 카운트 · blockRate · perSession ----
test('기본 집계 — 타입별 카운트 · blockRate · perSession', () => {
  const nowMs = Date.parse('2026-07-05T01:00:00Z'); // KST 07-05
  const events = [
    { created_at: '2026-07-01T01:00:00Z', type: 'visit' },
    { created_at: '2026-07-01T01:01:00Z', type: 'visit' },
    { created_at: '2026-07-01T01:02:00Z', type: 'mode_select' },
    { created_at: '2026-07-01T01:03:00Z', type: 'generate_ok' },
    { created_at: '2026-07-01T01:04:00Z', type: 'generate_blocked' },
    { created_at: '2026-07-01T01:05:00Z', type: 'generate_error' },
  ];
  const f = aggregateFunnel(events, nowMs);
  assert.equal(f.visits, 2);
  assert.equal(f.modeSelects, 1);
  assert.equal(f.ok, 1);
  assert.equal(f.blocked, 1);
  assert.equal(f.error, 1);
  assert.equal(f.blockRate, 33); // attempts=3, round(1/3*100)=33
  assert.equal(f.perSession, 1.5); // round(3/2*10)/10=1.5
});

// ---- ⓐ 분모 0 — 시도 0건일 때 blockRate, visits 0일 때 perSession ----
test('ⓐ 분모 0 — 시도 0건일 때 blockRate, visits 0일 때 perSession', () => {
  const nowMs = Date.parse('2026-07-05T01:00:00Z');

  // 방문만 있고 생성 시도(ok/blocked/error)가 전혀 없는 경우 → attempts=0
  const f1 = aggregateFunnel([{ created_at: '2026-07-01T01:00:00Z', type: 'visit' }], nowMs);
  assert.equal(f1.blockRate, 0); // 0/0 → 0 (NaN 아님, 예외 없음)

  // 생성 시도는 있지만 방문 기록이 없는 경우 → visits=0
  const f2 = aggregateFunnel([{ created_at: '2026-07-01T01:00:00Z', type: 'generate_ok' }], nowMs);
  assert.equal(f2.visits, 0);
  assert.ok(f2.perSession === 0 || f2.perSession === null); // 0/0 → 0 또는 null, 예외 없음
});

// ---- ⓑ events 빈 배열/undefined/null → funnel 전체 0/null ----
test('ⓑ events 빈 배열/undefined/null → funnel 전체 0/null', () => {
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  for (const input of [[], undefined, null]) {
    const f = aggregateFunnel(input, nowMs);
    assert.equal(f.visits, 0);
    assert.equal(f.modeSelects, 0);
    assert.equal(f.ok, 0);
    assert.equal(f.blocked, 0);
    assert.equal(f.error, 0);
    assert.equal(f.blockRate, 0);
    assert.ok(f.perSession === 0 || f.perSession === null);
    assert.deepEqual(f.monthly, []);
  }
});

// ---- ⓒ 월 경계 — KST 자정 직전/직후 이벤트가 서로 다른 달의 funnel에 집계 ----
test('ⓒ 월 경계 — KST 자정 직전/직후 이벤트가 서로 다른 달의 funnel에 집계', () => {
  // 2026-06-30T14:59:59Z = KST 06-30 23:59:59(6월), 2026-06-30T15:00:00Z = KST 07-01 00:00:00(7월)
  const beforeMidnight = '2026-06-30T14:59:59Z';
  const afterMidnight = '2026-06-30T15:00:00Z';
  assert.equal(monthKey(Date.parse(beforeMidnight)), '2026-06');
  assert.equal(monthKey(Date.parse(afterMidnight)), '2026-07');

  const events = [
    { created_at: beforeMidnight, type: 'visit' },
    { created_at: afterMidnight, type: 'visit' },
  ];
  const nowMs = Date.parse('2026-07-05T01:00:00Z'); // 현재 KST 7월
  const f = aggregateFunnel(events, nowMs);

  const juneEntry = f.monthly.find((m) => m.month === '2026-06');
  const julyEntry = f.monthly.find((m) => m.month === '2026-07');
  assert.ok(juneEntry, '6월 monthly 항목 없음');
  assert.ok(julyEntry, '7월 monthly 항목 없음');
  assert.equal(juneEntry.visits, 1);
  assert.equal(julyEntry.visits, 1);
  // 이번 달(7월) 기준 top-level 필드는 7월 집계와 일치, 6월 것이 섞이지 않음
  assert.equal(f.visits, 1);
});

// ---- ⓓ 알 수 없는 type 값 무시 ----
test('ⓓ 알 수 없는 type 값 무시', () => {
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  const events = [
    { created_at: '2026-07-01T01:00:00Z', type: 'visit' },
    { created_at: '2026-07-01T01:01:00Z', type: 'bogus_type' },
    { created_at: '2026-07-01T01:02:00Z', type: undefined },
    { created_at: '2026-07-01T01:03:00Z', type: null },
    { created_at: '2026-07-01T01:04:00Z' }, // type 필드 자체 없음
  ];
  const f = aggregateFunnel(events, nowMs);
  assert.equal(f.visits, 1); // 알 수 없는/누락 type은 전부 무시, 어떤 카운터도 증가하지 않음
  assert.equal(f.modeSelects, 0);
  assert.equal(f.ok, 0);
  assert.equal(f.blocked, 0);
  assert.equal(f.error, 0);
  assert.equal(f.monthly.length, 1); // 무시된 이벤트가 monthly에 빈 항목을 만들지 않음
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
