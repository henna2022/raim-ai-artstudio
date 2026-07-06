// tests/weekday-hourly.test.mjs — T2(요일·시간대 통계 정규화) 확장분 단위 테스트
// api/_aggregate.js의 weekday{activeDays,avg}·hourly{share}, js/report.js의 요일별/시간대별
// 시트 컬럼 구성을 검증한다. tests/aggregate.test.mjs·tests/report.test.mjs(T0 고정본)는
// 건드리지 않고 새 파일로 추가.
import assert from 'node:assert/strict';
import { aggregate } from '../api/_aggregate.js';
import { buildMonthlyReportSheets } from '../js/report.js';

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

// ---- T2 프롬프트 5번 케이스: 월요일 2일×각 3건, 화요일 1일×4건 → 총합은 월이 크지만 avg는 화가 큼 ----
test('요일별 avg 정규화 — 월(2일×3) vs 화(1일×4)', () => {
  // 2026-07-06/07-13 = 월요일, 2026-07-07 = 화요일 (t0-test-spec.md 앵커: 2026-07-06은 월요일)
  const rows = [
    { created_at: '2026-07-06T05:00:00Z', mode: null },
    { created_at: '2026-07-06T05:10:00Z', mode: null },
    { created_at: '2026-07-06T05:20:00Z', mode: null },
    { created_at: '2026-07-13T05:00:00Z', mode: null },
    { created_at: '2026-07-13T05:10:00Z', mode: null },
    { created_at: '2026-07-13T05:20:00Z', mode: null },
    { created_at: '2026-07-07T05:00:00Z', mode: null },
    { created_at: '2026-07-07T05:10:00Z', mode: null },
    { created_at: '2026-07-07T05:20:00Z', mode: null },
    { created_at: '2026-07-07T05:30:00Z', mode: null },
  ];
  const nowMs = Date.parse('2026-07-14T01:00:00Z');
  const s = aggregate(rows, nowMs);
  const wd = Object.fromEntries(s.weekday.map((w) => [w.label, w]));

  assert.equal(wd['월'].count, 6);
  assert.equal(wd['월'].activeDays, 2);
  assert.equal(wd['월'].avg, 3);
  assert.equal(wd['화'].count, 4);
  assert.equal(wd['화'].activeDays, 1);
  assert.equal(wd['화'].avg, 4);

  assert.ok(wd['월'].count > wd['화'].count); // 총합은 월이 큼
  assert.ok(wd['화'].avg > wd['월'].avg); // 그러나 가동일 평균은 화가 큼 — 정규화 목적 그 자체
});

// ---- share 분모 0 — 데이터 없을 때 시간대별 share ----
test('share 분모 0 — 데이터 없을 때 시간대별 share', () => {
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  const s = aggregate([], nowMs);
  assert.equal(s.hourly.length, 24);
  assert.ok(s.hourly.every((h) => h.share === 0)); // 0/0 → 0 (NaN·예외 없음)
});

// ---- 시간대별 share — 정상 계산 ----
test('시간대별 share — 정상 계산', () => {
  const rows = [
    { created_at: '2026-07-01T15:00:00Z', mode: null }, // KST 07-02 00:00
    { created_at: '2026-07-01T15:10:00Z', mode: null }, // KST 07-02 00:10
    { created_at: '2026-07-01T15:20:00Z', mode: null }, // KST 07-02 00:20
    { created_at: '2026-07-01T16:00:00Z', mode: null }, // KST 07-02 01:00
  ];
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  const s = aggregate(rows, nowMs);
  assert.equal(s.hourly[0].count, 3);
  assert.equal(s.hourly[0].share, 75);
  assert.equal(s.hourly[1].count, 1);
  assert.equal(s.hourly[1].share, 25);
});

// ---- 기존 count 필드 하위 호환 유지 ----
test('weekday/hourly count 필드는 하위 호환 유지', () => {
  const nowMs = Date.parse('2026-07-05T01:00:00Z');
  const s = aggregate([], nowMs);
  assert.ok(s.weekday.every((w) => typeof w.count === 'number'));
  assert.ok(s.hourly.every((h) => typeof h.count === 'number'));
});

// ---- report.js: 요일별/시간대별 시트 컬럼 구성 ----
test('report.js 요일별 시트 컬럼 = [요일, 생성 수, 가동일수, 가동일 평균]', () => {
  const weekday = [
    { label: '월', count: 6, activeDays: 2, avg: 3 },
    { label: '화', count: 4, activeDays: 1, avg: 4 },
  ];
  const sheets = buildMonthlyReportSheets({ report: [], dailyFull: [], weekday, hourly: [] }, '2026-07-06');
  const rows = sheetByName(sheets, '요일별').rows;

  assert.deepEqual(rows[0], ['요일', '생성 수', '가동일수', '가동일 평균']);
  assert.deepEqual(rows[1], ['월', 6, 2, 3]);
  assert.deepEqual(rows[2], ['화', 4, 1, 4]);
  assert.equal(typeof rows[1][2], 'number'); // 가동일수
  assert.equal(typeof rows[1][3], 'number'); // 가동일 평균
});

test('report.js 시간대별 시트 컬럼 = [시간대, 생성 수, 비율(%)] — 비율은 숫자 셀', () => {
  const hourly = [
    { label: '00시', count: 3, share: 75 },
    { label: '01시', count: 1, share: 25 },
  ];
  const sheets = buildMonthlyReportSheets({ report: [], dailyFull: [], weekday: [], hourly }, '2026-07-06');
  const rows = sheetByName(sheets, '시간대별').rows;

  assert.deepEqual(rows[0], ['시간대', '생성 수', '비율(%)']);
  assert.deepEqual(rows[1], ['00시', 3, 75]);
  assert.deepEqual(rows[2], ['01시', 1, 25]);
  assert.equal(typeof rows[1][2], 'number'); // 문자열 "12%" 금지 — 숫자 셀
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
