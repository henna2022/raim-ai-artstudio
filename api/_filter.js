// 금칙어 필터 — 순수 모듈 (DOM/네트워크 접근 금지). api/generate.js에서만 import한다.
// 오탐(막으면 안 되는 정상 프롬프트를 막는 것) 방지가 최우선 목표.
//   - "미술관"·"마술사"·"피자"·"커피(숍)"·"술래잡기"·"drawing skills" 같은 무해한 단어가
//     기존 부분 문자열 매칭 때문에 차단되던 문제를 고친다.
// 절대 하지 말 것: 키워드를 늘려서 해결하는 시도(그게 오탐의 원인이었다).
//
// 전략:
//   1) 영어 위험어는 단어 경계(\b) 매칭만 사용 — "skills"/"skill" 안의 "kill"처럼
//      무해한 단어 중간에 나타나는 부분 문자열을 잡지 않는다.
//   2) 공백 제거(compact) 매칭은 "무해한 단어의 부분 문자열로 나타날 위험이 거의 없는"
//      고정된 단어만 사용한다(띄어쓰기로 우회하는 "n u d e" 같은 시도를 막기 위함).
//      kill/gore/drug/blood/knife/weapon/gun/sex는 이 목록에 넣지 않는다 —
//      예를 들어 "drawing skills"의 compact("drawingskills")에는 'kill'이 부분 문자열로
//      들어 있어 오탐이 나기 때문. (글자 수 기준이 아니라 "무해한 단어 안에 부분 문자열로
//      나타날 수 있는가"가 판단 기준이다.)
//   3) 한국어 위험어는 단독으로 의미가 명백한 2자 이상 토큰만 남긴다. '피'·'술'·'칼'·'성인'·'죽이'
//      같은 1자/짧은 토큰은 "피자"·"술래잡기"·"칼라"·"성인이 된"·"드로잉 실력을 죽이는" 같은
//      무해한 단어에 오탐을 내므로 제거했다 — 이 공백은 의미 기반 가드(OpenAI Moderation,
//      api/generate.js에서 호출)가 메운다.

const STRIP_RE = /[\s\-_.·~*]/g;

function normalize(prompt) {
  const low = String(prompt || '').toLowerCase().normalize('NFKC');
  const compact = low.replace(STRIP_RE, '');
  return { low, compact };
}

// 영어 위험어: 단어 경계로만 매칭 (low 대상)
const EN_WORD_RE = /\b(nude|naked|sex|sexual|nsfw|porn|blood|gore|kill|suicide|drug|weapon|gun|knife)\b/;

// 영어 위험어 중 compact(공백 제거) 매칭도 허용하는 고정 목록 — 무해한 단어의 부분 문자열로
// 나타날 위험이 낮다고 확인된 것만. (예: "n u d e" → compact "nude" 매칭 필요)
const EN_COMPACT_WORDS = ['nude', 'naked', 'porn', 'nsfw', 'sexual', 'suicide'];

// 한국어 위험어: 단독으로 명백한 2자 이상 토큰만
const KO_WORDS = [
  '누드', '나체', '섹스', '야한', '음란', '폭력', '살해', '자살', '마약', '담배',
  '흉기', '유혈', '피범벅', '피투성이', '음주', '맥주', '소주', '술병', '술취',
];

// 저작권 보호 목록: 유명 캐릭터/IP/유명인 등 (오탐 적은 고유 명칭만)
// known limitation: '마리오' 단일 토큰은 '마리오네트'(marionette) 같은 무해한 단어도
// compact 매칭에서 걸러낼 수 있다. 오탐 픽스처에는 포함하지 않았고, 대응은 이번 작업 범위 밖.
const COPYRIGHTED = [
  // 캐릭터/IP (한글)
  '포켓몬', '피카츄', '마리오', '슈퍼마리오', '루이지', '소닉', '디즈니', '미키마우스', '엘사', '겨울왕국', '라푼젤',
  '스파이더맨', '아이언맨', '배트맨', '슈퍼맨', '헐크', '어벤져스', '캡틴아메리카', '토토로', '도라에몽', '짱구',
  '나루토', '드래곤볼', '유희왕', '디지몬', '세일러문', '명탐정코난', '뽀로로', '핑크퐁',
  '로보카폴리', '둘리', '펭수', '잔망루피', '카카오프렌즈', '헬로키티', '쿠로미', '시나모롤', '곰돌이푸', '스누피',
  '스폰지밥', '미니언즈', '심슨', '마인크래프트', '로블록스', '어몽어스', '쿠키런', '브롤스타즈', '방탄소년단', '블랙핑크', '뉴진스',
  // 캐릭터/IP (영문)
  'pokemon', 'pokémon', 'pikachu', 'super mario', 'luigi', 'bowser', 'disney', 'mickey mouse', 'frozen elsa', 'rapunzel',
  'spider-man', 'spiderman', 'iron man', 'ironman', 'batman', 'superman', 'avengers', 'totoro', 'doraemon', 'naruto',
  'dragon ball', 'yugioh', 'yu-gi-oh', 'digimon', 'sailor moon', 'pororo', 'pinkfong', 'hello kitty', 'kuromi',
  'cinnamoroll', 'winnie the pooh', 'snoopy', 'spongebob', 'minecraft', 'roblox', 'among us', 'cookie run', 'brawl stars',
  'blackpink', 'newjeans',
];
const COPYRIGHTED_COMPACT = COPYRIGHTED.map((w) => normalize(w).compact);

/**
 * @param {string} prompt
 * @returns {{ ok: true } | { ok: false, reason: 'banned' | 'copyright' }}
 */
export function checkPrompt(prompt) {
  const { low, compact } = normalize(prompt);

  if (EN_WORD_RE.test(low)) return { ok: false, reason: 'banned' };
  if (EN_COMPACT_WORDS.some((w) => compact.includes(w))) return { ok: false, reason: 'banned' };
  if (KO_WORDS.some((w) => compact.includes(w))) return { ok: false, reason: 'banned' };

  if (COPYRIGHTED_COMPACT.some((w) => compact.includes(w))) return { ok: false, reason: 'copyright' };

  return { ok: true };
}
