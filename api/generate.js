// 이미지 생성: OpenAI(GPT Image) → 로고 합성 → WebP 변환 → 저장(R2 설정 시 R2, 아니면 Supabase) → 공개 URL 반환 + 통계 기록
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { addLogo } from './_watermark.js';
import { uploadPublic, cleanupOld } from './_storage.js';
import { checkPrompt } from './_filter.js';
import { checkPromptLength, evaluateGenerateRateLimit, isMissingTableError, GENERATE_WINDOW_MS } from './_limits.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validSessionId = (v) => (typeof v === 'string' && UUID_RE.test(v)) ? v : null;
const validLang = (v) => (v === 'ko' || v === 'en') ? v : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });

  const body = req.body || {};
  const mode = (body.mode === 'blocks' || body.mode === 'chat') ? body.mode : null;
  const lang = validLang(body.lang);
  const session_id = validSessionId(body.session_id);

  try {
    const { prompt } = body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '그림 설명이 필요해요.' });
    }

    // 0차: 입력 한도(하드 캡) — 무인증 공개 엔드포인트라 스크립트가 비정상적으로 긴 프롬프트로
    // 비용을 태울 수 있음. api/_limits.js의 순수 함수(tests/limits.test.mjs에서 단위 테스트).
    const lenCheck = checkPromptLength(prompt);
    if (!lenCheck.ok) {
      return res.status(400).json({ error: lenCheck.error });
    }

    // 1차: 키워드 필터 (순수 함수, api/_filter.js — 재설계 내역은 해당 파일 참고)
    const kwCheck = checkPrompt(prompt);
    if (!kwCheck.ok) {
      await logEvt('generate_blocked', { mode, lang, session_id, detail: kwCheck.reason });
      const msg = kwCheck.reason === 'copyright'
        ? '유명한 캐릭터나 사람은 그릴 수 없어요. 우리만의 새로운 친구를 만들어볼까요? 😊'
        : '그건 그릴 수 없어요. 다른 멋진 걸 그려볼까요?';
      return res.status(400).json({ error: msg });
    }

    // 2차: 의미 기반 가드 (OpenAI Moderation). 실패/타임아웃 시 fail-open —
    // 이미지 모델 자체의 안전장치가 있으므로 가용성을 우선한다.
    if (await moderationBlocked(prompt)) {
      await logEvt('generate_blocked', { mode, lang, session_id, detail: 'banned' });
      return res.status(400).json({ error: '그건 그릴 수 없어요. 다른 멋진 걸 그려볼까요?' });
    }

    // 3차: 호출 한도(Supabase 기반, 생성 직전 검사) — 서버리스 인스턴스는 메모리를 공유하지
    // 않으므로 events 테이블이 유일하게 신뢰 가능한 공유 상태다. 최근 60초의 generate_ok/error
    // 건수로 session_id 한도(≥3)와 전체 한도(≥20)를 판정한다(api/_limits.js 참고).
    // 알려진 한계: generate_ok/error는 생성이 *끝난 뒤*에만 기록되므로, 첫 60초 안에 동시다발로
    // 쏘는 버스트는 이 검사를 통과할 수 있다. events.type CHECK 제약(새 type 추가 금지) 아래에서는
    // "시도 시점 기록"이 구조적으로 불가능하다 — 이 한도는 지속 남용을 막는 베스트에포트이며
    // 완전한 방어를 주장하지 않는다.
    if (await isGenerateRateLimited(session_id)) {
      await logEvt('generate_blocked', { mode, lang, session_id, detail: 'ratelimit' });
      return res.status(429).json({ error: '지금은 그림을 너무 많이 그리고 있어요. 잠깐 쉬었다가 다시 해볼까요?' });
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
    if (!r.ok) {
      const reason = String(data?.error?.message || '이미지 생성 실패').slice(0, 100);
      await logEvt('generate_error', { mode, lang, session_id, detail: reason });
      return res.status(502).json({ error: data?.error?.message || '이미지 생성에 실패했어요.' });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      await logEvt('generate_error', { mode, lang, session_id, detail: '이미지 데이터 없음' });
      return res.status(502).json({ error: '이미지 데이터를 받지 못했어요.' });
    }
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
      const reason = String(e?.message || e).slice(0, 100);
      await logEvt('generate_error', { mode, lang, session_id, detail: reason });
      return res.status(500).json({ error: '저장에 실패했어요: ' + (e?.message || e) });
    }

    await logGeneration(mode); // 기존 generations insert(하위 호환 이중 기록)
    await logEvt('generate_ok', { mode, lang, session_id });
    await cleanupOld(Date.now() - 5 * 60 * 60 * 1000);
    return res.status(200).json({ url });
  } catch (e) {
    const reason = String(e?.message || e).slice(0, 100);
    await logEvt('generate_error', { mode, lang, session_id, detail: reason });
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}

// 의미 기반 가드: OpenAI Moderation API. 키워드 필터를 통과한 프롬프트만 대상으로 호출한다.
// 5초 타임아웃(AbortController) — 실패/타임아웃 시 통과(fail-open)시키고 console.error만 남긴다.
// (generate_error 이벤트는 기록하지 않음 — 이건 생성 실패가 아니라 가드 자체의 문제이므로.)
async function moderationBlocked(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: prompt }),
      signal: controller.signal,
    });
    if (!r.ok) {
      console.error('Moderation API 오류 응답:', r.status);
      return false;
    }
    const data = await r.json();
    const categories = data?.results?.[0]?.categories || {};
    const watched = ['sexual', 'sexual/minors', 'violence'];
    if (watched.some((c) => categories[c] === true)) return true;
    if (Object.keys(categories).some((c) => c.startsWith('self-harm') && categories[c] === true)) return true;
    return false;
  } catch (e) {
    console.error('Moderation 호출 실패(통과 처리):', e?.message || e);
    return false; // fail-open — 이미지 모델 자체 안전장치 존재
  } finally {
    clearTimeout(timer);
  }
}

// events에서 최근 60초의 generate_ok/generate_error 건수를 조회해 호출 한도를 판정한다.
// events 테이블이 없으면(42P01, T1 SQL 미적용) 한도 검사를 생략한다(api/stats.js의
// isMissingTable과 동일한 우아한 폴백 패턴). 조회 자체가 실패해도(네트워크 오류 등) 생성 흐름을
// 막지 않는다 — 가용성 우선(moderationBlocked와 동일 철학의 fail-open).
async function isGenerateRateLimited(session_id) {
  const now = Date.now();
  const sinceISO = new Date(now - GENERATE_WINDOW_MS).toISOString();
  try {
    const { data, error } = await supabase
      .from('events')
      .select('session_id, created_at')
      .in('type', ['generate_ok', 'generate_error'])
      .gte('created_at', sinceISO);
    if (error) throw error;
    return evaluateGenerateRateLimit({ events: data || [], sessionId: session_id, now }).blocked;
  } catch (e) {
    if (isMissingTableError(e)) return false;
    console.error('호출 한도 검사 실패(통과 처리):', e?.message || e);
    return false;
  }
}

async function logGeneration(mode) {
  const m = (mode === 'blocks' || mode === 'chat') ? mode : null;
  try { await supabase.from('generations').insert({ mode: m }); } catch (e) {}
}

// 이벤트 로깅(개인정보 없음 — 프롬프트 원문 절대 저장 안 함). 실패해도 생성 흐름을 막지 않는다.
async function logEvt(type, { mode, lang, session_id, detail } = {}) {
  try {
    await supabase.from('events').insert({
      type,
      mode: mode ?? null,
      lang: lang ?? null,
      session_id: session_id ?? null,
      detail: detail ?? null,
    });
  } catch (e) { /* 로깅 실패가 생성 흐름을 막으면 안 됨 */ }
}