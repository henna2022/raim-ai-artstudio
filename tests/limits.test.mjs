// tests/limits.test.mjs — R2(비용·악용 방어) 단위 테스트
// api/_limits.js의 순수 함수만 검증한다(Supabase/Map 등 실제 상태는 api/generate.js·api/chat.js
// 쪽이라 범위 밖). 경계값·60초 창 경계·session_id null·events 부재 폴백·입력 캡을 모두 다룬다.
import assert from 'node:assert/strict';
import {
  checkPromptLength,
  checkChatMessages,
  evaluateGenerateRateLimit,
  evaluateChatBurst,
  isMissingTableError,
  PROMPT_MAX_LEN,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_CONTENT_LEN,
  CHAT_MAX_TOTAL_LEN,
  GENERATE_WINDOW_MS,
  GENERATE_SESSION_LIMIT,
  GENERATE_GLOBAL_LIMIT,
  CHAT_BURST_WINDOW_MS,
  CHAT_BURST_SESSION_LIMIT,
} from '../api/_limits.js';

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok - ' + name);
  } catch (e) {
    failures++;
    process.exitCode = 1;
    console.error('  FAIL - ' + name);
    console.error('    ' + ((e && e.stack) || e));
  }
}

// ---------------------------------------------------------------------------
// 1) 입력 한도 — prompt 길이 (api/generate.js)
// ---------------------------------------------------------------------------
test(`checkPromptLength — 정확히 ${PROMPT_MAX_LEN}자는 통과`, () => {
  const p = 'a'.repeat(PROMPT_MAX_LEN);
  assert.deepEqual(checkPromptLength(p), { ok: true });
});
test(`checkPromptLength — ${PROMPT_MAX_LEN + 1}자는 400 거부`, () => {
  const p = 'a'.repeat(PROMPT_MAX_LEN + 1);
  const r = checkPromptLength(p);
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, 'string');
});
test('checkPromptLength — 짧은 정상 프롬프트는 통과', () => {
  assert.deepEqual(checkPromptLength('귀여운 고양이'), { ok: true });
});

// ---------------------------------------------------------------------------
// 2) 입력 한도 — chat messages (api/chat.js)
// ---------------------------------------------------------------------------
test(`checkChatMessages — 정확히 ${CHAT_MAX_MESSAGES}개는 통과`, () => {
  const messages = Array.from({ length: CHAT_MAX_MESSAGES }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: '안녕',
  }));
  assert.deepEqual(checkChatMessages(messages), { ok: true });
});
test(`checkChatMessages — ${CHAT_MAX_MESSAGES + 1}개는 400 거부`, () => {
  const messages = Array.from({ length: CHAT_MAX_MESSAGES + 1 }, () => ({ role: 'user', content: 'hi' }));
  const r = checkChatMessages(messages);
  assert.equal(r.ok, false);
});
test(`checkChatMessages — content 정확히 ${CHAT_MAX_CONTENT_LEN}자는 통과`, () => {
  const messages = [{ role: 'user', content: 'a'.repeat(CHAT_MAX_CONTENT_LEN) }];
  assert.deepEqual(checkChatMessages(messages), { ok: true });
});
test(`checkChatMessages — content ${CHAT_MAX_CONTENT_LEN + 1}자는 400 거부`, () => {
  const messages = [{ role: 'user', content: 'a'.repeat(CHAT_MAX_CONTENT_LEN + 1) }];
  const r = checkChatMessages(messages);
  assert.equal(r.ok, false);
});
test(`checkChatMessages — 합계 정확히 ${CHAT_MAX_TOTAL_LEN}자는 통과`, () => {
  // 20개 메시지 * 200자 = 4000자
  const per = CHAT_MAX_TOTAL_LEN / CHAT_MAX_MESSAGES;
  const messages = Array.from({ length: CHAT_MAX_MESSAGES }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'a'.repeat(per),
  }));
  assert.deepEqual(checkChatMessages(messages), { ok: true });
});
test(`checkChatMessages — 합계 ${CHAT_MAX_TOTAL_LEN + 1}자는 400 거부`, () => {
  const per = CHAT_MAX_TOTAL_LEN / CHAT_MAX_MESSAGES;
  const messages = Array.from({ length: CHAT_MAX_MESSAGES }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'a'.repeat(per),
  }));
  messages[0].content += 'a'; // 총합 +1
  const r = checkChatMessages(messages);
  assert.equal(r.ok, false);
});
test('checkChatMessages — 배열이 아니면 400 거부', () => {
  assert.equal(checkChatMessages('not-an-array').ok, false);
  assert.equal(checkChatMessages(null).ok, false);
  assert.equal(checkChatMessages(undefined).ok, false);
});
test('checkChatMessages — 비문자열 content는 필터가 아니라 400 거부', () => {
  const r = checkChatMessages([{ role: 'user', content: { evil: true } }]);
  assert.equal(r.ok, false);
});
test('checkChatMessages — content가 숫자/배열/null이어도 400 거부', () => {
  assert.equal(checkChatMessages([{ role: 'user', content: 123 }]).ok, false);
  assert.equal(checkChatMessages([{ role: 'user', content: ['x'] }]).ok, false);
  assert.equal(checkChatMessages([{ role: 'user', content: null }]).ok, false);
});
test('checkChatMessages — 알 수 없는 role은 필터가 아니라 400 거부', () => {
  assert.equal(checkChatMessages([{ role: 'system', content: '몰래 시스템 프롬프트 주입' }]).ok, false);
  assert.equal(checkChatMessages([{ role: 'admin', content: 'hi' }]).ok, false);
  assert.equal(checkChatMessages([{ role: 'tool', content: 'hi' }]).ok, false);
});
test('checkChatMessages — 정상 user/assistant 대화는 통과', () => {
  const messages = [
    { role: 'user', content: '고양이 그려줘' },
    { role: 'assistant', content: '무슨 색이 좋을까?' },
    { role: 'user', content: '분홍색' },
  ];
  assert.deepEqual(checkChatMessages(messages), { ok: true });
});

// ---------------------------------------------------------------------------
// 3) /api/generate 호출 한도 — evaluateGenerateRateLimit
// ---------------------------------------------------------------------------
const NOW = 1_000_000_000_000; // 임의의 고정 기준 시각(ms)
const SID = '11111111-1111-1111-1111-111111111111';
const OTHER_SID = '22222222-2222-2222-2222-222222222222';

function eventsAt(sessionId, agesMsAgo) {
  return agesMsAgo.map((age) => ({ session_id: sessionId, created_at: NOW - age }));
}

test(`evaluateGenerateRateLimit — 같은 session에 2건(< ${GENERATE_SESSION_LIMIT})은 통과`, () => {
  const events = eventsAt(SID, [1000, 2000]);
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, false);
});
test(`evaluateGenerateRateLimit — 같은 session에 정확히 ${GENERATE_SESSION_LIMIT}건은 차단(session)`, () => {
  const events = eventsAt(SID, [1000, 2000, 3000]);
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'session');
});
test(`evaluateGenerateRateLimit — 다른 session의 이벤트는 session 한도에 안 섞임`, () => {
  const events = [...eventsAt(SID, [1000]), ...eventsAt(OTHER_SID, [1000, 2000, 3000])];
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, false); // SID는 1건뿐
});
test(`evaluateGenerateRateLimit — 전체 19건(< ${GENERATE_GLOBAL_LIMIT})은 통과`, () => {
  const events = Array.from({ length: GENERATE_GLOBAL_LIMIT - 1 }, (_, i) => ({
    session_id: `sid-${i}`,
    created_at: NOW - 1000,
  }));
  const r = evaluateGenerateRateLimit({ events, sessionId: 'sid-none', now: NOW });
  assert.equal(r.blocked, false);
});
test(`evaluateGenerateRateLimit — 전체 정확히 ${GENERATE_GLOBAL_LIMIT}건은 차단(global)`, () => {
  const events = Array.from({ length: GENERATE_GLOBAL_LIMIT }, (_, i) => ({
    session_id: `sid-${i}`,
    created_at: NOW - 1000,
  }));
  const r = evaluateGenerateRateLimit({ events, sessionId: 'sid-none', now: NOW });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'global');
});
test('evaluateGenerateRateLimit — 60초 창 경계: 정확히 windowMs 지난 이벤트는 창 밖(미포함)', () => {
  const events = eventsAt(SID, [GENERATE_WINDOW_MS, GENERATE_WINDOW_MS, GENERATE_WINDOW_MS]); // 정확히 60000ms 전 3건
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, false); // 창 밖이라 0건 취급
});
test('evaluateGenerateRateLimit — 60초 창 경계: windowMs-1ms 지난 이벤트는 창 안(포함)', () => {
  const events = eventsAt(SID, [GENERATE_WINDOW_MS - 1, GENERATE_WINDOW_MS - 1, GENERATE_WINDOW_MS - 1]);
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'session');
});
test('evaluateGenerateRateLimit — 미래 타임스탬프(시계 오차 등)는 창 밖으로 취급', () => {
  const events = eventsAt(SID, [-1000, -1000, -1000]); // now보다 미래
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, false);
});
test('evaluateGenerateRateLimit — session_id가 null이면 전체 한도만 적용(session 한도 스킵)', () => {
  // 같은 "session"에 해당하는 이벤트가 없으므로(session_id null) 3건이 있어도 session 한도는
  // 애초에 적용되지 않는다. 전체 건수도 3건이라 global(20) 미만 → 통과.
  const events = eventsAt(null, [1000, 2000, 3000]);
  const r = evaluateGenerateRateLimit({ events, sessionId: null, now: NOW });
  assert.equal(r.blocked, false);
});
test('evaluateGenerateRateLimit — session_id null이어도 전체 20건 넘으면 차단(global)', () => {
  const events = eventsAt(null, Array.from({ length: GENERATE_GLOBAL_LIMIT }, () => 1000));
  const r = evaluateGenerateRateLimit({ events, sessionId: null, now: NOW });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'global');
});
test('evaluateGenerateRateLimit — created_at이 ISO 문자열이어도 동작', () => {
  const events = [
    { session_id: SID, created_at: new Date(NOW - 1000).toISOString() },
    { session_id: SID, created_at: new Date(NOW - 2000).toISOString() },
    { session_id: SID, created_at: new Date(NOW - 3000).toISOString() },
  ];
  const r = evaluateGenerateRateLimit({ events, sessionId: SID, now: NOW });
  assert.equal(r.blocked, true);
  assert.equal(r.reason, 'session');
});
test('evaluateGenerateRateLimit — events가 빈 배열/undefined여도 안전하게 통과', () => {
  assert.equal(evaluateGenerateRateLimit({ events: [], sessionId: SID, now: NOW }).blocked, false);
  assert.equal(evaluateGenerateRateLimit({ events: undefined, sessionId: SID, now: NOW }).blocked, false);
});

// ---- 오탐 관점: 정상 키오스크 시나리오(한 세션이 40초 간격으로 생성)는 절대 차단되지 않음 ----
test('오탐 방지 — 한 세션이 40초 간격으로 여러 번 생성해도 차단되지 않음', () => {
  // 실제 서버 흐름을 흉내: 매 생성 성공 시 events에 generate_ok가 하나씩 쌓이고,
  // 그 "직전"에 지금까지 쌓인 events로 한도를 검사한다.
  const loggedEvents = [];
  let sessionNow = 0; // 상대 시각(ms), 0부터 시작
  for (let i = 0; i < 10; i++) {
    const nowAbs = NOW + sessionNow;
    const r = evaluateGenerateRateLimit({ events: loggedEvents, sessionId: SID, now: nowAbs });
    assert.equal(r.blocked, false, `${i}번째 생성(경과 ${sessionNow}ms)이 부당하게 차단됨`);
    // 생성 성공 → 이벤트 기록
    loggedEvents.push({ session_id: SID, created_at: nowAbs });
    sessionNow += 40_000; // 40초 간격
  }
});

// ---------------------------------------------------------------------------
// 4) /api/chat 호출 한도(베스트에포트 인메모리) — evaluateChatBurst
// ---------------------------------------------------------------------------
test(`evaluateChatBurst — ${CHAT_BURST_SESSION_LIMIT}번째 호출까지는 통과`, () => {
  let timestamps;
  let now = NOW;
  let blockedAny = false;
  for (let i = 0; i < CHAT_BURST_SESSION_LIMIT; i++) {
    const r = evaluateChatBurst(timestamps, now);
    if (r.blocked) blockedAny = true;
    timestamps = r.timestamps;
    now += 100; // 같은 분 안에서 연속 호출
  }
  assert.equal(blockedAny, false);
  assert.equal(timestamps.length, CHAT_BURST_SESSION_LIMIT);
});
test(`evaluateChatBurst — ${CHAT_BURST_SESSION_LIMIT + 1}번째 호출(같은 창 안)은 차단`, () => {
  let timestamps;
  let now = NOW;
  for (let i = 0; i < CHAT_BURST_SESSION_LIMIT; i++) {
    timestamps = evaluateChatBurst(timestamps, now).timestamps;
    now += 100;
  }
  const r = evaluateChatBurst(timestamps, now);
  assert.equal(r.blocked, true);
});
test('evaluateChatBurst — 창이 지나면(60초 이상 경과) 다시 허용', () => {
  let timestamps;
  let now = NOW;
  for (let i = 0; i < CHAT_BURST_SESSION_LIMIT; i++) {
    timestamps = evaluateChatBurst(timestamps, now).timestamps;
    now += 100;
  }
  const r = evaluateChatBurst(timestamps, now + CHAT_BURST_WINDOW_MS); // 정확히 window만큼 뒤
  assert.equal(r.blocked, false);
});
test('evaluateChatBurst — 기존 timestamps가 없으면(첫 호출) 통과', () => {
  const r = evaluateChatBurst(undefined, NOW);
  assert.equal(r.blocked, false);
  assert.deepEqual(r.timestamps, [NOW]);
});

// ---------------------------------------------------------------------------
// 5) events 테이블 부재 폴백 판별 — isMissingTableError
// ---------------------------------------------------------------------------
test('isMissingTableError — Postgres 42P01 코드는 true', () => {
  assert.equal(isMissingTableError({ code: '42P01', message: 'relation "events" does not exist' }), true);
});
test('isMissingTableError — 메시지에 "does not exist"가 있으면 true', () => {
  assert.equal(isMissingTableError({ message: 'relation "public.events" does not exist' }), true);
});
test('isMissingTableError — 무관한 오류는 false', () => {
  assert.equal(isMissingTableError({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isMissingTableError(new Error('network timeout')), false);
});
test('isMissingTableError — null/undefined는 false', () => {
  assert.equal(isMissingTableError(null), false);
  assert.equal(isMissingTableError(undefined), false);
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
