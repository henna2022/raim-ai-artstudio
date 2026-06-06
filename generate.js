// 이미지 생성: Google Gemini(2.5 Flash Image, "Nano Banana")로 그림 생성
// → Supabase Storage에 저장 → 공개 URL 반환. (Vercel 서버리스 함수)
// 비밀 키는 Vercel 환경변수에만 저장됩니다(태블릿에 노출 안 됨). 카드 등록 불필요.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET || 'artworks';

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

    // (3) Gemini 이미지 생성 호출
    const model = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: safePrompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data?.error?.message || '이미지 생성에 실패했어요.' });
    }

    // (4) 응답에서 이미지(base64) 추출
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      return res.status(502).json({ error: '이미지를 받지 못했어요. 다시 시도해 주세요.' });
    }
    const b64 = imgPart.inlineData.data;
    const mime = imgPart.inlineData.mimeType || 'image/png';
    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    const buffer = Buffer.from(b64, 'base64');

    // (5) Supabase Storage에 저장
    const filename = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType: mime });
    if (upErr) return res.status(500).json({ error: '저장에 실패했어요: ' + upErr.message });

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    // (6) 5시간 지난 그림 정리 (용량 절약 + QR 5시간 만료)
    await cleanupOld();

    return res.status(200).json({ url: pub.publicUrl });

  } catch (e) {
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}

// 5시간 이상 지난 그림 삭제. 새 그림이 만들어질 때마다 한 번씩 정리합니다.
async function cleanupOld() {
  try {
    const cutoff = Date.now() - 5 * 60 * 60 * 1000; // 5시간
    const { data: files } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    const old = (files || [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
      .map((f) => f.name);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  } catch (e) {
    // 정리 실패는 사용자 흐름에 영향 없음
  }
}
