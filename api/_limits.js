// 서버측 한도 판정 — 순수 함수 모음 (DOM/네트워크/Supabase 접근 금지).
// api/generate.js, api/chat.js, tests/limits.test.mjs 가 공유한다.
//
// 목적(R2 — 비용·악용 방어): /api/generate·/api/chat는 무인증 공개 상태라 스크립트 호출로
// OpenAI 비용이 새어 나갈 수 있다. 여기서는 판정 로직만 다루고, 실제 DB 조회·Map 상태 관리는
// 호출부(api/generate.js, api/chat.js)에 둔다 — 이 파일은 입출력이 순수해야 단위 테스트가 쉽다.

// ---- 입력 한도(하드 캡) ----
export const PROMPT_MAX_LEN = 1200;

export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_CONTENT_LEN = 400;
export const CHAT_MAX_TOTAL_LEN = 4000;
// messages 배열에 허용하는 role. 시스템 프롬프트는 서버가 내부적으로 붙이므로 클라가 보낼 수
// 있는 role은 user/assistant뿐 — 그 외(system 포함)는 "알 수 없는 role"로 400 거부한다.
export const CHAT_ALLOWED_ROLES = ['user', 'assistant'];

// ---- /api/generate 호출 한도(Supabase 기반) ----
export const GENERATE_WINDOW_MS = 60 * 1000;
export const GENERATE_SESSION_LIMIT = 3; // 같은 session_id 기준, 최근 60초 내 generate_ok/error
export const GENERATE_GLOBAL_LIMIT = 20; // 전체 기준(다중 키오스크 여유 포함), 최근 60초 내

// ---- /api/chat 호출 한도(모듈 전역 인메모리, 베스트에포트) ----
export const CHAT_BURST_WINDOW_MS = 60 * 1000;
export const CHAT_BURST_SESSION_LIMIT = 12; // 세션당(또는 session_id 미전달 시 전체) 분당 12회

/**
 * prompt 길이 하드 캡. api/generate.js 전용.
 * @param {string} prompt
 * @returns {{ok:true}|{ok:false,error:string}}
 */
export function checkPromptLength(prompt) {
  if (typeof prompt === 'string' && prompt.length > PROMPT_MAX_LEN) {
    return { ok: false, error: '그림 설명이 너무 길어요. 조금 더 짧게 적어줄래요?' };
  }
  return { ok: true };
}

/**
 * chat messages 배열 입력 캡. 비문자열 content나 알 수 없는 role은 필터링하지 않고
 * 그대로 400 거부 대상으로 판정한다(스크립트가 형식을 우회해 비용을 태우는 것을 막기 위함).
 * @param {any} messages
 * @returns {{ok:true}|{ok:false,error:string}}
 */
export function checkChatMessages(messages) {
  if (!Array.isArray(messages)) {
    return { ok: false, error: 'messages 배열이 필요해요.' };
  }
  if (messages.length > CHAT_MAX_MESSAGES) {
    return { ok: false, error: '대화가 너무 길어졌어요. 새로 시작해볼까요?' };
  }
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return { ok: false, error: '메시지 형식이 올바르지 않아요.' };
    }
    if (!CHAT_ALLOWED_ROLES.includes(m.role)) {
      return { ok: false, error: '메시지 형식이 올바르지 않아요.' };
    }
    if (typeof m.content !== 'string') {
      return { ok: false, error: '메시지 형식이 올바르지 않아요.' };
    }
    if (m.content.length > CHAT_MAX_CONTENT_LEN) {
      return { ok: false, error: '메시지가 너무 길어요. 조금 더 짧게 적어줄래요?' };
    }
    total += m.content.length;
  }
  if (total > CHAT_MAX_TOTAL_LEN) {
    return { ok: false, error: '대화가 너무 길어졌어요. 새로 시작해볼까요?' };
  }
  return { ok: true };
}

/**
 * /api/generate 호출 한도 판정 — 최근 windowMs(기본 60초) 내 generate_ok/generate_error
 * 이벤트 수를 기준으로 session_id 한도(GENERATE_SESSION_LIMIT)와 전체 한도
 * (GENERATE_GLOBAL_LIMIT)를 각각 판정한다. sessionId가 없으면(구버전 클라) 전체 한도만 적용한다.
 *
 * 알려진 한계: generate_ok/generate_error는 생성이 *끝난 뒤*에만 기록되므로, 첫 windowMs 안에
 * 동시다발로 쏘는 버스트는 이 검사를 통과할 수 있다. events.type CHECK 제약(새 type 추가 금지)
 * 아래에서는 "시도 시점 기록"이 구조적으로 불가능하다 — 이 한도는 지속 남용을 막는
 * 베스트에포트이며 완전한 방어를 의미하지 않는다.
 *
 * @param {object} params
 * @param {{session_id?: string|null, created_at: string|number}[]} params.events - 후보 이벤트(윈도보다 넓게 가져와도 됨, 여기서 다시 필터링함)
 * @param {string|null} params.sessionId
 * @param {number} params.now - epoch ms
 * @param {number} [params.windowMs]
 * @param {number} [params.sessionLimit]
 * @param {number} [params.globalLimit]
 * @returns {{blocked:boolean, reason:'session'|'global'|null}}
 */
export function evaluateGenerateRateLimit({
  events,
  sessionId,
  now,
  windowMs = GENERATE_WINDOW_MS,
  sessionLimit = GENERATE_SESSION_LIMIT,
  globalLimit = GENERATE_GLOBAL_LIMIT,
}) {
  const recent = (events || []).filter((e) => {
    const t = typeof e.created_at === 'number' ? e.created_at : Date.parse(e.created_at);
    if (!Number.isFinite(t)) return false;
    const age = now - t;
    // "최근 windowMs" = age가 0 이상 windowMs 미만인 이벤트만 (정확히 windowMs 지난 건 창 밖)
    return age >= 0 && age < windowMs;
  });

  if (sessionId) {
    const sessionCount = recent.filter((e) => e.session_id === sessionId).length;
    if (sessionCount >= sessionLimit) return { blocked: true, reason: 'session' };
  }

  if (recent.length >= globalLimit) return { blocked: true, reason: 'global' };

  return { blocked: false, reason: null };
}

/**
 * /api/chat 호출 한도(베스트에포트, 모듈 전역 Map 기반) 판정. 순수 함수로 분리해 두었으나
 * 실제 상태(Map)는 api/chat.js가 들고 있다 — 이 함수는 "기존 타임스탬프 목록 + 지금"을 받아
 * 차단 여부와 갱신된 타임스탬프 목록을 돌려줄 뿐이다.
 * @param {number[]|undefined} timestamps - 해당 키(session_id 또는 'global')의 기존 호출 시각들
 * @param {number} now
 * @param {number} [windowMs]
 * @param {number} [limit]
 * @returns {{blocked:boolean, timestamps:number[]}}
 */
export function evaluateChatBurst(timestamps, now, windowMs = CHAT_BURST_WINDOW_MS, limit = CHAT_BURST_SESSION_LIMIT) {
  const recent = (timestamps || []).filter((t) => {
    const age = now - t;
    return age >= 0 && age < windowMs;
  });
  const blocked = recent.length >= limit;
  if (!blocked) recent.push(now);
  return { blocked, timestamps: recent };
}

/**
 * Supabase "테이블 없음"(42P01) 오류 판별 — api/stats.js의 isMissingTable과 동일 패턴.
 * events 테이블이 아직 없는 배포(T1 SQL 미적용)에서 한도 검사를 우아하게 생략하기 위함.
 * @param {any} e
 */
export function isMissingTableError(e) {
  const code = e && e.code;
  const msg = (e && (e.message || e.details)) || '';
  return code === '42P01' || /does not exist|relation .* does not/i.test(msg);
}
