// tests/dashboard-data.test.mjs — js/dashboard-data.js(buildKpis) + api/_aggregate.js(aggregateFunnelDaily) 단위 테스트
// 대시보드 개편 데이터 레이어 선행분. 기존 7개 테스트 파일은 건드리지 않고 새 파일로 추가.
// 날짜 앵커: 2026-07-06은 월요일(KST).
import assert from 'node:assert/strict';
import { buildKpis } from '../js/dashboard-data.js';
import { aggregateFunnelDaily, dayKey } from '../api/_aggregate.js';

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

// funnelDaily 항목 생성 헬퍼 (서버 산출물과 동일한 형태)
const v = (date, visits, extra) => ({ date, visits, ok: 0, blocked: 0, error: 0, ...(extra || {}) });

// ---- buildKpis: 어제 대비 방문 증감 ----
test('어제 10/오늘 15 → vsYesterdayPct === +50 (숫자 타입)', () => {
  const k = buildKpis({ funnelDaily: [v('2026-07-07', 10), v('2026-07-08', 15)] }, '2026-07-08');
  assert.equal(k.todayVisits, 15);
  assert.equal(k.vsYesterdayPct, 50);
  assert.equal(typeof k.vsYesterdayPct, 'number'); // 문자열 '+50%' 금지
});

test('증감 %는 Math.round 정수 (7→10은 43, 10→5는 -50)', () => {
  const up = buildKpis({ funnelDaily: [v('2026-07-07', 7), v('2026-07-08', 10)] }, '2026-07-08');
  assert.equal(up.vsYesterdayPct, 43); // 42.857… → 43
  const down = buildKpis({ funnelDaily: [v('2026-07-07', 10), v('2026-07-08', 5)] }, '2026-07-08');
  assert.equal(down.vsYesterdayPct, -50); // 부호 포함
});

test('어제 방문 0 또는 어제 데이터 없음 → vsYesterdayPct === null', () => {
  const zero = buildKpis({ funnelDaily: [v('2026-07-07', 0), v('2026-07-08', 15)] }, '2026-07-08');
  assert.equal(zero.vsYesterdayPct, null);
  const missing = buildKpis({ funnelDaily: [v('2026-07-08', 15)] }, '2026-07-08');
  assert.equal(missing.vsYesterdayPct, null);
});

// ---- buildKpis: 구버전 서버 응답(funnelDaily 없음/빈 배열) ----
test('funnelDaily 없음/빈 배열/stats null → 방문 KPI 전부 null, 예외 없음', () => {
  for (const stats of [{ dailyFull: [], hourly: [] }, { funnelDaily: [] }, {}, null, undefined]) {
    const k = buildKpis(stats, '2026-07-08'); // 예외가 나면 test()가 FAIL 처리
    assert.equal(k.todayVisits, null);
    assert.equal(k.vsYesterdayPct, null);
    assert.equal(k.thisWeekVisits, null);
    assert.equal(k.vsLastWeekPct, null);
  }
});

// ---- buildKpis: 주간 대비 (같은 경과 시점 비교) ----
test('주간 대비 — 이번 주 월~수 vs 지난주 월~수 (2026-07-08은 수요일)', () => {
  // 이번 주: 월(07-06) 5, 화(07-07) 5, 수(07-08) 5 = 15 / 지난주 월~수: 5+5+0 = 10
  const funnelDaily = [
    v('2026-06-29', 5), v('2026-06-30', 5), v('2026-07-01', 0),
    v('2026-07-06', 5), v('2026-07-07', 5), v('2026-07-08', 5),
  ];
  const k = buildKpis({ funnelDaily }, '2026-07-08');
  assert.equal(k.thisWeekVisits, 15);
  assert.equal(k.vsLastWeekPct, 50); // round((15-10)/10*100)
});

test('주간 대비 — 지난주 목~일 데이터는 분모에 포함되지 않음 (결과 불변 증명)', () => {
  const base = [
    v('2026-06-29', 5), v('2026-06-30', 5), v('2026-07-01', 0),
    v('2026-07-06', 5), v('2026-07-07', 5), v('2026-07-08', 5),
  ];
  // 지난주 목~일(07-02~07-05)에 큰 값을 넣어도 "같은 경과 시점(월~수)" 비교라 결과가 달라지면 안 됨
  const withLateLastWeek = base.concat([
    v('2026-07-02', 100), v('2026-07-03', 100), v('2026-07-04', 100), v('2026-07-05', 100),
  ]);
  const a = buildKpis({ funnelDaily: base }, '2026-07-08');
  const b = buildKpis({ funnelDaily: withLateLastWeek }, '2026-07-08');
  assert.equal(b.thisWeekVisits, a.thisWeekVisits); // 15 그대로
  assert.equal(b.vsLastWeekPct, a.vsLastWeekPct);   // 50 그대로
});

test('주간 대비 — 월요일 기준(경과 1일)일 땐 지난주 월요일만 분모', () => {
  const funnelDaily = [
    v('2026-06-29', 14), v('2026-06-30', 999), // 지난주 화요일 999는 무시되어야 함
    v('2026-07-06', 7),
  ];
  const k = buildKpis({ funnelDaily }, '2026-07-06'); // 2026-07-06 = 월요일
  assert.equal(k.thisWeekVisits, 7);
  assert.equal(k.vsLastWeekPct, -50); // round((7-14)/14*100)
});

test('주간 대비 — 지난주 누적 0이면 null', () => {
  const k = buildKpis({ funnelDaily: [v('2026-07-06', 3), v('2026-07-07', 4), v('2026-07-08', 5)] }, '2026-07-08');
  assert.equal(k.thisWeekVisits, 12);
  assert.equal(k.vsLastWeekPct, null); // 분모 0
});

// ---- buildKpis: 생성 KPI (stats.dailyFull 기반) ----
test('생성 KPI — 어제 4/오늘 6 → todayGen 6, vsYesterdayGenPct +50', () => {
  const dailyFull = [
    { date: '2026-07-07', label: '07/07(화)', month: '2026-07', count: 4 },
    { date: '2026-07-08', label: '07/08(수)', month: '2026-07', count: 6 },
  ];
  const k = buildKpis({ dailyFull }, '2026-07-08');
  assert.equal(k.todayGen, 6);
  assert.equal(k.vsYesterdayGenPct, 50);
});

test('생성 KPI — 어제 데이터 없으면 null, dailyFull 자체가 없으면 todayGen도 null', () => {
  const k1 = buildKpis({ dailyFull: [{ date: '2026-07-08', count: 6 }] }, '2026-07-08');
  assert.equal(k1.todayGen, 6);
  assert.equal(k1.vsYesterdayGenPct, null); // dailyFull은 데이터 있는 날만 담김 → 어제 없음 = 0 = null
  const k2 = buildKpis({ funnelDaily: [v('2026-07-08', 1)] }, '2026-07-08');
  assert.equal(k2.todayGen, null);
  assert.equal(k2.vsYesterdayGenPct, null);
});

test('hourly는 그대로 전달', () => {
  const hourly = [{ label: '00시', count: 1, share: 100 }];
  const k = buildKpis({ hourly }, '2026-07-08');
  assert.equal(k.hourly, hourly); // 동일 참조 패스스루
});

// ---- aggregateFunnelDaily: KST 자정 경계 ----
test('KST 자정 경계 — UTC 15:00 직전/직후 이벤트가 다른 날로 집계', () => {
  // 2026-07-07T14:59:59Z = KST 07-07 23:59:59 / 2026-07-07T15:00:00Z = KST 07-08 00:00:00
  const events = [
    { created_at: '2026-07-07T14:59:59Z', type: 'visit' },
    { created_at: '2026-07-07T15:00:00Z', type: 'visit' },
  ];
  const nowMs = Date.parse('2026-07-08T03:00:00Z'); // KST 07-08 낮
  const d = aggregateFunnelDaily(events, nowMs);
  const jul7 = d.find((r) => r.date === '2026-07-07');
  const jul8 = d.find((r) => r.date === '2026-07-08');
  assert.equal(jul7.visits, 1);
  assert.equal(jul8.visits, 1);
});

// ---- aggregateFunnelDaily: 길이 14 고정 · 0 채움 · 타입/created_at 방어 ----
test('aggregateFunnelDaily — 항상 길이 14, 오름차순, 빈 날 0 채움', () => {
  const nowMs = Date.parse('2026-07-08T03:00:00Z'); // KST 오늘 = 2026-07-08
  const d = aggregateFunnelDaily([{ created_at: '2026-07-08T01:00:00Z', type: 'visit' }], nowMs);
  assert.equal(d.length, 14);
  assert.equal(d[0].date, '2026-06-25'); // 오늘 포함 14일 전 시작
  assert.equal(d[13].date, '2026-07-08');
  for (let i = 1; i < d.length; i++) assert.ok(d[i - 1].date < d[i].date, '오름차순 아님');
  // 데이터 없는 날은 전 필드 0으로 채움 (스키마 고정)
  assert.deepEqual(d[1], { date: '2026-06-26', visits: 0, ok: 0, blocked: 0, error: 0 });
  assert.deepEqual(d[13], { date: '2026-07-08', visits: 1, ok: 0, blocked: 0, error: 0 });
});

test('aggregateFunnelDaily — 타입별 카운트, 알 수 없는 type·잘못된 created_at·창 밖 이벤트 무시', () => {
  const nowMs = Date.parse('2026-07-08T03:00:00Z');
  const events = [
    { created_at: '2026-07-08T01:00:00Z', type: 'visit' },
    { created_at: '2026-07-08T02:00:00Z', type: 'visit' },
    { created_at: '2026-07-08T02:30:00Z', type: 'mode_select' },     // 유효 type이지만 일별 필드엔 없음
    { created_at: '2026-07-01T01:00:00Z', type: 'generate_ok' },
    { created_at: '2026-07-01T02:00:00Z', type: 'generate_blocked' },
    { created_at: '2026-06-25T01:00:00Z', type: 'generate_error' },
    { created_at: '2026-06-24T01:00:00Z', type: 'visit' },           // 창(14일) 밖 → 미포함
    { created_at: '2026-07-08T03:00:00Z', type: 'bogus_type' },      // 알 수 없는 type 무시
    { created_at: null, type: 'visit' },                              // null → 무시
    { created_at: 'garbage', type: 'visit' },                         // NaN → 무시
    { created_at: 0, type: 'visit' },                                 // 0 → 무시
  ];
  const d = aggregateFunnelDaily(events, nowMs);
  assert.equal(d.length, 14);
  assert.deepEqual(d.find((r) => r.date === '2026-07-08'), { date: '2026-07-08', visits: 2, ok: 0, blocked: 0, error: 0 });
  assert.deepEqual(d.find((r) => r.date === '2026-07-01'), { date: '2026-07-01', visits: 0, ok: 1, blocked: 1, error: 0 });
  assert.deepEqual(d.find((r) => r.date === '2026-06-25'), { date: '2026-06-25', visits: 0, ok: 0, blocked: 0, error: 1 });
  assert.equal(d.find((r) => r.date === '2026-06-24'), undefined); // 창 밖 날짜는 배열에 없음
  const total = d.reduce((a, r) => a + r.visits + r.ok + r.blocked + r.error, 0);
  assert.equal(total, 5); // 무시 대상들이 어디에도 집계되지 않음
});

test('aggregateFunnelDaily — 빈 입력([]/null/undefined) 안전', () => {
  const nowMs = Date.parse('2026-07-08T03:00:00Z');
  for (const input of [[], null, undefined]) {
    const d = aggregateFunnelDaily(input, nowMs);
    assert.equal(d.length, 14);
    assert.equal(d[13].date, dayKey(nowMs));
    for (const r of d) {
      assert.equal(r.visits + r.ok + r.blocked + r.error, 0);
    }
  }
});

// ---- 통합: aggregateFunnelDaily 산출물을 buildKpis에 그대로 주입 ----
test('통합 — 서버 산출 funnelDaily로 buildKpis 계산', () => {
  const nowMs = Date.parse('2026-07-08T03:00:00Z'); // KST 2026-07-08(수)
  const events = [
    { created_at: '2026-07-06T01:00:00Z', type: 'visit' }, // 월 1
    { created_at: '2026-07-07T01:00:00Z', type: 'visit' }, // 화 2
    { created_at: '2026-07-07T02:00:00Z', type: 'visit' },
    { created_at: '2026-07-08T01:00:00Z', type: 'visit' }, // 수(오늘) 3
    { created_at: '2026-07-08T01:10:00Z', type: 'visit' },
    { created_at: '2026-07-08T01:20:00Z', type: 'visit' },
  ];
  const funnelDaily = aggregateFunnelDaily(events, nowMs);
  const k = buildKpis({ funnelDaily }, dayKey(nowMs));
  assert.equal(k.todayVisits, 3);
  assert.equal(k.vsYesterdayPct, 50);   // 2 → 3
  assert.equal(k.thisWeekVisits, 6);    // 월~수 1+2+3
  assert.equal(k.vsLastWeekPct, null);  // 지난주 월~수 방문 0 → 분모 0
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
