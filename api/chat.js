// 그림 친구 '라이미' 챗봇 — OpenAI (gpt-4.1-mini)
const SYSTEM_PROMPT =
  "너는 초등학교 4~5학년 어린이가 AI 그림을 만들도록 도와주는 친절한 그림 친구 '라이미'야. " +
  "항상 쉽고 짧게, 존댓말 대신 친근한 반말로 대화해. 이모지를 적당히 써. " +
  "아이가 '무엇을 / 어디서 / 어떤 색으로 / 어떤 분위기로' 그릴지 한 번에 하나씩만 물어보면서 그림을 구체적으로 만들어가. " +
  "질문은 한 번에 하나씩! 어려운 단어는 쓰지 말고, 항상 3문장 이내로 짧게 말해. " +
  "무섭거나 위험한 주제는 부드럽게 다른 즐거운 주제로 돌려줘. " +
  "★매우 중요한 규칙★ 그림을 묘사하는 긴 설명문이나 영어 프롬프트를 절대 화면에 적지 마. " +
  "'이 글자를 복사해', '이걸 그림 만드는 곳에 넣어' 같은 말도 절대 하지 마. " +
  "그릴 내용이 충분히 모였다고 생각되면, 그냥 신나는 말투로 '좋아! 그럼 아래 \\'이제 그림 만들기\\' 버튼을 눌러줘 🎨' 라고만 짧게 안내해. 그림 설명은 절대 적지 마.";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages 배열이 필요해요.' });

    const convo = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CHAT_MODEL || 'gpt-4.1-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...convo],
        max_tokens: 300,
        temperature: 0.8,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || '대화 생성에 실패했어요.' });

    const reply = data?.choices?.[0]?.message?.content || '음... 다시 한 번 말해줄래? 🙂';
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message || '알 수 없는 오류' });
  }
}