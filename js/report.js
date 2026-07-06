// 관리자 엑셀 레포트 빌더 (순수 함수 — DOM·Date/현재시각 접근 금지, 브라우저/Node 겸용)
// js/app.js의 exportAdminXlsx/exportMonthlyReport가 만들던 sheets 배열 조립 로직을 그대로 옮김.

// buildInsights 임계값 — 하드코딩 산재 금지, 전부 여기 모아둔다.
const MOM_THRESHOLD_PCT = 10;            // 직전월 대비 "증가/감소" 언급 최소 절대값(%). 정확히 10도 포함(이상).
const WEEKDAY_AVG_DIFF_THRESHOLD = 0.5;  // 최다 요일 1위-2위 avg 차이 최소값. 미만이면 언급 생략.
const MIN_MONTHS_FOR_COMPARISON = 2;     // report 전체 개월 수가 이 미만이면 비교 문장 전부 생략.

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
// "12개월 개요" 시트용 — 숫자 또는 빈 문자열(T5). 갭·첫 항목·진행 중·구"신규" 분기를
// 전부 ''로 통합(후속 계산·피벗을 위해 숫자 셀 유지, "요약" 시트의 momPctNumber와는 별개 — 그쪽은
// T3(D2)에서 이미 '—'/'신규' 문자열로 확정되어 M3·M4가 그대로 검증 중이라 변경하지 않는다).
function momPctCell(cur, prevEntry, curMonth, partial) {
  if (partial) return "";
  if (!prevEntry || prevEntry.month !== prevMonthKey(curMonth)) return "";
  if (prevEntry.total === 0) return "";
  return Math.round(((cur - prevEntry.total) / prevEntry.total) * 100);
}
// "요약" 시트용 — 같은 갭 판정 로직이지만 값은 숫자 그대로(부호 문자열 없음, D2)
function momPctNumber(cur, prevEntry, curMonth) {
  if (!prevEntry || prevEntry.month !== prevMonthKey(curMonth)) return "—";
  if (prevEntry.total === 0) return cur > 0 ? "신규" : "—";
  return Math.round(((cur - prevEntry.total) / prevEntry.total) * 100);
}

// 'YYYY-MM' → 'YYYY.MM'. report.js는 api/_aggregate.js에 의존하지 않으므로 로컬로 재구현.
function ymLabel(mk) {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${y}.${m}`;
}
// mk의 전년 동월 키('YYYY-MM' → 1년 전)
function priorYearKey(mk) {
  if (!mk) return null;
  const [y, m] = mk.split("-");
  return (Number(y) - 1) + "-" + m;
}
// mk월의 일수. Date.UTC(y, m, 0)에서 m은 mk의 1-based 월 문자열을 그대로 0-based '다음달' 인자로
// 써서 그 달 마지막 날을 얻는다(예: mk='2026-07' → Date.UTC(2026,7,0) = 7월 31일).
function daysInMonth(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// report[]에서 기본 대상 월 결정(D5) — 가장 최근 완결월(진행 중인 달 제외), 완결월이 없으면
// 진행 중인 달, report가 비어 있으면 null. DOM 없는 순수 함수 — app.js는 호출만 한다.
export function defaultReportMonth(report, nowYmd) {
  const list = report || [];
  if (!list.length) return null;
  const nowMonth = nowYmd.slice(0, 7);
  const completed = list.filter((m) => m.month !== nowMonth);
  if (completed.length) return completed[completed.length - 1].month; // report는 오름차순 → 마지막이 최신 완결월
  return list[list.length - 1].month; // 완결월 없음 → 진행 중인 달
}

const pad2 = (n) => String(n).padStart(2, "0");

// '핵심 요약' 시트용 규칙 기반 코멘트 — 데이터에서만 생성(추측·수식어·원인 해석 금지).
// nowMonth는 "완결월" 판정에만 쓰는 문자열 값이라 Date 접근이 아니다(호출부인
// buildMonthlyReportSheets가 nowYmd에서 이미 뽑아 넘겨준다).
export function buildInsights(stats, targetMonth, nowMonth) {
  const s = stats || {};
  const report = s.report || [];
  if (report.length < MIN_MONTHS_FOR_COMPARISON) return ["데이터 누적 중"];

  const insights = [];
  const completed = report.filter((m) => m.month !== nowMonth);

  // 최다/최저 월 (완결월 중, 동률이면 최근 것 — 오름차순 순회 + >=/<= 로 뒤쪽이 이김)
  if (completed.length) {
    let maxM = completed[0], minM = completed[0];
    for (const m of completed) {
      if (m.total >= maxM.total) maxM = m;
      if (m.total <= minM.total) minM = m;
    }
    insights.push(`최다 생성 달: ${maxM.monthLabel}(${maxM.total}건)`);
    insights.push(`최저 생성 달: ${minM.monthLabel}(${minM.total}건)`);
  }

  // 직전월 대비 (완결월 기준만 — 대상 월이 진행 중이면 생략)
  const targetEntry = report.find((m) => m.month === targetMonth);
  if (targetEntry && targetMonth !== nowMonth) {
    const idx = report.findIndex((m) => m.month === targetMonth);
    const prevEntry = idx > 0 ? report[idx - 1] : null;
    if (prevEntry && prevEntry.month === prevMonthKey(targetMonth) && prevEntry.total !== 0) {
      const pct = Math.round(((targetEntry.total - prevEntry.total) / prevEntry.total) * 100);
      if (Math.abs(pct) >= MOM_THRESHOLD_PCT) {
        insights.push(`직전월 대비 ${pct > 0 ? "증가" : "감소"}(${pct > 0 ? "+" : ""}${pct}%)`);
      } else {
        insights.push("직전월과 비슷한 수준");
      }
    }
  }

  // 최다 요일 (대상 월의 weekday avg 1위. 1위-2위 차이가 임계값 미만이면 언급 생략)
  if (targetEntry && targetEntry.weekday && targetEntry.weekday.length) {
    const sorted = targetEntry.weekday.slice().sort((a, b) => b.avg - a.avg);
    const top = sorted[0], second = sorted[1];
    if (top && top.avg > 0 && (!second || top.avg - second.avg >= WEEKDAY_AVG_DIFF_THRESHOLD)) {
      insights.push(`최다 생성 요일: ${top.label}요일(평균 ${top.avg}건)`);
    }
  }

  // 피크 시간대 (대상 월의 hourly 1위. 상위 2개가 인접하면 "14~15시" 형태로 병합)
  if (targetEntry && targetEntry.hourly && targetEntry.hourly.length) {
    const sorted = targetEntry.hourly.map((h, i) => ({ ...h, hour: i })).sort((a, b) => b.count - a.count);
    const top = sorted[0];
    if (top && top.count > 0) {
      const second = sorted[1];
      let label = top.label;
      if (second && second.count > 0 && Math.abs(second.hour - top.hour) === 1) {
        const lo = Math.min(top.hour, second.hour), hi = Math.max(top.hour, second.hour);
        label = `${pad2(lo)}~${pad2(hi)}시`;
      }
      insights.push(`피크 시간대: ${label}(${top.count}건)`);
    }
  }

  // 미분류 안내
  if (targetEntry) {
    const etc = Math.max(0, targetEntry.total - targetEntry.blocks - targetEntry.chat);
    if (etc > 0) {
      const pct = targetEntry.total ? Math.round((etc / targetEntry.total) * 100) : 0;
      insights.push(`모드 미기록 ${etc}건 포함(전체의 ${pct}%)`);
    }
  }

  return insights;
}

// 월간 보고서(.xlsx) 시트 배열 — 대상 월(targetMonth) 하나를 골라 그 달의 상세(일별·요일·시간대·
// 모드·퍼널) + 12개월 개요를 함께 담는다. targetMonth 생략/null이면 defaultReportMonth로 결정(D6).
// target이 report에 없는 달(갭)이거나 report가 비어 있어도 예외를 던지지 않고 0/'—'로 채운다(D4).
export function buildMonthlyReportSheets(stats, nowYmd, targetMonth, stampText) {
  const s = stats || {};
  const report = s.report || [];
  const target = (targetMonth === undefined || targetMonth === null)
    ? defaultReportMonth(report, nowYmd)
    : targetMonth;
  const nowMonth = nowYmd.slice(0, 7);
  const partial = target !== null && target === nowMonth;
  const idx = report.findIndex((m) => m.month === target);
  const entry = idx >= 0 ? report[idx] : undefined;

  // 핵심 요약 — buildInsights의 규칙 기반 코멘트 + 생성 시각(주입된 stampText) + 데이터 범위
  const insightRows = [["항목", "내용"]]
    .concat(buildInsights(s, target, nowMonth).map((line, i) => [`코멘트 ${i + 1}`, line]));
  if (stampText) insightRows.push(["생성 시각", stampText + " (KST)"]);
  if (report.length) insightRows.push(["데이터 범위", `${report[0].monthLabel} ~ ${report[report.length - 1].monthLabel}`]);

  // ① 요약(YYYY.MM) — 대상 월의 총계·전월 대비(숫자)·전년 동월·모드·가동일·최다 생성일
  const total = entry ? entry.total : 0;
  const blocks = entry ? entry.blocks : 0;
  const chat = entry ? entry.chat : 0;
  const etc = Math.max(0, total - blocks - chat);
  const momVal = partial ? "진행 중" : momPctNumber(total, idx > 0 ? report[idx - 1] : null, target);
  const pyEntry = report.find((m) => m.month === priorYearKey(target));
  const priorYearVal = pyEntry ? pyEntry.total : "—";

  const summaryRows = [
    ["항목", "값"],
    ["대상 월", ymLabel(target) + (partial ? " (진행 중)" : "")],
    ["총 생성", total],
    ["전월 대비(%)", momVal],
    ["전년 동월 총 생성", priorYearVal],
    ["블록", blocks],
    ["대화", chat],
    ["미분류", etc],
    ["가동일수", entry ? entry.activeDays : 0],
    ["가동일 평균", entry ? entry.avgActive : 0],
    ["최다 생성일", entry && entry.peakLabel ? entry.peakLabel : "—"],
    ["최다 수", entry ? entry.peakCount : 0],
  ];
  if (partial) {
    // 월말 단순 추정 — 진행 중인 달에만 추가, 라벨에 "단순 추정" 명시(추정치를 라벨 없이 표기 금지)
    const elapsedDays = Number(nowYmd.slice(8, 10));
    const estimate = elapsedDays ? Math.round((total / elapsedDays) * daysInMonth(target)) : 0;
    summaryRows.push(["월말 예상(단순 추정)", estimate]);
  }

  // ② 일별 — 대상 월만 + 월 누적
  const trendRows = [["날짜", "생성 수", "월 누적"]];
  let cum = 0;
  (s.dailyFull || []).filter((d) => d.month === target).forEach((d) => {
    cum += d.count;
    trendRows.push([d.label, d.count, cum]);
  });

  // ③ 요일별 ④ 시간대별 — 대상 월의 분해(entry.weekday/hourly). top-level 12개월 총합이 아니다.
  // 예외: target이 null(=report가 통째로 비어 대상 월 자체를 정할 수 없음, D5)일 때는 D4의
  // "targetMonth가 report에 없는 갭"과 다른 상태이므로 T2 이전 하위 호환을 위해 top-level
  // s.weekday/s.hourly로 대체한다(report가 있는데 target만 못 찾은 진짜 갭은 계속 헤더만).
  const weekdaySource = target === null ? (s.weekday || []) : ((entry && entry.weekday) || []);
  const hourlySource = target === null ? (s.hourly || []) : ((entry && entry.hourly) || []);
  const weekdayRows = [["요일", "생성 수", "가동일수", "가동일 평균"]]
    .concat(weekdaySource.map((d) => [d.label, d.count, d.activeDays, d.avg]));
  const hourlyRows = [["시간대", "생성 수", "비율(%)"]]
    .concat(hourlySource.map((d) => [d.label, d.count, d.share]));

  // ⑤ 12개월 개요 — 기존 "월별 분석" 표, 전월 대비·블록 비율은 숫자 셀(T5, 헤더에 (%) 단위 명시)
  const monthRows = [["월", "총 생성", "전월 대비(%)", "블록", "대화", "블록 비율(%)", "가동일수", "가동일 평균", "최다 생성일", "최다 수"]];
  report.forEach((m, i) => {
    const p = m.month === nowMonth;
    monthRows.push([
      m.monthLabel + (p ? " (진행 중)" : ""), m.total,
      momPctCell(m.total, report[i - 1], m.month, p),
      m.blocks, m.chat, m.blocksPct,
      m.activeDays, m.avgActive, m.peakLabel, m.peakCount,
    ]);
  });

  // ⑥ 모드별 — 대상 월 기준(과거처럼 전체 report 합산이 아님). 비율은 숫자 셀(T5)
  const pctOf = (n) => (total ? Math.round((n / total) * 100) : 0);
  const modeRows = [
    ["모드", "생성 수", "비율(%)"],
    ["블록", blocks, pctOf(blocks)],
    ["대화", chat, pctOf(chat)],
  ];
  if (etc > 0) modeRows.push(["미분류", etc, pctOf(etc)]);
  modeRows.push(["합계", total, 100]);

  const sheets = [
    { name: "핵심 요약", rows: insightRows },
    { name: `요약(${ymLabel(target)})`, rows: summaryRows },
    { name: "일별", rows: trendRows },
    { name: "요일별", rows: weekdayRows },
    { name: "시간대별", rows: hourlyRows },
    { name: "12개월 개요", rows: monthRows },
    { name: "모드별", rows: modeRows },
  ];

  // ⑦ 이용 퍼널 — stats.funnel.monthly에서 target을 조회(D7, 현재 달이어도 top-level 아님).
  // 해당 월이 없으면 전부 0. stats.funnel 자체가 없으면(T1 SQL 미적용) 시트를 생략(오류 금지).
  if (s.funnel) {
    const fEntry = (s.funnel.monthly || []).find((m) => m.month === target) || {
      visits: 0, modeSelects: 0, ok: 0, blocked: 0, error: 0, blockRate: 0, perSession: 0,
    };
    sheets.push({
      name: "이용 퍼널",
      rows: [
        ["항목", "값"],
        ["방문", fEntry.visits],
        ["모드 선택", fEntry.modeSelects],
        ["생성 성공", fEntry.ok],
        ["차단", fEntry.blocked],
        ["오류", fEntry.error],
        ["차단율(%)", fEntry.blockRate],
        ["세션당 시도", fEntry.perSession],
      ],
    });
  }

  return sheets;
}

// ===================== 원본 데이터 내보내기 (T5) =====================

const EXPORT_ROW_CAP = 50000; // 시트당 최대 행수 — 넘으면 최신 것만 남기고 나머지는 안내 행 하나로 대체

// items(오름차순, {t, ...}) → 시트 rows(헤더 제외). EXPORT_ROW_CAP을 넘으면 오래된 것부터 잘라
// 최신 cap건만 남기고 마지막 행에 "이후 생략 (총 N행)"(N=원본 전체 건수) 안내를 붙인다.
// 정확히 cap이면 자르지 않는다("넘으면"이므로 경계값 그 자체가 아니라 초과일 때만 발동).
export function capRows(items, toRow) {
  const list = items || [];
  if (list.length <= EXPORT_ROW_CAP) return list.map(toRow);
  const total = list.length;
  const kept = list.slice(-EXPORT_ROW_CAP).map(toRow);
  kept.push([`이후 생략 (총 ${total}행)`]);
  return kept;
}

// /api/export 응답({generations, events}) → downloadXlsx용 sheets 배열.
// events가 없으면(T1 미적용 서버) '이벤트' 시트 자체를 생략(오류 금지) — buildMonthlyReportSheets의
// 이용 퍼널 시트와 동일한 정책.
export function buildExportSheets(data) {
  const d = data || {};
  const sheets = [
    {
      name: "생성기록",
      rows: [["일시(KST)", "모드"]].concat(capRows(d.generations, (r) => [r.t, r.mode])),
    },
  ];
  if (d.events) {
    sheets.push({
      name: "이벤트",
      rows: [["일시(KST)", "종류", "모드", "언어"]].concat(
        capRows(d.events, (r) => [r.t, r.type, r.mode, r.lang]),
      ),
    });
  }
  return sheets;
}
