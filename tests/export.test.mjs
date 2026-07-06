// tests/export.test.mjs — T5(원본 데이터 내보내기) 단위 테스트
// api/_aggregate.js의 kstDateTime(순수 KST 포맷터)과 js/report.js의 capRows/buildExportSheets
// (rows→sheets 순수 함수, 50,000행 캡)를 검증한다. 기존 tests/*.test.mjs는 건드리지 않음.
import assert from 'node:assert/strict';
import { kstDateTime } from '../api/_aggregate.js';
import { capRows, buildExportSheets } from '../js/report.js';

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

// ---- kstDateTime: 'YYYY-MM-DD HH:mm', kst() 시프트 방식(Date 로케일 함수 아님) ----
test('kstDateTime — 기본 변환', () => {
  // 2026-07-01T03:34:00Z → KST 2026-07-01 12:34
  assert.equal(kstDateTime(Date.parse('2026-07-01T03:34:00Z')), '2026-07-01 12:34');
});

test('kstDateTime — 자정 경계', () => {
  // 2026-07-04T14:59:00Z = KST 07-04 23:59, 2026-07-04T15:00:00Z = KST 07-05 00:00
  assert.equal(kstDateTime(Date.parse('2026-07-04T14:59:00Z')), '2026-07-04 23:59');
  assert.equal(kstDateTime(Date.parse('2026-07-04T15:00:00Z')), '2026-07-05 00:00');
});

// ---- capRows: 50,000행 캡 경계 ----
test('capRows — 정확히 50,000이면 자르지 않음(넘지 않음)', () => {
  const items = Array.from({ length: 50000 }, (_, i) => ({ n: i }));
  const rows = capRows(items, (r) => [r.n]);
  assert.equal(rows.length, 50000);
  assert.deepEqual(rows[rows.length - 1], [49999]); // 안내 행 없음, 마지막이 실데이터
});

test('capRows — 50,001이면 최신 50,000건 + 안내 행 1개', () => {
  const items = Array.from({ length: 50001 }, (_, i) => ({ n: i }));
  const rows = capRows(items, (r) => [r.n]);
  assert.equal(rows.length, 50001); // 실데이터 50,000 + 안내 행 1
  assert.deepEqual(rows[0], [1]); // 가장 오래된 것(n=0)이 잘려나감 → 살아남은 첫 항목은 n=1
  assert.deepEqual(rows[49999], [50000]); // 가장 최신(n=50000)이 안내 행 직전
  assert.deepEqual(rows[50000], ['이후 생략 (총 50001행)']);
});

test('capRows — 빈 배열/undefined 안전', () => {
  assert.deepEqual(capRows([], (r) => [r]), []);
  assert.deepEqual(capRows(undefined, (r) => [r]), []);
});

// ---- buildExportSheets: /api/export 응답 → sheets ----
test('buildExportSheets — 생성기록 + 이벤트 둘 다 있을 때', () => {
  const data = {
    generations: [{ t: '2026-07-01 12:00', mode: 'blocks' }, { t: '2026-07-02 09:30', mode: null }],
    events: [{ t: '2026-07-01 11:59', type: 'visit', mode: null, lang: 'ko' }],
  };
  const sheets = buildExportSheets(data);
  assert.deepEqual(sheets.map((s) => s.name), ['생성기록', '이벤트']);

  const gen = sheets.find((s) => s.name === '생성기록').rows;
  assert.deepEqual(gen[0], ['일시(KST)', '모드']);
  assert.deepEqual(gen[1], ['2026-07-01 12:00', 'blocks']);
  assert.deepEqual(gen[2], ['2026-07-02 09:30', null]);

  const ev = sheets.find((s) => s.name === '이벤트').rows;
  assert.deepEqual(ev[0], ['일시(KST)', '종류', '모드', '언어']);
  assert.deepEqual(ev[1], ['2026-07-01 11:59', 'visit', null, 'ko']);
});

test('buildExportSheets — events 없으면(T1 미적용) 이벤트 시트 생략, 오류 없음', () => {
  const sheets = buildExportSheets({ generations: [] });
  assert.deepEqual(sheets.map((s) => s.name), ['생성기록']);
  assert.deepEqual(sheets[0].rows, [['일시(KST)', '모드']]);
});

test('buildExportSheets — 완전 빈 입력(undefined) 안전', () => {
  const sheets = buildExportSheets(undefined);
  assert.deepEqual(sheets.map((s) => s.name), ['생성기록']);
  assert.deepEqual(sheets[0].rows, [['일시(KST)', '모드']]);
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
