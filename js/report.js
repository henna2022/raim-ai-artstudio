// 관리자 엑셀 레포트 빌더 (순수 함수 — DOM·Date/현재시각 접근 금지, 브라우저/Node 겸용)
// js/app.js의 exportAdminXlsx/exportMonthlyReport가 만들던 sheets 배열 조립 로직을 그대로 옮김.

function seriesRows(arr, head) {
  return [[head, "생성 수"]].concat((arr || []).map((d) => [d.label, d.count]));
}

// 현재 통계 스냅샷 시트 배열 — 화면에 보이는 기간별 요약 + 일/주/월 표
export function buildSnapshotSheets(stats, stampText) {
  const s = stats || {};
  return [
    { name: "요약", rows: [
      ["항목", "값"],
      ["오늘", s.today ?? 0],
      ["이번 주", s.thisWeek ?? 0],
      ["이번 달", s.thisMonth ?? 0],
      [],
      ["내보낸 시각", stampText + " (KST)"],
    ]},
    { name: "일별", rows: seriesRows(s.daily, "날짜") },
    { name: "주별", rows: seriesRows(s.weekly, "주간") },
    { name: "월별", rows: seriesRows(s.monthly, "월") },
  ];
}

// 전월(직전 달) 키. 데이터가 없는 달은 report에서 빠지므로, 실제 직전 달일 때만 증감률 표시
function prevMonthKey(mk) {
  let [y, m] = mk.split("-").map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return y + "-" + String(m).padStart(2, "0");
}
function momPct(cur, prevEntry, curMonth) {
  if (!prevEntry || prevEntry.month !== prevMonthKey(curMonth)) return "—"; // 직전 달 데이터 없음
  if (prevEntry.total === 0) return cur > 0 ? "신규" : "—";
  const p = Math.round(((cur - prevEntry.total) / prevEntry.total) * 100);
  return (p > 0 ? "+" : "") + p + "%";
}

// 월별 분석 레포트(.xlsx) 시트 배열 — 월별 비교·전월대비·요일/시간대/모드 분석
export function buildMonthlyReportSheets(stats, nowYmd) {
  const s = stats || {};
  const report = s.report || [];

  // 1) 월별 분석 — 진행 중인 달은 표시하되, 전체 달과 비교되지 않도록 표시
  const nowMonth = nowYmd.slice(0, 7); // 현재 KST 월 (YYYY-MM)
  const monthRows = [["월", "총 생성", "전월 대비", "블록", "대화", "블록 비율", "가동일수", "가동일 평균", "최다 생성일", "최다 수"]];
  report.forEach((m, i) => {
    const partial = m.month === nowMonth; // 아직 끝나지 않은 달
    monthRows.push([
      m.monthLabel + (partial ? " (진행 중)" : ""), m.total,
      partial ? "진행 중" : momPct(m.total, report[i - 1], m.month),
      m.blocks, m.chat, m.blocksPct + "%",
      m.activeDays, m.avgActive, m.peakLabel, m.peakCount,
    ]);
  });

  // 2) 일별 추이 (월 누적은 달이 바뀌면 초기화)
  const trendRows = [["날짜", "생성 수", "월 누적"]];
  let curMonth = null, cum = 0;
  (s.dailyFull || []).forEach((d) => {
    if (d.month !== curMonth) { curMonth = d.month; cum = 0; }
    cum += d.count;
    trendRows.push([d.label, d.count, cum]);
  });

  // 3) 요일별(가동일수·가동일 평균 포함) 4) 시간대별(비율(%) 숫자 셀)
  const weekdayRows = [["요일", "생성 수", "가동일수", "가동일 평균"]]
    .concat((s.weekday || []).map((d) => [d.label, d.count, d.activeDays, d.avg]));
  const hourlyRows = [["시간대", "생성 수", "비율(%)"]]
    .concat((s.hourly || []).map((d) => [d.label, d.count, d.share]));

  // 5) 모드별 (레포트 기간 합계). 합계는 총 생성 기준 → 일별 추이·월별 분석과 정합.
  const totBlocks = report.reduce((n, m) => n + m.blocks, 0);
  const totChat = report.reduce((n, m) => n + m.chat, 0);
  const totAll = report.reduce((n, m) => n + m.total, 0);
  const totEtc = Math.max(0, totAll - totBlocks - totChat); // 모드 미기록분
  const pct = (n) => (totAll ? Math.round((n / totAll) * 100) : 0) + "%";
  const modeRows = [
    ["모드", "생성 수", "비율"],
    ["블록", totBlocks, pct(totBlocks)],
    ["대화", totChat, pct(totChat)],
  ];
  if (totEtc > 0) modeRows.push(["미분류", totEtc, pct(totEtc)]);
  modeRows.push(["합계", totAll, "100%"]);

  return [
    { name: "월별 분석", rows: monthRows },
    { name: "일별 추이", rows: trendRows },
    { name: "요일별", rows: weekdayRows },
    { name: "시간대별", rows: hourlyRows },
    { name: "모드별", rows: modeRows },
  ];
}
