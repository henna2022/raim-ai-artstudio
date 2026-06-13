// ===================== 다국어(한국어 / English) =====================
// 화면에 보이는 모든 글자를 언어별로 모아둔 곳이에요.
// 새 글자를 추가하려면 ko / en 두 곳에 모두 넣어주세요.

export const LANGS = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];

export const I18N = {
  // ===================================================== 한국어
  ko: {
    appTitle: "AI 그림 연구소",
    appSub: "나만의 그림을 만들어봐요!",
    homeBtn: "🏠 처음으로",
    resetBtn: "🔄 초기화",

    // 인트로
    introHi: "안녕하세요! 저는 그림 친구 라이미예요",
    introTitle: "라이미와 함께 그림을 만들어봐요!",
    introBody:
      "AI는 <b>우리가 설명한 대로</b> 그림을 그려줘요.\n그래서 <b>'무엇을 · 어디서 · 어떤 색으로 · 어떤 기분으로'</b> 그릴지\n<b>자세히</b> 말해줄수록 더 멋진 그림이 나와요!\n\n이렇게 그림을 설명하는 말을 <b>'프롬프트'</b>라고 불러요.\n멋진 프롬프트가 멋진 그림을 만들어요.\n자, 저랑 같이 만들어볼까요? ✨",
    introStart: "시작해봅시다!",

    // 홈
    homeH1: "어떻게 그림을 만들까요?",
    homeP: "둘 중에 하나를 골라봐요!",
    cardBlocksTitle: "블록으로 만들기",
    cardBlocksDesc: "버튼을 톡톡 골라서<br>쉽고 빠르게 그림 완성!",
    cardBlocksTag: "쉬워요",
    cardChatTitle: "대화하며 만들기",
    cardChatDesc: "라이미와 이야기하며<br>내 맘대로 그림 만들기!",
    cardChatTag: "자유로워요",

    // 채팅
    chatHeader: "그림 친구 라이미와 대화하기",
    chatPlaceholder: "여기에 입력해봐요...",
    chatSend: "보내기",
    chatFinish: "그림 제작하기!",
    chatGreeting:
      "안녕하세요! 저는 그림 친구 라이미예요 \n오늘 어떤 그림을 만들고 싶어요? 동물, 로봇, 우주... 뭐든 좋아요! 떠오르는 걸 말해주세요",
    chatError: "앗, 잠깐 문제가 생겼어요. 다시 한 번 말해줄래요?",
    chatFinishMsg: "알겠어요! 이제 그림을 그려줄게요!",
    chatFailMsg: "앗, 그림 만들기에 실패했어요 ㅠㅠ 잠시 뒤에 버튼을 한 번 더 눌러줄래요?",

    // 생성중
    genText: "그림을 그리는 중이에요...",
    genSub: "라이미가 열심히 색칠하고 있어요!",

    // 리뷰
    reviewH2: "그림이 완성됐어요! 🎉",
    reviewErr: "앗, 그림 만들기에 실패했어요.<br>{err}<br>다시 해볼까요?",
    reviewP: "마음에 들어요? 아니면 조금 바꿔볼까요?",
    reviewFix: "이렇게 고치기 ({n})",
    reviewDone: "완성! 공유하기",
    reviewRetry: "다시 만들기",

    // 결과
    resultH2: "멋진 작품이 완성됐어요! 🎉",
    qrTitle: "📱 QR로 가져가기",
    qrDesc: "휴대폰 카메라로 QR을 찍으면<br>내 그림을 볼 수 있어요!",
    qrWarn: "⏰ 이 QR은 <b>5시간 후에 사라져요.</b><br>그 전에 꼭 휴대폰에 저장해 주세요!",
    againBtn: "새 그림 만들기",

    // 10개 다 고른 뒤 안내 화면
    moreTitle: "다 골랐어요!",
    moreDesc: "이대로 그릴까요? 더 자세히 정하면 그림이 더 멋져져요!",
    moreDrawNow: "이대로 그리기",
    moreMore: "더 자세히 정하기 (+5)",

    // 블록 단계
    STEPS: [
      { key: "subject", title: "무엇을 그릴까?", emoji: "🎨", options: [
        ["귀여운 동물", "귀엽고 사랑스러운 동물"], ["멋진 로봇", "반짝이는 멋진 로봇"],
        ["우주 행성", "신비로운 우주의 행성"], ["마법의 성", "동화 속 마법의 성"],
        ["바다 생물", "바닷속 신기한 생물"], ["공룡", "씩씩한 공룡"]] },
      { key: "place", title: "어디에 있을까?", emoji: "🌍", options: [
        ["숲속", "푸른 숲속"], ["우주", "별이 가득한 우주"], ["바닷가", "햇살 비치는 바닷가"],
        ["미래 도시", "반짝이는 미래 도시"], ["하늘 위", "구름 위 하늘"], ["동굴 속", "보석이 빛나는 동굴 속"]] },
      { key: "color", title: "어떤 색이 좋아?", emoji: "🌈", options: [
        ["무지개색", "알록달록 무지개색"], ["파란색", "시원한 파란색 위주"], ["분홍색", "사랑스러운 분홍색 위주"],
        ["초록색", "싱그러운 초록색 위주"], ["노란색", "밝고 따뜻한 노란색 위주"], ["보라색", "신비로운 보라색 위주"]] },
      { key: "mood", title: "기분은 어때?", emoji: "✨", options: [
        ["신나는", "신나고 활기찬 분위기"], ["평화로운", "평화롭고 잔잔한 분위기"], ["신비로운", "신비롭고 마법같은 분위기"],
        ["씩씩한", "씩씩하고 용감한 분위기"], ["포근한", "포근하고 따뜻한 분위기"]] },
      { key: "style", title: "그림 스타일은?", emoji: "🖌️", options: [
        ["동화 그림", "부드러운 동화책 일러스트 스타일"], ["만화", "귀여운 만화 스타일"], ["수채화", "맑은 수채화 스타일"],
        ["픽셀아트", "도트가 보이는 픽셀아트 스타일"], ["사실적", "실제 사진처럼 사실적인 스타일"]] },
      { key: "time", title: "언제일까?", emoji: "🕐", options: [
        ["한낮", "밝은 한낮"], ["노을", "주황빛 노을 질 때"], ["밤", "별빛 가득한 밤"], ["새벽", "안개 낀 새벽"]] },
      { key: "size", title: "크기는 어때?", emoji: "🔍", options: [
        ["작고 귀엽게", "작고 귀여운 크기로"], ["보통 크기", "적당한 보통 크기로"],
        ["크고 멋지게", "크고 웅장한 크기로"], ["화면 가득", "화면을 가득 채울 만큼 크게"]] },
      { key: "weather", title: "날씨는 어때?", emoji: "☁️", options: [
        ["맑은 날", "화창하게 맑은 날씨"], ["비 오는 날", "촉촉하게 비 오는 날씨"],
        ["눈 오는 날", "하얗게 눈 오는 날씨"], ["무지개", "비 갠 뒤 무지개가 뜬 날씨"]] },
      { key: "companion", title: "누구와 함께?", emoji: "👫", options: [
        ["혼자서", "혼자 있는 모습"], ["친구랑 둘이", "친구와 둘이 함께 있는 모습"],
        ["여럿이", "여러 친구들과 다 같이 있는 모습"], ["동물이랑", "귀여운 동물 친구와 함께 있는 모습"]] },
      { key: "special", title: "뭘 더 추가할까?", emoji: "🎀", options: [
        ["반짝이", "반짝이는 별가루 장식"], ["날개", "등에 달린 예쁜 날개"], ["왕관", "머리에 쓴 반짝이는 왕관"],
        ["풍선", "둥둥 떠다니는 풍선들"], ["없음", "특별한 장식 없이 깔끔하게"]] },
    ],
    // 더 자세히 정하기(+5) 추가 질문
    STEPS_EXTRA: [
      { key: "view", title: "어떻게 보일까?", emoji: "📷", options: [
        ["가까이 크게", "주인공을 가까이 클로즈업해서"], ["전체가 보이게", "장면 전체가 한눈에 보이게"],
        ["위에서 보기", "위에서 내려다보는 구도로"], ["아래에서 보기", "아래에서 올려다보는 구도로"]] },
      { key: "light", title: "빛은 어떤 느낌?", emoji: "💡", options: [
        ["따뜻한 햇살", "따뜻한 햇살이 비치는 빛"], ["반짝이는 빛", "사방이 반짝이는 빛"],
        ["은은한 달빛", "은은하게 비치는 달빛"], ["알록달록 네온", "알록달록한 네온 불빛"]] },
      { key: "detail", title: "얼마나 자세히?", emoji: "🔬", options: [
        ["아주 단순하게", "아주 단순하고 깔끔하게"], ["보통", "적당한 디테일로"],
        ["아주 자세하게", "아주 정교하고 자세하게"]] },
      { key: "deco", title: "배경 장식은?", emoji: "🌟", options: [
        ["별", "배경에 작은 별들이 가득"], ["꽃", "배경에 예쁜 꽃들이 가득"], ["하트", "배경에 귀여운 하트가 가득"],
        ["거품", "배경에 동글동글 거품이 가득"], ["없음", "배경 장식 없이 깔끔하게"]] },
      { key: "action", title: "무얼 하고 있을까?", emoji: "🏃", options: [
        ["가만히", "가만히 멈춰 있는 모습"], ["달리는", "힘차게 달리는 모습"],
        ["점프하는", "높이 점프하는 모습"], ["춤추는", "즐겁게 춤추는 모습"]] },
    ],
    TWEAKS: [
      ["더 밝게", "전체적으로 더 밝고 화사하게"], ["더 크게", "주인공을 더 크고 가깝게"],
      ["친구 추가", "옆에 귀여운 친구를 한 명 더 추가"], ["반짝이 추가", "반짝이는 빛 효과를 잔뜩 추가"],
      ["더 단순하게", "배경을 단순하게 정리"], ["더 화려하게", "더 화려하고 디테일을 풍부하게"]],

    // 그림 기다리는 동안 푸는 O/X 퀴즈
    quizTitle: "AI 퀴즈! 기다리는 동안 풀어봐요",
    quizO: "⭕ 맞아요",
    quizX: "❌ 아니에요",
    quizCorrect: "정답입니다!",
    quizWrong: "아쉬워요!",
    quizNext: "다음 문제",
    quizScore: "맞힌 개수: {n}",
    // [문장, 정답(true=O / false=X), 설명]
    QUIZ: [
      ["AI는 우리가 글로 자세히 설명하면 그림을 그려줄 수 있어요.", true, "자세히 설명할수록 더 멋진 그림이 나와요."],
      ["AI는 사람처럼 진짜로 기쁘거나 슬픈 기분을 느껴요.", false, "AI는 기분을 진짜로 느끼진 못해요. 똑똑한 컴퓨터 프로그램이에요."],
      ["AI는 아주 많은 자료를 보고 공부해서 똑똑해진 거예요.", true, "AI는 엄청나게 많은 자료로 학습해요."],
      ["AI도 가끔 틀린 답을 말할 때가 있어요.", true, "그래서 AI가 한 말도 한 번 더 확인하는 게 좋아요."],
      ["AI는 잠을 자야만 일을 할 수 있어요.", false, "AI는 잠을 안 자도 돼요. 컴퓨터니까요!"],
      ["'프롬프트'는 AI에게 무엇을 해달라고 적어주는 말이에요.", true, "좋은 프롬프트가 좋은 결과를 만들어요."],
      ["로봇과 AI는 완전히 똑같은 말이에요.", false, "로봇은 몸(기계)이고, AI는 그 안의 똑똑한 두뇌 같은 거예요."],
      ["AI에게 자세히 설명할수록 내가 원하는 결과를 얻기 쉬워요.", true, "그래서 설명을 자세히 하는 게 중요해요."],
      ["AI는 세상에서 방금 일어난 가장 최신 소식까지 전부 알고 있어요.", false, "AI는 배운 시점까지만 알아서 아주 최신 소식은 모를 수 있어요."],
      ["내 비밀번호나 집 주소는 함부로 AI에게 알려주지 않는 게 좋아요.", true, "중요한 개인정보는 잘 지키는 게 안전해요."],
    ],
  },

  // ===================================================== English
  en: {
    appTitle: "AI Art Lab",
    appSub: "Let's make your very own picture!",
    homeBtn: "🏠 Home",
    resetBtn: "🔄 Restart",

    introHi: "Hi! I'm Raimi, your drawing AI buddy",
    introTitle: "Let's make a picture together with Raimi!",
    introBody:
      "AI draws <b>exactly what we describe</b>.\nSo the more <b>detail</b> you give about <b>what · where · which colors · what mood</b> to draw,\nthe cooler your picture turns out!\n\nThese describing words are called a <b>'prompt'</b>.\nA great prompt makes a great picture.\nCome on, let's make one together! ✨",
    introStart: "Okay, let's start!",

    homeH1: "How shall we make a picture?",
    homeP: "Pick one of the two! 🎉",
    cardBlocksTitle: "Build with blocks",
    cardBlocksDesc: "Tap the buttons to<br>finish your picture fast and easy!",
    cardBlocksTag: "Easy",
    cardChatTitle: "Make it by chatting",
    cardChatDesc: "Chat with Raimi and<br>make any picture you want!",
    cardChatTag: "Free & fun",

    chatHeader: "Chat with Raimi, your art buddy",
    chatPlaceholder: "Type here...",
    chatSend: "Send",
    chatFinish: "Make the picture now!",
    chatGreeting:
      "Hi! I'm Raimi, your drawing AI buddy \nWhat picture would you like to make today? Animals, robots, space... anything! Tell me what comes to mind :D",
    chatError: "Oops, something went wrong. Could you say that again?",
    chatFinishMsg: "Got it! Let me draw it for you now!",
    chatFailMsg: "Oops, I couldn't make the picture ㅠㅠ Could you tap the button once more in a moment?",

    genText: "Drawing your picture...",
    genSub: "Raimi is busy coloring it in!",

    reviewH2: "Your picture is ready!",
    reviewErr: "Oops, making the picture failed.<br>{err}<br>Shall we try again?",
    reviewP: "Do you like it? Or shall we change it a bit?",
    reviewFix: "Fix it like this ({n})",
    reviewDone: "Done! Share it",
    reviewRetry: "Try again",

    resultH2: "Done! What a masterpiece!",
    qrTitle: "📱 Take it with a QR code",
    qrDesc: "Scan the QR with your phone camera<br>to see your picture!",
    qrWarn: "⏰ This QR <b>disappears in 5 hours.</b><br>Be sure to save it to your phone before then!",
    againBtn: "Make a new picture",

    moreTitle: "All set!",
    moreDesc: "Draw it now? Adding more details makes your picture even cooler!",
    moreDrawNow: "Draw it now",
    moreMore: "Add more details (+5)",

    STEPS: [
      { key: "subject", title: "What shall we draw?", emoji: "🎨", options: [
        ["Cute animal", "a cute and lovable animal"], ["Cool robot", "a shiny cool robot"],
        ["Space planet", "a mysterious planet in space"], ["Magic castle", "a fairy-tale magic castle"],
        ["Sea creature", "a wondrous sea creature"], ["Dinosaur", "a brave dinosaur"]] },
      { key: "place", title: "Where is it?", emoji: "🌍", options: [
        ["Forest", "in a green forest"], ["Space", "in a star-filled space"], ["Beach", "on a sunny beach"],
        ["Future city", "in a shiny future city"], ["In the sky", "in the sky above the clouds"], ["In a cave", "in a cave with sparkling jewels"]] },
      { key: "color", title: "Which color do you like?", emoji: "🌈", options: [
        ["Rainbow", "colorful rainbow colors"], ["Blue", "mostly cool blue"], ["Pink", "mostly lovely pink"],
        ["Green", "mostly fresh green"], ["Yellow", "mostly bright warm yellow"], ["Purple", "mostly mysterious purple"]] },
      { key: "mood", title: "What's the mood?", emoji: "✨", options: [
        ["Exciting", "an exciting and lively mood"], ["Peaceful", "a peaceful and calm mood"], ["Mysterious", "a mysterious and magical mood"],
        ["Brave", "a brave and bold mood"], ["Cozy", "a cozy and warm mood"]] },
      { key: "style", title: "What art style?", emoji: "🖌️", options: [
        ["Storybook", "a soft storybook illustration style"], ["Cartoon", "a cute cartoon style"], ["Watercolor", "a clear watercolor style"],
        ["Pixel art", "a dotted pixel-art style"], ["Realistic", "a photo-realistic style"]] },
      { key: "time", title: "What time is it?", emoji: "🕐", options: [
        ["Daytime", "bright daytime"], ["Sunset", "at orange sunset"], ["Night", "a starry night"], ["Dawn", "a misty dawn"]] },
      { key: "size", title: "How big is it?", emoji: "🔍", options: [
        ["Small & cute", "at a small cute size"], ["Medium", "at a normal medium size"],
        ["Big & grand", "at a big grand size"], ["Fill the screen", "big enough to fill the whole screen"]] },
      { key: "weather", title: "What's the weather?", emoji: "☁️", options: [
        ["Sunny", "in sunny clear weather"], ["Rainy", "in gentle rainy weather"],
        ["Snowy", "in white snowy weather"], ["Rainbow", "with a rainbow after the rain"]] },
      { key: "companion", title: "Who is with them?", emoji: "👫", options: [
        ["Alone", "all by themselves"], ["With a friend", "together with one friend"],
        ["With many", "together with many friends"], ["With an animal", "with a cute animal friend"]] },
      { key: "special", title: "Any special touch?", emoji: "🎀", options: [
        ["Sparkles", "with sparkling stardust"], ["Wings", "with pretty wings on the back"], ["Crown", "with a shiny crown on the head"],
        ["Balloons", "with floating balloons"], ["None", "clean with no special touch"]] },
    ],
    STEPS_EXTRA: [
      { key: "view", title: "How is it framed?", emoji: "📷", options: [
        ["Close-up", "a close-up of the main character"], ["Whole scene", "showing the whole scene at once"],
        ["From above", "seen from above"], ["From below", "seen from below"]] },
      { key: "light", title: "What kind of light?", emoji: "💡", options: [
        ["Warm sunlight", "lit by warm sunlight"], ["Sparkling", "with sparkling light all around"],
        ["Soft moonlight", "lit by soft glowing moonlight"], ["Neon", "with colorful neon lights"]] },
      { key: "detail", title: "How detailed?", emoji: "🔬", options: [
        ["Very simple", "very simple and clean"], ["Medium", "with moderate detail"],
        ["Very detailed", "very intricate and detailed"]] },
      { key: "deco", title: "Background decoration?", emoji: "🌟", options: [
        ["Stars", "a background full of little stars"], ["Flowers", "a background full of pretty flowers"], ["Hearts", "a background full of cute hearts"],
        ["Bubbles", "a background full of round bubbles"], ["None", "a clean background"]] },
      { key: "action", title: "What are they doing?", emoji: "🏃", options: [
        ["Still", "standing still"], ["Running", "running energetically"],
        ["Jumping", "jumping high"], ["Dancing", "dancing joyfully"]] },
    ],
    TWEAKS: [
      ["Brighter", "brighter and more vivid overall"], ["Bigger", "the main character bigger and closer"],
      ["Add a friend", "add one more cute friend beside it"], ["Add sparkles", "add lots of sparkling light effects"],
      ["Simpler", "tidy up the background to be simpler"], ["Fancier", "make it fancier with richer details"]],

    // O/X quiz to play while waiting for the picture
    quizTitle: "AI Quiz! Play while you wait",
    quizO: "⭕ True",
    quizX: "❌ False",
    quizCorrect: "Correct!",
    quizWrong: "Oops!",
    quizNext: "Next question",
    quizScore: "Correct: {n}",
    // [statement, answer(true=O / false=X), explanation]
    QUIZ: [
      ["AI can draw a picture if we describe it in detail with words.", true, "The more detail you give, the cooler the picture."],
      ["AI really feels happy or sad just like a person.", false, "AI doesn't really feel emotions. It's a smart computer program."],
      ["AI became smart by studying a huge amount of data.", true, "AI learns from an enormous amount of data."],
      ["AI sometimes gives wrong answers too.", true, "That's why it's good to double-check what AI says."],
      ["AI must sleep before it can do any work.", false, "AI doesn't need sleep. It's a computer!"],
      ["A 'prompt' is what we write to tell the AI what to do.", true, "A good prompt makes a good result."],
      ["A robot and AI mean exactly the same thing.", false, "A robot is the body (machine); AI is like the smart brain inside."],
      ["The more clearly you explain to AI, the easier it is to get what you want.", true, "That's why explaining clearly matters."],
      ["AI already knows every piece of the very latest news in the world.", false, "AI only knows up to when it was trained, so it may miss very recent news."],
      ["It's best not to give AI your password or home address.", true, "Keeping important personal info safe is the smart choice."],
    ],
  },
};
