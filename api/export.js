// 원본 데이터 내보내기: 12개월 창(windowStartISO)의 generations(+events, T1 적용 완료 상태 가정)를
// 오름차순 페이지네이션으로 모두 읽어 KST 타임스탬프로 변환해 반환. 개인정보(프롬프트 원문·IP·UA)
// 컬럼 없음. /api/stats 응답에는 이 원본 행을 절대 섞지 않는다(payload 비대 방지, 별도 엔드포인트).
import { createClient } from '@supabase/supabase-js';
import { windowStartISO, kstDateTime } from './_aggregate.js';
import { checkAdminKey } from './_auth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 해당 기간 행을 페이지네이션으로 모두 가져옴 (행 1000개 제한 회피).
// 오름차순 정렬 → 조회 도중 새 행은 맨 뒤에 붙어 이미 읽은 페이지가 밀리지 않음(중복 방지).
async function fetchPaged(table, columns, sinceISO) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function isMissingTable(e) {
  const code = e && e.code;
  const msg = (e && (e.message || e.details)) || '';
  return code === '42P01' || /does not exist|relation .* does not/i.test(msg);
}

export default async function handler(req, res) {
  // R4 — 관리자 접근 보호: api/stats.js와 동일 정책(checkAdminKey 공유).
  const authStatus = checkAdminKey(req.headers['x-admin-key'], process.env.ADMIN_KEY);
  if (authStatus === 'unauthorized') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const sinceISO = windowStartISO(Date.now(), 12);

    const genRows = await fetchPaged('generations', 'created_at, mode', sinceISO);
    const generations = genRows.map((r) => ({
      t: kstDateTime(new Date(r.created_at).getTime()),
      mode: r.mode,
    }));

    // events 테이블이 없거나(T1 SQL 미적용) 비어 있으면 빈 배열로 우아하게 처리(stats.js와 동일 정책)
    let events = [];
    try {
      const evRows = await fetchPaged('events', 'created_at, type, mode, lang', sinceISO);
      events = evRows.map((r) => ({
        t: kstDateTime(new Date(r.created_at).getTime()),
        type: r.type,
        mode: r.mode,
        lang: r.lang,
      }));
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      events = [];
    }

    const payload = { generations, events };
    if (authStatus === 'unset') payload.warning = 'ADMIN_KEY 미설정';
    return res.status(200).json(payload);
  } catch (e) {
    const code = e && e.code;
    let msg = (e && (e.message || e.details)) || '원본 데이터를 불러오지 못했어요.';
    if (isMissingTable(e)) {
      msg = "‘generations’ 테이블이 없어요. Supabase SQL Editor에서 테이블을 먼저 만들어 주세요.";
    }
    return res.status(500).json({ error: msg, code: code || null });
  }
}
