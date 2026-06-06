// 이미지 생성: Pollinations.ai(FLUX)로 그림 생성 → Supabase Storage 저장 → 공개 URL 반환
// Pollinations는 키·카드·로그인 없이 무료로 쓸 수 있어요. (Vercel 서버리스 함수)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET || 'artworks';

// 이미지 생성이 가끔 길어질 수 있어 함수 제한시간을 늘려둠 (Vercel)
export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '그림 설명이 필요해요.' });
    }

    // (1) 어린이 안전 단어 가드
    const banned = ['누드','나체','섹스','성인','야한','폭력','피','살해','죽이','자살','마약','담배','술',
                    'nude','naked','sex','sexual','nsfw','porn','blood','gore','kill','suicide','drug','weapon','gun'];
    const low = prompt.toLowerCase();
    if (banned.some((w) => low.includes(w.toLowerCase()))) {
      return res.status(400).json({ error: '그건 그릴 수 없어요. 다른 멋진 걸 그려볼까요? 🙂' });
    }

    // (2) 안전 프롬프트
    const safePrompt =
      "A bright, cute, friendly children's book illustration, soft pastel colors, safe and wholesome, no text. " + prompt;

    // (3) Pollinations(FLUX)로 이미지 생성
    const params = new URLSearchParams({
      width: '1024',
      height: '1024',
      nologo: 'true',        // 워터마크 없음
      model: 'flux',
      safe: 'true',          // 안전 필터 켬
      seed: String(Math.floor(Math.random() * 100000)),
    });
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?${params.toString()}`;

    // Pollinations 호출 (콜드스타트 대비 재시도 + 브라우저 헤더)
    const fetchHeaders = { 'User-Agent': 'Mozilla/5.0 (compatible; AIArtMuseum/1.0)' };
    let imgResp;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      imgResp = await fetch(imgUrl, { headers: fetchHeaders });
      if (imgResp.ok) break;
      lastStatus = imgResp.status;
      await new Promise((r) => setTimeout(r, 3000)); // 3초 기다렸다 재시도
    }
    if (!imgResp || !imgResp.ok) {
      return res.status(502).json({ error: `이미지 서비스가 잠시 불안정해요 (상태 ${lastStatus}). 잠시 후 다시 눌러주세요.` });
    }
    const mime = imgResp.headers.get('content-type') || 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(await imgResp.arrayBuffer());

    if (!buffer || buffer.length < 1000) {
      return res.status(502).json({ error: '이미지를 제대로 받지 못했어요. 다시 시도해 주세요.' });
    }

    // (4) Supabase Storage에 저장
    const filename = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType: mime });
    if (upErr) return res.status(500).json({ error: '저장에 실패했어요: ' + upErr.message });

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    // (5) 5시간 지난 그림 정리
    await cleanupOld();

    return res.status(200).json({ url: pub.publicUrl });

  } catch (e) {
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}

// 5시간 이상 지난 그림 삭제 (용량 절약 + QR 5시간 만료)
async function cleanupOld() {
  try {
    const cutoff = Date.now() - 5 * 60 * 60 * 1000;
    const { data: files } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    const old = (files || [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
      .map((f) => f.name);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  } catch (e) {
    // 정리 실패는 사용자 흐름에 영향 없음
  }
}