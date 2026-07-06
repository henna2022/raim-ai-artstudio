// 생성 통계 집계 (순수 함수: Supabase 등 외부 의존성 없음 → 단위 테스트 가능)
// 입력 rows: [{ created_at, mode }] (created_at = UTC ISO/ms), 모두 KST(한국시간) 기준으로 집계.

const KST = 9 * 3600 * 1000; // UTC+9
const DAY = 24 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const WD = ['일', '월', '화', '수', '목', '금', '토'];

// created_at(UTC ms) → KST 달력 기준 Date (UTC getter로 KST 값을 읽음)
const kst = (ms) => new Date(ms + KST);

// 집계 키 (KST 기준)
export const dayKey = (ms) => { const d = kst(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const monthKey = (ms) => { const d = kst(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
export const weekKey = (ms) => { // 그 주 월요일(KST) 날짜를 키로
  const d = kst(ms);
  const back = (d.getUTCDay() + 6) % 7; // 일=0 → 월요일까지 거슬러 올라갈 일수
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - back * DAY);
  return `${mon.getUTCFullYear()}-${pad(mon.getUTCMonth() + 1)}-${pad(mon.getUTCDate())}`;
};

// 표시 라벨
export const dayLabel = (key) => { const d = new Date(key + 'T00:00:00Z'); return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}(${WD[d.getUTCDay()]})`; };
export const weekLabel = (key) => {
  const s = new Date(key + 'T00:00:00Z');
  const e = new Date(s.getTime() + 6 * DAY);
  return `${pad(s.getUTCMonth() + 1)}/${pad(s.getUTCDate())}~${pad(e.getUTCMonth() + 1)}/${pad(e.getUTCDate())}`;
};
export const monthLabel = (key) => { const [y, m] = key.split('-'); return `${y}.${m}`; };

// KST 'YYYY-MM-DD HH:mm' 문자열 (원본 데이터 내보내기용). Date 로케일 함수(toLocaleString 등) 대신
// 위와 동일한 kst() 시프트 + UTC getter 방식으로 순수 구현 — 타임존 데이터 없이도 결정적으로 동작.
export const kstDateTime = (ms) => {
  const d = kst(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

// 최근 n개 구간만 (최신순) 라벨/카운트로 변환
const series = (map, n, labelFn) =>
  Object.keys(map)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, n)
    .map((key) => ({ label: labelFn(key), count: map[key] }));

// nowMs 기준, 정확히 months개 달을 커버하는 조회 시작점(그 달 1일 00:00 KST)의 UTC ISO
export function windowStartISO(nowMs, months) {
  const d = kst(nowMs);
  let y = d.getUTCFullYear(), m = d.getUTCMonth() - (months - 1);
  while (m < 0) { m += 12; y -= 1; }
  return new Date(Date.UTC(y, m, 1) - KST).toISOString();
}

// rows + 기준시각(nowMs) → 대시보드/레포트에 필요한 모든 집계
export function aggregate(rows, nowMs) {
  const dMap = {}, wMap = {}, mMap = {};
  const wdMap = new Array(7).fill(0);   // 0=일 .. 6=토
  const hrMap = new Array(24).fill(0);  // 0시 .. 23시
  const monthAgg = {};                  // mk → { total, blocks, chat, dayMap:{dk:count} }

  for (const r of rows || []) {
    const ms = new Date(r.created_at).getTime();
    if (!(ms > 0)) continue; // NaN·null(→0)·음수 방어 (null created_at이 1970년으로 집계되는 것 차단)
    const d = kst(ms);
    const dk = dayKey(ms), wk = weekKey(ms), mk = monthKey(ms);
    dMap[dk] = (dMap[dk] || 0) + 1;
    wMap[wk] = (wMap[wk] || 0) + 1;
    mMap[mk] = (mMap[mk] || 0) + 1;
    wdMap[d.getUTCDay()]++;
    hrMap[d.getUTCHours()]++;
    const ma = monthAgg[mk] || (monthAgg[mk] = { total: 0, blocks: 0, chat: 0, dayMap: {}, wd: new Array(7).fill(0), hr: new Array(24).fill(0) });
    ma.total++;
    if (r.mode === 'blocks') ma.blocks++;
    else if (r.mode === 'chat') ma.chat++;
    ma.dayMap[dk] = (ma.dayMap[dk] || 0) + 1;
    ma.wd[d.getUTCDay()]++;
    ma.hr[d.getUTCHours()]++;
  }

  // 현재 기간 키 (KST)
  const nowDay = dayKey(nowMs), nowWeek = weekKey(nowMs), nowMonth = monthKey(nowMs);
  const today = dMap[nowDay] || 0;
  const thisWeek = wMap[nowWeek] || 0;
  const thisMonth = mMap[nowMonth] || 0;

  // 요일별 (월요일 시작 표시) — count는 12개월 총합(운영일 편중에 좌우됨).
  // activeDays·avg(가동일당 평균)는 정규화 지표: 관측 기회가 많은 요일이 무조건 커 보이는 걸 보정.
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const wdActiveDays = new Array(7).fill(0);
  for (const dk of Object.keys(dMap)) wdActiveDays[new Date(dk + 'T00:00:00Z').getUTCDay()]++;
  const weekday = WD_ORDER.map((d) => {
    const count = wdMap[d], activeDays = wdActiveDays[d];
    return { label: WD[d], count, activeDays, avg: activeDays ? Math.round((count / activeDays) * 10) / 10 : 0 };
  });

  // 시간대별 (0~23시) — share: 전체 대비 비율(%), 분모(전체 건수) 0이면 0
  const hrTotal = hrMap.reduce((a, b) => a + b, 0);
  const hourly = hrMap.map((c, h) => ({ label: pad(h) + '시', count: c, share: hrTotal ? Math.round((c / hrTotal) * 100) : 0 }));

  // 월별 분석 (오름차순 최근 12개월): 전월 대비 증감은 클라이언트/시트에서 인접 월로 계산 가능하도록 total 포함
  const report = Object.keys(monthAgg).sort().slice(-12).map((mk) => {
    const ma = monthAgg[mk];
    const dayKeys = Object.keys(ma.dayMap);
    const activeDays = dayKeys.length;
    let peakDate = '', peakCount = 0;
    for (const dk of dayKeys) if (ma.dayMap[dk] > peakCount) { peakCount = ma.dayMap[dk]; peakDate = dk; }

    // 그 달만의 요일별/시간대별 분해 (T3 — top-level weekday/hourly의 12개월 총합과는 별개)
    const mWdActiveDays = new Array(7).fill(0);
    for (const dk of dayKeys) mWdActiveDays[new Date(dk + 'T00:00:00Z').getUTCDay()]++;
    const mWeekday = WD_ORDER.map((d) => {
      const count = ma.wd[d], ad = mWdActiveDays[d];
      return { label: WD[d], count, activeDays: ad, avg: ad ? Math.round((count / ad) * 10) / 10 : 0 };
    });
    const mHrTotal = ma.hr.reduce((a, b) => a + b, 0);
    const mHourly = ma.hr.map((c, h) => ({ label: pad(h) + '시', count: c, share: mHrTotal ? Math.round((c / mHrTotal) * 100) : 0 }));

    return {
      month: mk,
      monthLabel: monthLabel(mk),
      total: ma.total,
      blocks: ma.blocks,
      chat: ma.chat,
      blocksPct: ma.total ? Math.round((ma.blocks / ma.total) * 100) : 0,
      activeDays,
      avgActive: activeDays ? Math.round((ma.total / activeDays) * 10) / 10 : 0,
      peakLabel: peakDate ? dayLabel(peakDate) : '',
      peakCount,
      weekday: mWeekday,
      hourly: mHourly,
    };
  });

  // 일별 전체(오름차순) — 레포트의 '일별 추이 + 월 누적'용.
  // report와 동일한 월 집합으로 제한해 시트 간 총계가 어긋나지 않게 한다.
  const reportMonths = new Set(report.map((r) => r.month));
  const dailyFull = Object.keys(dMap).sort()
    .filter((dk) => reportMonths.has(dk.slice(0, 7)))
    .map((dk) => ({ date: dk, label: dayLabel(dk), month: dk.slice(0, 7), count: dMap[dk] }));

  // 화면 차트용 최신순 시리즈
  const daily = series(dMap, 14, dayLabel);
  const weekly = series(wMap, 12, weekLabel);
  const monthly = series(mMap, 12, monthLabel);

  return { today, thisWeek, thisMonth, daily, weekly, monthly, weekday, hourly, report, dailyFull };
}

// ===================== 이용 퍼널 (events 테이블: 방문·모드선택·생성 성공/차단/오류) =====================
// aggregate()와 별개 함수 — 기존 aggregate() 시그니처/동작을 절대 건드리지 않는다(회귀 위험 0).
const FUNNEL_TYPES = ['visit', 'mode_select', 'generate_ok', 'generate_blocked', 'generate_error'];

function emptyFunnelCounts() {
  return { visits: 0, modeSelects: 0, ok: 0, blocked: 0, error: 0 };
}
// 시도(ok+blocked+error) 대비 차단율(%), 방문 대비 세션당 시도 수 — 분모 0이면 0(NaN·예외 없음)
function deriveFunnelRates(c) {
  const attempts = c.ok + c.blocked + c.error;
  return {
    ...c,
    blockRate: attempts ? Math.round((c.blocked / attempts) * 100) : 0,
    perSession: c.visits ? Math.round((attempts / c.visits) * 10) / 10 : 0,
  };
}

// events + 기준시각(nowMs) → 이번 달 기준 퍼널 + 월별 배열(최근 12개월)
export function aggregateFunnel(events, nowMs) {
  const nowMonth = monthKey(nowMs);
  const monthAgg = {}; // mk → counts

  for (const ev of events || []) {
    const ms = new Date(ev && ev.created_at).getTime();
    if (!(ms > 0)) continue; // 잘못된 created_at 방어 (aggregate()와 동일 정책)
    const type = ev && ev.type;
    if (!FUNNEL_TYPES.includes(type)) continue; // 알 수 없는/누락된 type은 무시

    const mk = monthKey(ms);
    const c = monthAgg[mk] || (monthAgg[mk] = emptyFunnelCounts());
    if (type === 'visit') c.visits++;
    else if (type === 'mode_select') c.modeSelects++;
    else if (type === 'generate_ok') c.ok++;
    else if (type === 'generate_blocked') c.blocked++;
    else if (type === 'generate_error') c.error++;
  }

  const monthly = Object.keys(monthAgg).sort().slice(-12).map((mk) => ({
    month: mk,
    monthLabel: monthLabel(mk),
    ...deriveFunnelRates(monthAgg[mk]),
  }));

  const current = deriveFunnelRates(monthAgg[nowMonth] || emptyFunnelCounts());

  return { ...current, monthly };
}
