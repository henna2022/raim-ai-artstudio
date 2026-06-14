// 생성 통계: generations 테이블에서 오늘/누적/모드별/날짜별 카운트를 반환
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const KST = 9 * 3600 * 1000; // UTC+9

export default async function handler(req, res) {
  try {
    // 한국 시간(KST) 기준 오늘 0시의 UTC 시각
    const kstNow = new Date(Date.now() + KST);
    const todayStartMs = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST;
    const todayStartISO = new Date(todayStartMs).toISOString();
    const since30ISO = new Date(todayStartMs - 29 * 24 * 3600 * 1000).toISOString();

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

    // 최근 30일 날짜별 집계 (KST 기준)
    const { data: rows, error: rowsErr } = await supabase
      .from('generations').select('created_at').gte('created_at', since30ISO);
    if (rowsErr) throw rowsErr;
    const dailyMap = {};
    for (const r of (rows || [])) {
      const day = new Date(new Date(r.created_at).getTime() + KST).toISOString().slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    }
    const daily = Object.entries(dailyMap)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));

    return res.status(200).json({ total, today, byMode: { blocks, chat }, daily });
  } catch (e) {
    return res.status(500).json({ error: e.message || '통계를 불러오지 못했어요.' });
  }
}
