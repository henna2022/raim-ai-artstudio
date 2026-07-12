// 관리자 대시보드 KPI 빌더 (순수 함수 — DOM·Date/현재시각 접근 금지, 브라우저/Node 겸용)
// 기준일(nowYmd = 'YYYY-MM-DD', KST 달력일)은 호출자가 주입한다.
// 날짜 연산은 Date 객체 없이 civil-days(Howard Hinnant) 알고리즘으로 결정적으로 수행.

const pad2 = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' → 1970-01-01 기준 경과 일수 (그레고리력, 타임존 무관)
function ymdToDays(ymd) {
  const [y0, m, d] = ymd.split('-').map(Number);
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// 경과 일수 → 'YYYY-MM-DD'
function daysToYmd(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return `${m <= 2 ? y + 1 : y}-${pad2(m)}-${pad2(d)}`;
}

// 경과 일수 → 요일 (0=월 .. 6=일). 1970-01-01은 목요일(=3).
const dowMon0 = (days) => (((days + 3) % 7) + 7) % 7;

// 증감 %: 분모(prev)가 0이거나 없으면 null, 아니면 부호 포함 정수(Math.round)
function pctChange(cur, prev) {
  if (!(typeof prev === 'number' && prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// [{date:'YYYY-MM-DD', ...}] 배열 → date → 숫자값 맵
function byDate(arr, field) {
  const map = {};
  for (const row of arr) {
    if (row && typeof row.date === 'string') map[row.date] = Number(row[field]) || 0;
  }
  return map;
}

// stats(서버 /api/stats 응답) + 기준일 → 대시보드 상단 KPI 묶음
export function buildKpis(stats, nowYmd) {
  const s = stats || {};
  const today = ymdToDays(nowYmd);
  const dow = dowMon0(today); // 이번 주 월요일로부터의 경과 일수

  // ---- 방문 KPI (stats.funnelDaily 기반) ----
  // funnelDaily가 없거나 빈 배열(구버전 서버 응답)이면 방문 관련 KPI는 전부 null — 예외 금지.
  let todayVisits = null, vsYesterdayPct = null, thisWeekVisits = null, vsLastWeekPct = null;
  const fd = Array.isArray(s.funnelDaily) && s.funnelDaily.length ? s.funnelDaily : null;
  if (fd) {
    const visits = byDate(fd, 'visits');
    const at = (days) => visits[daysToYmd(days)]; // 없는 날짜 → undefined
    todayVisits = at(today) || 0;
    const yesterday = at(today - 1);
    vsYesterdayPct = pctChange(todayVisits, yesterday);

    // 이번 주(월~오늘) 누적 vs 지난주 같은 경과 시점(지난주 월~같은 요일) 누적.
    // 지난주 목~일 등 "아직 오지 않은 요일"은 분모에 넣지 않는다(같은 경과 시점 비교).
    let cur = 0, prev = 0;
    for (let i = 0; i <= dow; i++) {
      cur += at(today - dow + i) || 0;
      prev += at(today - 7 - dow + i) || 0;
    }
    thisWeekVisits = cur;
    vsLastWeekPct = pctChange(cur, prev);
  }

  // ---- 생성 KPI (stats.dailyFull 기반 — 데이터 있는 날만 담기므로 없는 날은 0으로 간주) ----
  let todayGen = null, vsYesterdayGenPct = null;
  if (Array.isArray(s.dailyFull)) {
    const gen = byDate(s.dailyFull, 'count');
    todayGen = gen[nowYmd] || 0;
    vsYesterdayGenPct = pctChange(todayGen, gen[daysToYmd(today - 1)]);
  }

  return {
    todayVisits,
    vsYesterdayPct,
    thisWeekVisits,
    vsLastWeekPct,
    todayGen,
    vsYesterdayGenPct,
    hourly: s.hourly !== undefined ? s.hourly : null, // 그대로 전달
  };
}
