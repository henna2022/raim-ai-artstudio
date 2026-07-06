// 방문·모드선택 이벤트 로깅 (개인정보 없음). 로깅 실패가 UX를 막으면 안 되므로 항상 200 반환.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = ['visit', 'mode_select']; // 생성 계열(generate_*)은 서버(api/generate.js)가 직접 기록

const validSessionId = (v) => (typeof v === 'string' && UUID_RE.test(v)) ? v : null;
const validMode = (v) => (v === 'blocks' || v === 'chat') ? v : null;
const validLang = (v) => (v === 'ko' || v === 'en') ? v : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: false });

  try {
    let body = req.body;
    // navigator.sendBeacon으로 보낸 Blob(JSON)은 Content-Type에 따라 문자열로 들어올 수 있음
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};

    const type = ALLOWED_TYPES.includes(body.type) ? body.type : null;
    if (type) {
      await supabase.from('events').insert({
        type,
        session_id: validSessionId(body.session_id),
        mode: validMode(body.mode),
        lang: validLang(body.lang),
      });
    }
  } catch (e) {
    // 로깅 실패는 무시 — 절대 UX를 깨지 않음
  }
  return res.status(200).json({ ok: true });
}
