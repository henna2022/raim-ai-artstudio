// tests/print-report.test.mjs — T6(인쇄용 HTML 보고서) 단위 테스트
// js/report.js의 buildPrintReportData(순수 데이터 조립)만 검증한다. renderPrintReport의 실제
// DOM 조립/window.print() 호출은 브라우저 프리뷰로 검증(완료 보고 참고), 여기서는 테스트하지 않는다.
import assert from 'node:assert/strict';
import { buildPrintReportData } from '../js/report.js';

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

function reportEntry(o) {
  return {
    month: o.month, monthLabel: o.monthLabel ?? o.month, total: o.total,
    blocks: o.blocks ?? 0, chat: o.chat ?? 0, blocksPct: o.blocksPct ?? 0,
    activeDays: o.activeDays ?? 0, avgActive: o.avgActive ?? 0,
    peakLabel: o.peakLabel ?? '', peakCount: o.peakCount ?? 0,
    weekday: o.weekday ?? [], hourly: o.hourly ?? [],
  };
}

const WEEKDAY = [{ label: '토', count: 20, activeDays: 2, avg: 10 }];
const HOURLY = [{ label: '14시', count: 30, share: 67 }];

const STATS = {
  monthly: [{ label: '2026.07', count: 9 }, { label: '2026.06', count: 45 }],
  report: [
    reportEntry({ month: '2025-06', monthLabel: '2025.06', total: 30 }),
    reportEntry({ month: '2026-06', monthLabel: '2026.06', total: 45, blocks: 20, chat: 25, activeDays: 9, avgActive: 5, peakLabel: '06/20(토)', peakCount: 8, weekday: WEEKDAY, hourly: HOURLY }),
    reportEntry({ month: '2026-07', monthLabel: '2026.07', total: 9, blocks: 5, chat: 4 }),
  ],
};

// ---- 대상 월 생략 → defaultReportMonth 재사용(최신 완결월) ----
test('buildPrintReportData — targetMonth 생략 시 defaultReportMonth 재사용', () => {
  const data = buildPrintReportData(STATS, '2026-07-06');
  assert.equal(data.target, '2026-06');
  assert.equal(data.targetLabel, '2026.06');
  assert.equal(data.partial, false);
});

// ---- 완결월 — entry 필드 그대로 반영 ----
test('buildPrintReportData — 완결월(2026-06) entry 필드', () => {
  const data = buildPrintReportData(STATS, '2026-07-06', '2026-06');
  assert.equal(data.total, 45);
  assert.equal(data.blocks, 20);
  assert.equal(data.chat, 25);
  assert.equal(data.activeDays, 9);
  assert.equal(data.avgActive, 5);
  assert.equal(data.peakLabel, '06/20(토)');
  assert.equal(data.peakCount, 8);
  assert.deepEqual(data.weekday, WEEKDAY);
  assert.deepEqual(data.hourly, HOURLY);
  assert.equal(data.dataRange, '2025.06 ~ 2026.07');
  assert.ok(Array.isArray(data.insights) && data.insights.length > 0);
});

// ---- 진행 중인 달 — 라벨에 "(진행 중)" ----
test('buildPrintReportData — 진행 중인 달(2026-07)', () => {
  const data = buildPrintReportData(STATS, '2026-07-06', '2026-07');
  assert.equal(data.targetLabel, '2026.07 (진행 중)');
  assert.equal(data.partial, true);
});

// ---- 갭(report에 없는 달) — 예외 없이 0/'—'/빈 배열 ----
test('buildPrintReportData — 갭(2026-05), 예외 없음', () => {
  const data = buildPrintReportData(STATS, '2026-07-06', '2026-05');
  assert.equal(data.total, 0);
  assert.equal(data.blocks, 0);
  assert.equal(data.peakLabel, '—');
  assert.deepEqual(data.weekday, []);
  assert.deepEqual(data.hourly, []);
  assert.ok(Array.isArray(data.insights));
});

// ---- 완전 빈 stats — 예외 없음 ----
test('buildPrintReportData — 완전 빈 stats, 예외 없음', () => {
  const data = buildPrintReportData({ report: [] }, '2026-07-06');
  assert.equal(data.target, null);
  assert.equal(data.targetLabel, '');
  assert.equal(data.total, 0);
  assert.equal(data.dataRange, '');
  assert.deepEqual(data.insights, ['데이터 누적 중']); // buildInsights 그대로 재사용됨을 확인
});

// ---- monthlyTrend은 top-level s.monthly 그대로(요일/시간대와 다른 소스) ----
test('buildPrintReportData — monthlyTrend은 s.monthly 시리즈 그대로', () => {
  const data = buildPrintReportData(STATS, '2026-07-06', '2026-06');
  assert.deepEqual(data.monthlyTrend, STATS.monthly);
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
