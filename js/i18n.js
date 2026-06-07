// ===================== 다국어(한국어 / English / 中文) =====================
// 화면에 보이는 모든 글자를 언어별로 모아둔 곳이에요.
// 새 글자를 추가하려면 ko / en / zh 세 곳에 모두 넣어주세요.

export const LANGS = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export const I18N = {
  // ===================================================== 한국어
  ko: {
    appTitle: "AI 그림 마법사",
    appSub: "나만의 그림을 만들어보자!",
    homeBtn: "🏠 처음으로",

    // 인트로
    introHi: "안녕! 나는 그림 친구 라이미야 🤖🎨",
    introTitle: "라이미와 함께 그림을 만들어보자!",
    introBody:
      "AI는 우리가 설명한 대로 그림을 그려줘.\n그래서 '무엇을 · 어디서 · 어떤 색으로 · 어떤 기분으로' 그릴지 자세히 말해줄수록 더 멋진 그림이 나와!\n\n이렇게 그림을 설명하는 말을 '프롬프트'라고 불러. 멋진 프롬프트가 멋진 그림을 만든단다. 자, 나랑 같이 만들어볼까? ✨",
    introStart: "좋아, 시작하자! 🚀",

    // 홈
    homeH1: "어떻게 그림을 만들까?",
    homeP: "둘 중에 하나를 골라봐! 🎉",
    cardBlocksTitle: "블록으로 만들기",
    cardBlocksDesc: "버튼을 톡톡 골라서<br>쉽고 빠르게 그림 완성!",
    cardBlocksTag: "쉬워요 😊",
    cardChatTitle: "대화하며 만들기",
    cardChatDesc: "라이미와 이야기하며<br>내 맘대로 그림 만들기!",
    cardChatTag: "자유로워요 ✨",

    // 채팅
    chatHeader: "🎨 그림 친구 라이미와 대화하기",
    chatPlaceholder: "여기에 입력해봐...",
    chatSend: "보내기",
    chatFinish: "🎨 이제 그림 만들기!",
    chatGreeting:
      "안녕! 나는 그림 친구 라이미야 🎨\n오늘 어떤 그림을 만들고 싶어? 동물, 로봇, 우주... 뭐든 좋아! 떠오르는 걸 말해줘 😊",
    chatError: "앗, 잠깐 문제가 생겼어. 다시 한 번 말해줄래? 🙏",
    chatFinishMsg: "알겠어! 이제 그림을 그려줄게! 🎨",
    chatFailMsg: "앗, 그림 만들기에 실패했어 ㅠㅠ 잠시 뒤에 버튼을 한 번 더 눌러줄래?",

    // 생성중
    genText: "그림을 그리는 중이에요...",
    genSub: "라이미가 열심히 색칠하고 있어요! ✨",

    // 리뷰
    reviewH2: "그림이 완성됐어! 🎉",
    reviewErr: "앗, 그림 만들기에 실패했어요.<br>{err}<br>다시 해볼까요?",
    reviewP: "마음에 들어? 아니면 조금 바꿔볼까?",
    reviewFix: "🔄 이렇게 고치기 ({n})",
    reviewDone: "✅ 완성! 공유하기",
    reviewRetry: "🔄 다시 만들기",

    // 결과
    resultH2: "🎉 완성! 멋진 작품이야! 🎉",
    qrTitle: "📱 QR로 가져가기",
    qrDesc: "휴대폰 카메라로 QR을 찍으면<br>내 그림을 볼 수 있어요!",
    qrWarn: "⏰ 이 QR은 <b>5시간 후에 사라져요.</b><br>그 전에 꼭 휴대폰에 저장해 주세요!",
    againBtn: "🆕 새 그림 만들기",

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
    ],
    TWEAKS: [
      ["더 밝게", "전체적으로 더 밝고 화사하게"], ["더 크게", "주인공을 더 크고 가깝게"],
      ["친구 추가", "옆에 귀여운 친구를 한 명 더 추가"], ["반짝이 추가", "반짝이는 빛 효과를 잔뜩 추가"],
      ["더 단순하게", "배경을 단순하게 정리"], ["더 화려하게", "더 화려하고 디테일을 풍부하게"]],
  },

  // ===================================================== English
  en: {
    appTitle: "AI Art Wizard",
    appSub: "Let's make your very own picture!",
    homeBtn: "🏠 Home",

    introHi: "Hi! I'm Raimi, your drawing buddy 🤖🎨",
    introTitle: "Let's make a picture together with Raimi!",
    introBody:
      "AI draws exactly what we describe.\nSo the more details you give — WHAT to draw, WHERE it is, WHICH colors, and WHAT mood — the cooler your picture turns out!\n\nThese describing words are called a 'prompt'. A great prompt makes a great picture. Come on, let's make one together! ✨",
    introStart: "Okay, let's start! 🚀",

    homeH1: "How shall we make a picture?",
    homeP: "Pick one of the two! 🎉",
    cardBlocksTitle: "Build with blocks",
    cardBlocksDesc: "Tap the buttons to<br>finish your picture fast and easy!",
    cardBlocksTag: "Easy 😊",
    cardChatTitle: "Make it by chatting",
    cardChatDesc: "Chat with Raimi and<br>make any picture you want!",
    cardChatTag: "Free & fun ✨",

    chatHeader: "🎨 Chat with Raimi, your art buddy",
    chatPlaceholder: "Type here...",
    chatSend: "Send",
    chatFinish: "🎨 Make the picture now!",
    chatGreeting:
      "Hi! I'm Raimi, your drawing buddy 🎨\nWhat picture would you like to make today? Animals, robots, space... anything! Tell me what comes to mind 😊",
    chatError: "Oops, something went wrong. Could you say that again? 🙏",
    chatFinishMsg: "Got it! Let me draw it for you now! 🎨",
    chatFailMsg: "Oops, I couldn't make the picture ㅠㅠ Could you tap the button once more in a moment?",

    genText: "Drawing your picture...",
    genSub: "Raimi is busy coloring it in! ✨",

    reviewH2: "Your picture is ready! 🎉",
    reviewErr: "Oops, making the picture failed.<br>{err}<br>Shall we try again?",
    reviewP: "Do you like it? Or shall we change it a bit?",
    reviewFix: "🔄 Fix it like this ({n})",
    reviewDone: "✅ Done! Share it",
    reviewRetry: "🔄 Try again",

    resultH2: "🎉 Done! What a masterpiece! 🎉",
    qrTitle: "📱 Take it with a QR code",
    qrDesc: "Scan the QR with your phone camera<br>to see your picture!",
    qrWarn: "⏰ This QR <b>disappears in 5 hours.</b><br>Be sure to save it to your phone before then!",
    againBtn: "🆕 Make a new picture",

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
    ],
    TWEAKS: [
      ["Brighter", "brighter and more vivid overall"], ["Bigger", "the main character bigger and closer"],
      ["Add a friend", "add one more cute friend beside it"], ["Add sparkles", "add lots of sparkling light effects"],
      ["Simpler", "tidy up the background to be simpler"], ["Fancier", "make it fancier with richer details"]],
  },

  // ===================================================== 中文
  zh: {
    appTitle: "AI 绘画魔法师",
    appSub: "来创作属于你自己的图画吧！",
    homeBtn: "🏠 回首页",

    introHi: "你好！我是绘画好朋友莱米 🤖🎨",
    introTitle: "和莱米一起来画画吧！",
    introBody:
      "AI 会照着我们说的话来画画。\n所以你说得越详细——画什么·在哪里·用什么颜色·什么心情——画出来就越棒！\n\n这些描述的话就叫做「提示词」(prompt)。好的提示词才能画出好的图画。来，我们一起来写吧！✨",
    introStart: "好，开始吧！🚀",

    homeH1: "我们要怎么画画呢？",
    homeP: "从两个里选一个吧！🎉",
    cardBlocksTitle: "用积木来做",
    cardBlocksDesc: "轻轻点按钮选一选，<br>又快又简单完成图画！",
    cardBlocksTag: "很简单 😊",
    cardChatTitle: "聊天来做",
    cardChatDesc: "和莱米聊聊天，<br>随心画出你想要的画！",
    cardChatTag: "很自由 ✨",

    chatHeader: "🎨 和绘画好朋友莱米聊天",
    chatPlaceholder: "在这里输入吧……",
    chatSend: "发送",
    chatFinish: "🎨 现在来画图吧！",
    chatGreeting:
      "你好！我是绘画好朋友莱米 🎨\n今天想画什么呢？动物、机器人、宇宙……什么都行！把你想到的告诉我吧 😊",
    chatError: "哎呀，出了点小问题。能再说一次吗？🙏",
    chatFinishMsg: "好的！现在就给你画出来！🎨",
    chatFailMsg: "哎呀，画图失败了 ㅠㅠ 过一会儿再点一次按钮好吗？",

    genText: "正在画图……",
    genSub: "莱米正在认真涂色！✨",

    reviewH2: "图画完成啦！🎉",
    reviewErr: "哎呀，画图失败了。<br>{err}<br>再试一次好吗？",
    reviewP: "喜欢吗？还是稍微改一改？",
    reviewFix: "🔄 这样修改 ({n})",
    reviewDone: "✅ 完成！分享",
    reviewRetry: "🔄 重新画",

    resultH2: "🎉 完成！真是杰作！🎉",
    qrTitle: "📱 用二维码带走",
    qrDesc: "用手机相机扫一扫二维码，<br>就能看到你的图画！",
    qrWarn: "⏰ 这个二维码<b>5 小时后会消失。</b><br>请一定在那之前保存到手机里！",
    againBtn: "🆕 画一张新图",

    STEPS: [
      { key: "subject", title: "要画什么呢？", emoji: "🎨", options: [
        ["可爱的动物", "可爱又惹人喜爱的动物"], ["酷酷的机器人", "闪闪发光的酷机器人"],
        ["宇宙行星", "神秘的宇宙行星"], ["魔法城堡", "童话里的魔法城堡"],
        ["海洋生物", "海里神奇的生物"], ["恐龙", "勇敢的恐龙"]] },
      { key: "place", title: "它在哪里呢？", emoji: "🌍", options: [
        ["森林里", "在青翠的森林里"], ["宇宙", "在满天星星的宇宙"], ["海边", "在阳光照耀的海边"],
        ["未来城市", "在闪亮的未来城市"], ["天空上", "在云朵之上的天空"], ["洞穴里", "在宝石闪耀的洞穴里"]] },
      { key: "color", title: "喜欢什么颜色？", emoji: "🌈", options: [
        ["彩虹色", "五彩缤纷的彩虹色"], ["蓝色", "以清爽的蓝色为主"], ["粉色", "以可爱的粉色为主"],
        ["绿色", "以清新的绿色为主"], ["黄色", "以明亮温暖的黄色为主"], ["紫色", "以神秘的紫色为主"]] },
      { key: "mood", title: "是什么心情？", emoji: "✨", options: [
        ["兴奋的", "兴奋又有活力的氛围"], ["平和的", "平和又安静的氛围"], ["神秘的", "神秘又魔幻的氛围"],
        ["勇敢的", "勇敢又大胆的氛围"], ["温馨的", "温馨又温暖的氛围"]] },
      { key: "style", title: "什么绘画风格？", emoji: "🖌️", options: [
        ["绘本风", "柔和的绘本插画风格"], ["卡通", "可爱的卡通风格"], ["水彩", "清澈的水彩风格"],
        ["像素画", "看得到像素点的像素画风格"], ["写实", "像照片一样写实的风格"]] },
      { key: "time", title: "是什么时候？", emoji: "🕐", options: [
        ["白天", "明亮的白天"], ["晚霞", "橙色晚霞时分"], ["夜晚", "繁星满天的夜晚"], ["黎明", "薄雾的黎明"]] },
    ],
    TWEAKS: [
      ["更亮一点", "整体更明亮更鲜艳"], ["更大一点", "把主角画得更大更近"],
      ["加个朋友", "在旁边再加一个可爱的朋友"], ["加点闪光", "加上很多闪亮的光效"],
      ["更简单", "把背景整理得更简单"], ["更华丽", "更华丽、细节更丰富"]],
  },
};
