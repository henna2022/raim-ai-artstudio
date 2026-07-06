// 생성 통계: generations 테이블에서 최근 1년치를 읽어 KST 기준 대시보드/레포트 집계를 반환
import { createClient } from '@supabase/supabase-js';
import { aggregate, windowStartISO } from './_aggregate.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  try {
    // 월별 12개월 분석을 정확히 커버하는 시작점(12개월 전 1일, KST)
    const sinceISO = windowStartISO(Date.now(), 12);

    // 해당 기간 행을 페이지네이션으로 모두 가져와 집계 (행 1000개 제한 회피).
    // 오름차순 정렬 → 조회 도중 새 행은 맨 뒤에 붙어 이미 읽은 페이지가 밀리지 않음(중복 방지).
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await supabase
        .from('generations')
        .select('created_at, mode')
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    return res.status(200).json(aggregate(rows, Date.now()));
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
