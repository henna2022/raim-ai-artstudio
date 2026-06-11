// 이미지 생성: OpenAI(GPT Image) → Supabase 저장 → 공개 URL 반환 + 통계 기록
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET || 'artworks';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '그림 설명이 필요해요.' });
    }

    const banned = ['누드','나체','섹스','성인','야한','폭력','피','살해','죽이','자살','마약','담배','술','칼',
                    'nude','naked','sex','sexual','nsfw','porn','blood','gore','kill','suicide','drug','weapon','gun','knife'];
    const low = prompt.toLowerCase();
    if (banned.some((w) => low.includes(w.toLowerCase()))) {
      return res.status(400).json({ error: '그건 그릴 수 없어요. 다른 멋진 걸 그려볼까요?' });
    }

    const safePrompt =
      '어린이를 위한 밝고 귀엽고 다정한 동화책 일러스트 스타일, 부드러운 파스텔 색감, 안전한 분위기, 글자 없음. ' + prompt;

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'gpt-image-1-mini',
        prompt: safePrompt,
        n: 1,
        size: '1024x1024',
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || '이미지 생성에 실패했어요.' });

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: '이미지 데이터를 받지 못했어요.' });
    const buffer = Buffer.from(b64, 'base64');

    const filename = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType: 'image/png' });
    if (upErr) return res.status(500).json({ error: '저장에 실패했어요: ' + upErr.message });

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    await logGeneration();
    await cleanupOld();
    return res.status(200).json({ url: pub.publicUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}

async function logGeneration() {
  try { await supabase.from('generations').insert({}); } catch (e) {}
}
async function cleanupOld() {
  try {
    const cutoff = Date.now() - 5 * 60 * 60 * 1000;
    const { data: files } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    const old = (files || []).filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff).map((f) => f.name);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  } catch (e) {}
}