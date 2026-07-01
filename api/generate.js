// 이미지 생성: OpenAI(GPT Image) → 로고 합성 → WebP 변환 → 저장(R2 설정 시 R2, 아니면 Supabase) → 공개 URL 반환 + 통계 기록
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { addLogo } from './_watermark.js';
import { uploadPublic, cleanupOld } from './_storage.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });
  try {
    const { prompt, mode } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '그림 설명이 필요해요.' });
    }

    const low = prompt.toLowerCase();

    const banned = ['누드','나체','섹스','성인','야한','폭력','피','살해','죽이','자살','마약','담배','술','칼',
                    'nude','naked','sex','sexual','nsfw','porn','blood','gore','kill','suicide','drug','weapon','gun','knife'];
    if (banned.some((w) => low.includes(w.toLowerCase()))) {
      return res.status(400).json({ error: '그건 그릴 수 없어요. 다른 멋진 걸 그려볼까요?' });
    }

    // 저작권 보호: 유명 캐릭터/IP/유명인 등은 생성하지 않음 (오탐 적은 고유 명칭만 차단)
    const copyrighted = [
      // 캐릭터/IP (한글)
      '포켓몬','피카츄','마리오','슈퍼마리오','루이지','소닉','디즈니','미키마우스','엘사','겨울왕국','라푼젤',
      '스파이더맨','아이언맨','배트맨','슈퍼맨','헐크','어벤져스','캡틴아메리카','토토로','도라에몽','짱구',
      '나루토','드래곤볼','유희왕','디지몬','세일러문','명탐정코난','뽀로로','핑크퐁',
      '로보카폴리','둘리','펭수','잔망루피','카카오프렌즈','헬로키티','쿠로미','시나모롤','곰돌이푸','스누피',
      '스폰지밥','미니언즈','심슨','마인크래프트','로블록스','어몽어스','쿠키런','브롤스타즈','방탄소년단','블랙핑크','뉴진스',
      // 캐릭터/IP (영문)
      'pokemon','pokémon','pikachu','super mario','luigi','bowser','disney','mickey mouse','frozen elsa','rapunzel',
      'spider-man','spiderman','iron man','ironman','batman','superman','avengers','totoro','doraemon','naruto',
      'dragon ball','yugioh','yu-gi-oh','digimon','sailor moon','pororo','pinkfong','hello kitty','kuromi',
      'cinnamoroll','winnie the pooh','snoopy','spongebob','minecraft','roblox','among us','cookie run','brawl stars',
      'blackpink','newjeans',
    ];
    if (copyrighted.some((w) => low.includes(w.toLowerCase()))) {
      return res.status(400).json({ error: '유명한 캐릭터나 사람은 그릴 수 없어요. 우리만의 새로운 친구를 만들어볼까요? 😊' });
    }

    const safePrompt =
      '어린이를 위한 밝고 귀엽고 다정한 동화책 일러스트 스타일, 부드러운 파스텔 색감, 안전한 분위기, 글자 없음. ' +
      '실제 인물·연예인·유명 캐릭터·로고·브랜드는 절대 그리지 말고, 원작과 무관한 새롭고 독창적인 캐릭터로 그려. ' + prompt;

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.IMAGE_MODEL || 'gpt-image-1-mini',
        prompt: safePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || '이미지 생성에 실패했어요.' });

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: '이미지 데이터를 받지 못했어요.' });
    const buffer = Buffer.from(b64, 'base64');

    // 우측 하단에 서울라임 로고 합성 (합성 실패 시 원본 그대로 업로드)
    let outBuffer = buffer;
    try {
      outBuffer = await addLogo(buffer);
    } catch (e) {
      console.error('로고 합성 실패, 원본 업로드:', e?.message || e);
    }

    // 저장 용량 절감: 업로드 직전 WebP(품질 80)로 변환 (PNG 대비 약 70~80% 감소)
    const webp = await sharp(outBuffer).webp({ quality: 80 }).toBuffer();

    const filename = `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    let url;
    try {
      url = await uploadPublic(filename, webp, 'image/webp');
    } catch (e) {
      return res.status(500).json({ error: '저장에 실패했어요: ' + (e?.message || e) });
    }

    await logGeneration(mode);
    await cleanupOld(Date.now() - 5 * 60 * 60 * 1000);
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}

async function logGeneration(mode) {
  const m = (mode === 'blocks' || mode === 'chat') ? mode : null;
  try { await supabase.from('generations').insert({ mode: m }); } catch (e) {}
}