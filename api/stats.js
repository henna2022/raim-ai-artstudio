// 생성 통계: generations 테이블에서 오늘/누적/모드별 + 일별/주별/월별 카운트를 반환
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const KST = 9 * 3600 * 1000; // UTC+9
const DAY = 24 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const WD = ['일', '월', '화', '수', '목', '금', '토'];

// created_at(UTC ms) → KST 달력 기준 Date (UTC getter로 KST 값을 읽음)
const kst = (ms) => new Date(ms + KST);

// 집계 키 (KST 기준)
const dayKey = (ms) => { const d = kst(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const monthKey = (ms) => { const d = kst(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const weekKey = (ms) => { // 그 주 월요일(KST) 날짜를 키로
  const d = kst(ms);
  const back = (d.getUTCDay() + 6) % 7; // 일=0 → 월요일까지 거슬러 올라갈 일수
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - back * DAY);
  return `${mon.getUTCFullYear()}-${pad(mon.getUTCMonth() + 1)}-${pad(mon.getUTCDate())}`;
};

// 표시 라벨
const dayLabel = (key) => { const d = new Date(key + 'T00:00:00Z'); return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}(${WD[d.getUTCDay()]})`; };
const weekLabel = (key) => {
  const s = new Date(key + 'T00:00:00Z');
  const e = new Date(s.getTime() + 6 * DAY);
  return `${pad(s.getUTCMonth() + 1)}/${pad(s.getUTCDate())}~${pad(e.getUTCMonth() + 1)}/${pad(e.getUTCDate())}`;
};
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${y}.${m}`; };

// 최근 n개 구간만 (최신순) 라벨/카운트로 변환
const series = (map, n, labelFn) =>
  Object.keys(map)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, n)
    .map((key) => ({ label: labelFn(key), count: map[key] }));

export default async function handler(req, res) {
  try {
    // 한국 시간(KST) 기준 오늘 0시의 UTC 시각
    const kstNow = new Date(Date.now() + KST);
    const todayStartMs = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST;
    const todayStartISO = new Date(todayStartMs).toISOString();
    // 월별(최근 12개월)까지 집계하려면 약 1년치가 필요
    const sinceISO = new Date(todayStartMs - 365 * DAY).toISOString();

    const countOf = async (build) => {
      let q = supabase.from('generations').select('*', { count: 'exact', head: true });
      if (build) q = build(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };

    const [total, today, blocks, chat] = await Promise.all([
      countOf(),
      countOf((q) => q.gte('created_at', todayStartISO)),
      countOf((q) => q.eq('mode', 'blocks')),
      countOf((q) => q.eq('mode', 'chat')),
    ]);

    // 최근 1년치 행을 페이지네이션으로 모두 가져와 일/주/월 집계 (행 1000개 제한 회피)
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await supabase
        .from('generations')
        .select('created_at')
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const dMap = {}, wMap = {}, mMap = {};
    for (const r of rows) {
      const ms = new Date(r.created_at).getTime();
      const dk = dayKey(ms), wk = weekKey(ms), mk = monthKey(ms);
      dMap[dk] = (dMap[dk] || 0) + 1;
      wMap[wk] = (wMap[wk] || 0) + 1;
      mMap[mk] = (mMap[mk] || 0) + 1;
    }

    const daily = series(dMap, 14, dayLabel);
    const weekly = series(wMap, 12, weekLabel);
    const monthly = series(mMap, 12, monthLabel);

    return res.status(200).json({ total, today, byMode: { blocks, chat }, daily, weekly, monthly });
  } catch (e) {
    const code = e && e.code;
    let msg = (e && (e.message || e.details)) || '통계를 불러오지 못했어요.';
    // generations 테이블이 없을 때(42P01) 명확한 안내
    if (code === '42P01' || /does not exist|relation .* does not/i.test(msg)) {
      msg = "‘generations’ 테이블이 없어요. Supabase SQL Editor에서 테이블을 먼저 만들어 주세요.";
    }
    return res.status(500).json({ error: msg, code: code || null });
  }
}
