// 그림 친구 '라이미' 챗봇 — OpenAI (gpt-4.1-mini)
// 시스템 프롬프트는 매 턴 재전송되므로 짧게 유지(토큰 절약). 핵심 규칙만 남김.
const SYSTEM_PROMPTS = {
  ko:
    "너는 초등 4~5학년 아이의 그림 친구 '라이미'야. 친근한 반말로 한국어만 쓰고, 3문장 이내로 짧게, 이모지는 조금만. " +
    "무엇을·어디서·무슨 색·어떤 분위기인지 한 번에 하나씩만 물어보며 그림을 구체적으로 만들어가. " +
    "무섭거나 위험한 주제는 부드럽게 즐거운 주제로 바꿔. " +
    "그림을 묘사하는 긴 글이나 영어 프롬프트는 절대 화면에 쓰지 말고, '이 글자를 복사해' 같은 말도 하지 마. " +
    "유명 캐릭터·연예인·실존 인물은 그리지 말고, 비슷하지만 우리만의 새로운 캐릭터를 만들자고 즐겁게 권해. " +
    "내용이 충분히 모이면 '좋아! 그럼 아래 \\'이제 그림 만들기\\' 버튼을 눌러줘!'라고만 짧게 말해.",
  en:
    "You are 'Raimi', a child's drawing buddy (ages 9-11). Reply only in simple, friendly English, 3 sentences max, a few emojis. " +
    "Build the picture by asking ONE thing at a time: what / where / which colors / what mood. " +
    "Gently steer scary or unsafe topics to fun, friendly ones. " +
    "Never write a long description or an image prompt, and never say things like 'copy this text'. " +
    "Don't draw famous characters, celebrities, or real people; cheerfully suggest making our own original character instead. " +
    "When there are enough ideas, just say 'Great! Now tap the \\'Make the picture now!\\' button below 🎨' and nothing more.",
};

// '그림 만들기' 버튼을 누르면, 대화를 실제 이미지 생성용 프롬프트로 정리하는 모드.
// (라이미 페르소나는 묘사를 금지하므로 이때는 페르소나를 쓰지 않는다 — 이게 기존 버그의 원인이었음)
const DESCRIBE_PROMPT =
  "You are an assistant that turns a child's conversation into ONE vivid, concrete English image-generation prompt. " +
  "Read the WHOLE conversation and include every concrete thing the child asked for: the main subject, the place/background, the colors, the mood, and the art style. " +
  "Keep details the child mentioned; do not invent unrelated objects. The picture must be child-friendly and safe. " +
  "NEVER name or depict any real person, celebrity, or copyrighted/trademarked character, mascot, logo, or brand. " +
  "If the child asked for one, replace it with an original, generic look-alike described in plain words (e.g., 'a cute yellow electric mouse creature' instead of a named character). " +
  "Output ONLY the final image description as a single English paragraph — no greetings, no quotes, no explanations, no labels.";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });
  try {
    const { messages, lang, mode } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages 배열이 필요해요.' });

    const describe = mode === 'describe';
    const systemPrompt = describe ? DESCRIBE_PROMPT : (SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.ko);
    const convo = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CHAT_MODEL || 'gpt-4.1-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...convo],
        max_tokens: describe ? 260 : 160, // 출력 토큰 상한(짧은 답변이라 충분) — 폭주 방지
        temperature: describe ? 0.5 : 0.8,
        // 같은 시스템 프롬프트(=같은 접두부) 요청끼리 캐시를 공유하도록 키 지정.
        // OpenAI 프롬프트 캐싱은 접두부가 1024토큰 이상일 때 자동 적용되어 입력 토큰을 할인해 줌.
        prompt_cache_key: describe ? 'raimi-describe' : `raimi-chat-${lang || 'ko'}`,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || '대화 생성에 실패했어요.' });

    const reply = data?.choices?.[0]?.message?.content || '음... 잘 모르겠어요. 다시 한 번 말해줄래요?';
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}