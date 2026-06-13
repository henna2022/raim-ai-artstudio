import { I18N, LANGS } from "./i18n.js?v=8";

// ===================== 설정 =====================
// 같은 도메인에 배포되면 그대로 두면 됩니다.
// 프론트엔드와 API가 다른 주소면 여기에 백엔드 주소를 넣으세요. 예: "https://my-app.vercel.app"
const API_BASE = "";
const RAIMI_IMG = "assets/raimi.png"; // 라이미 로봇 이미지 (이 위치에 png 파일을 넣어주세요)

// ===================== 상태 =====================
let lang = localStorage.getItem("raimi-lang") || "ko";
if (!I18N[lang]) lang = "ko";
let currentScreen = "s-intro";
let picks = {};
let stepIdx = 0;
let extraMode = false; // "더 자세히 정하기(+5)"를 눌렀는지
let selectedTweaks = [];
let lastPrompt = "";
let chatMessages = [];
let currentImageUrl = null;
let lastReview = { url: null, err: null };
let quizOrder = [];
let quizPos = 0;
let quizScore = 0;
let genTimer = null;

// ===================== 번역 도우미 =====================
function t(key) { return I18N[lang][key]; }
// 문장이 끝나면(. ? ! 。 ？ ！) 줄바꿈 — 말줄임표(...)·소수점(3.14)은 제외
function breakSentences(text) {
  return String(text)
    .replace(/([.?!。？！]+)(\s*)/g, (m, punct, _ws, offset, str) => {
      const prev = str[offset - 1], next = str[offset + m.length];
      // 소수점: 점 하나가 숫자 사이에 있으면 줄바꿈 안 함 (예: 3.14)
      if (punct === "." && /\d/.test(prev || "") && /\d/.test(next || "")) return m;
      // 말줄임표: 점·마침표만 2개 이상이면 문장 끝이 아니라 보고 줄바꿈 안 함 (예: 우주...)
      if (/^[.。]{2,}$/.test(punct)) return m;
      return punct + "\n";
    })
    .replace(/\n+$/, ""); // 끝에 생긴 줄바꿈 제거
}
function steps() { return I18N[lang].STEPS; }
function extraSteps() { return I18N[lang].STEPS_EXTRA || []; }
// 현재 활성화된 단계 목록 (기본 10개, +5를 누르면 15개)
function activeSteps() { return extraMode ? steps().concat(extraSteps()) : steps(); }
function tweaks() { return I18N[lang].TWEAKS; }
function fill(str, vars) { return str.replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars) ? vars[k] : ""); }

// 라이미 이미지를 못 찾을 때 이모지로 대체
function raimiFallback(img) {
  img.onerror = () => {
    const span = document.createElement("span");
    span.textContent = "🤖";
    span.style.fontSize = (img.classList.contains("avatarImg")) ? "26px"
      : (img.classList.contains("cardImg")) ? "64px" : "80px";
    span.className = img.className;
    img.replaceWith(span);
  };
}
function raimiImg(extraClass) {
  const img = document.createElement("img");
  img.src = RAIMI_IMG; img.alt = "라이미"; img.className = extraClass;
  raimiFallback(img);
  return img;
}

// 정적 텍스트(data-i18n) 적용
function applyTranslations() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  // 언어 버튼은 항상 'LANG'으로 표기 (메뉴에서 한국어/English 선택)
  document.getElementById("langCurrent").textContent = "LANG";
}

// ===================== 언어 전환 =====================
function buildLangMenu() {
  const menu = document.getElementById("langMenu"); menu.innerHTML = "";
  LANGS.forEach(l => {
    const b = document.createElement("button");
    b.className = "langOpt" + (l.code === lang ? " active" : "");
    b.textContent = l.label;
    b.onclick = () => { setLang(l.code); menu.classList.remove("open"); };
    menu.appendChild(b);
  });
}
function setLang(code) {
  if (!I18N[code]) return;
  lang = code;
  localStorage.setItem("raimi-lang", code);
  applyTranslations();
  buildLangMenu();
  // 현재 화면을 다시 그려서 번역을 반영
  if (currentScreen === "s-blocks") renderBlockStep();
  else if (currentScreen === "s-review") renderReview(lastReview.url, lastReview.err);
  else if (currentScreen === "s-result" && currentImageUrl) renderResult(currentImageUrl);
  else if (currentScreen === "s-chat") {
    if (chatMessages.length === 1 && chatMessages[0].role === "assistant") chatMessages[0].content = t("chatGreeting");
    renderChat();
  }
  else if (currentScreen === "s-gen") startQuiz();
}
document.getElementById("langBtn").onclick = (e) => {
  e.stopPropagation();
  document.getElementById("langMenu").classList.toggle("open");
};
document.addEventListener("click", () => document.getElementById("langMenu").classList.remove("open"));

// ===================== 화면 전환 =====================
function show(id) {
  currentScreen = id;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("on"));
  document.getElementById(id).classList.add("on");
  document.getElementById("homeBtn").style.display = (id === "s-home" || id === "s-intro") ? "none" : "block";
  window.scrollTo(0, 0);
  if (id === "s-gen") { startQuiz(); startGenAnim(); }
  else stopGenAnim();
}

// ===================== 생성 화면: 그림 그리는 라이미 2초마다 번갈아 =====================
const GEN_IMAGES = ["assets/raimi_drawing_1.png", "assets/raimi_drawing_2.png"];
function startGenAnim() {
  stopGenAnim();
  const el = document.getElementById("genPainter");
  if (!el || el.tagName !== "IMG") return;
  let i = 0;
  el.src = GEN_IMAGES[0];
  genTimer = setInterval(() => { i = (i + 1) % GEN_IMAGES.length; el.src = GEN_IMAGES[i]; }, 2000);
}
function stopGenAnim() { if (genTimer) { clearInterval(genTimer); genTimer = null; } }

// ===================== 기다리는 동안 O/X 퀴즈 =====================
function startQuiz() {
  const list = I18N[lang].QUIZ || [];
  quizOrder = list.map((_, i) => i);
  for (let i = quizOrder.length - 1; i > 0; i--) { // 섞기
    const j = Math.floor(Math.random() * (i + 1));
    [quizOrder[i], quizOrder[j]] = [quizOrder[j], quizOrder[i]];
  }
  quizPos = 0;
  quizScore = 0;
  renderQuizQuestion();
}
function renderQuizQuestion() {
  const card = document.getElementById("quizCard");
  if (!card) return;
  const list = I18N[lang].QUIZ || [];
  if (!list.length) { card.innerHTML = ""; return; }
  const q = list[quizOrder[quizPos]];
  card.innerHTML =
    '<div class="quizTitle">' + t("quizTitle") + "</div>" +
    '<div class="quizQ">' + q[0] + "</div>" +
    '<div class="quizBtns">' +
      '<button class="quizBtn o" data-ans="1">' + t("quizO") + "</button>" +
      '<button class="quizBtn x" data-ans="0">' + t("quizX") + "</button>" +
    "</div>";
  card.querySelectorAll(".quizBtn").forEach(btn => {
    btn.onclick = () => answerQuiz(btn.dataset.ans === "1");
  });
}
function answerQuiz(choice) {
  const card = document.getElementById("quizCard");
  if (!card) return;
  const q = I18N[lang].QUIZ[quizOrder[quizPos]];
  const correct = (choice === q[1]);
  if (correct) quizScore++;
  card.querySelectorAll(".quizBtn").forEach(b => { b.disabled = true; });
  const fb = document.createElement("div");
  fb.className = "quizFeedback fadeUp";
  fb.innerHTML =
    '<span class="res ' + (correct ? "ok" : "no") + '">' + t(correct ? "quizCorrect" : "quizWrong") + "</span>" +
    '<span class="exp">' + q[2] + "</span>";
  card.querySelector(".quizBtns").after(fb);
  const next = document.createElement("button");
  next.className = "quizNextBtn"; next.textContent = t("quizNext");
  next.onclick = () => { quizPos = (quizPos + 1) % I18N[lang].QUIZ.length; renderQuizQuestion(); };
  fb.after(next);
}
function goHome() {
  picks = {}; stepIdx = 0; extraMode = false; selectedTweaks = []; chatMessages = []; show("s-home");
}
// 맨 처음 화면(인트로)으로 완전 초기화
function resetToStart() {
  picks = {}; stepIdx = 0; extraMode = false; selectedTweaks = []; chatMessages = [];
  currentImageUrl = null; stopGenAnim();
  show("s-intro");
}
document.getElementById("homeBtn").onclick = goHome;
document.getElementById("resetBtn").onclick = resetToStart;
document.getElementById("introStart").onclick = () => show("s-home");

// ===================== 모드 선택 =====================
document.querySelectorAll(".bigCard").forEach(b => {
  b.onclick = () => {
    if (b.dataset.mode === "blocks") { picks = {}; stepIdx = 0; extraMode = false; renderBlockStep(); show("s-blocks"); }
    else { startChat(); show("s-chat"); }
  };
});

// ===================== API 호출 =====================
async function apiGenerate(prompt) {
  const r = await fetch(API_BASE + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "생성 실패"); }
  return (await r.json()).url;
}
async function apiChat(messages, mode) {
  const r = await fetch(API_BASE + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, lang, mode })
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "대화 실패"); }
  return (await r.json()).reply;
}

// ===================== 블록 플로우 =====================
function renderProgress() {
  const row = document.getElementById("progressRow"); row.innerHTML = "";
  activeSteps().forEach((s, i) => {
    const d = document.createElement("span");
    d.className = "dot" + (i === stepIdx ? " active" : i < stepIdx ? " done" : "");
    row.appendChild(d);
  });
  document.getElementById("stepLabel").textContent = (stepIdx + 1) + " / " + activeSteps().length;
}
function renderBlockStep() {
  renderProgress();
  const step = activeSteps()[stepIdx];
  const wrap = document.getElementById("blockQuestion");
  wrap.innerHTML = "";
  const card = document.createElement("div");
  card.className = "questionCard fadeUp";
  card.innerHTML = '<div class="qEmoji">' + step.emoji + '</div><h2 class="qTitle">' + step.title + "</h2>";
  const grid = document.createElement("div"); grid.className = "optGrid";
  step.options.forEach(([label, value]) => {
    const btn = document.createElement("button"); btn.className = "optBlock"; btn.textContent = label;
    btn.onclick = () => {
      picks[step.key] = value;
      // 기본 10개를 다 고른 시점: 안내 화면으로
      if (!extraMode && stepIdx === steps().length - 1) { renderMoreChoice(); }
      else if (stepIdx < activeSteps().length - 1) { stepIdx++; renderBlockStep(); }
      else { runGenerate(buildPrompt()); }
    };
    grid.appendChild(btn);
  });
  card.appendChild(grid);
  wrap.appendChild(card);
  if (stepIdx > 0) {
    const back = document.createElement("button"); back.className = "backBtn"; back.textContent = "←";
    back.onclick = () => { stepIdx--; renderBlockStep(); };
    wrap.appendChild(back);
  }
}
// 기본 10개를 다 고른 뒤: 이대로 그릴지 / 5개 더 정할지
function renderMoreChoice() {
  document.getElementById("progressRow").innerHTML = "";
  document.getElementById("stepLabel").textContent = steps().length + " / " + steps().length;
  const wrap = document.getElementById("blockQuestion");
  wrap.innerHTML = "";
  const card = document.createElement("div");
  card.className = "questionCard fadeUp";
  card.innerHTML =
    '<div class="qEmoji">🎉</div><h2 class="qTitle">' + t("moreTitle") + "</h2>" +
    '<p class="moreDesc">' + t("moreDesc") + "</p>";
  const row = document.createElement("div"); row.className = "btnRow";
  const draw = document.createElement("button"); draw.className = "actionBtn primary";
  draw.textContent = t("moreDrawNow");
  draw.onclick = () => runGenerate(buildPrompt());
  const more = document.createElement("button"); more.className = "actionBtn secondary";
  more.textContent = t("moreMore");
  more.onclick = () => { extraMode = true; stepIdx++; renderBlockStep(); };
  row.appendChild(draw); row.appendChild(more);
  card.appendChild(row);
  wrap.appendChild(card);
  const back = document.createElement("button"); back.className = "backBtn"; back.textContent = "←";
  back.onclick = () => { stepIdx = steps().length - 1; renderBlockStep(); };
  wrap.appendChild(back);
}
function buildPrompt(extra) {
  const base = activeSteps().map(s => picks[s.key]).filter(Boolean).join(", ");
  const ex = (extra && extra.length) ? " / " + extra.join(", ") + "." : "";
  return base + "." + ex;
}

// ===================== 생성 + 리뷰 =====================
async function runGenerate(prompt) {
  lastPrompt = prompt;
  show("s-gen");
  try {
    const url = await apiGenerate(prompt);
    renderResult(url); // 리뷰 단계 없이 바로 결과(이미지+QR) 화면으로
  } catch (e) {
    renderReview(null, e.message); // 실패 시에만 리뷰 화면(에러+다시 시도)
  }
}
function renderReview(url, err) {
  currentImageUrl = url;
  lastReview = { url, err };
  const s = document.getElementById("s-review");
  let html = '<div class="fadeUp center"><h2 class="reviewH2">' + t("reviewH2") + "</h2>";
  if (err) { html += '<div class="errBox">' + fill(t("reviewErr"), { err }) + "</div>"; }
  else { html += '<div class="artFrame"><img src="' + url + '" alt="art"></div>'; }
  html += '<div class="btnRow" id="reviewBtns"></div></div>';
  s.innerHTML = html;

  renderReviewButtons();
  show("s-review");
}
function renderReviewButtons() {
  const row = document.getElementById("reviewBtns"); if (!row) return;
  row.innerHTML = "";
  if (currentImageUrl) {
    const done = document.createElement("button"); done.className = "actionBtn primary";
    done.textContent = t("reviewDone");
    done.onclick = () => renderResult(currentImageUrl);
    row.appendChild(done);
  } else {
    const retry = document.createElement("button"); retry.className = "actionBtn primary";
    retry.textContent = t("reviewRetry");
    retry.onclick = () => runGenerate(lastPrompt);
    row.appendChild(retry);
  }
}

// ===================== 결과 + QR =====================
function renderResult(url) {
  currentImageUrl = url;
  const qr = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=" + encodeURIComponent(url);
  const s = document.getElementById("s-result");
  s.innerHTML =
    '<div class="fadeUp center"><h2 class="reviewH2">' + t("resultH2") + "</h2>" +
    '<div class="resultLayout">' +
      '<div class="artFrame"><img src="' + url + '" alt="art"></div>' +
      '<div class="qrCard"><div class="qrTitle">' + t("qrTitle") + "</div>" +
      '<div class="qrDesc">' + t("qrDesc") + "</div>" +
      '<img class="qrImg" src="' + qr + '" alt="QR">' +
      '<div class="qrWarn">' + t("qrWarn") + "</div></div>" +
    "</div>" +
    '<div class="btnRow"><button class="actionBtn primary" id="againBtn">' + t("againBtn") + "</button></div></div>";
  show("s-result");
  document.getElementById("againBtn").onclick = goHome;
}

// ===================== 채팅 플로우 =====================
function startChat() {
  chatMessages = [{ role: "assistant", content: t("chatGreeting") }];
  renderChat();
}
function renderChat(loading) {
  const sc = document.getElementById("chatScroll"); sc.innerHTML = "";
  chatMessages.forEach(m => {
    const row = document.createElement("div"); row.className = "bubbleRow fadeUp";
    row.style.justifyContent = m.role === "user" ? "flex-end" : "flex-start";
    if (m.role === "assistant") row.appendChild(raimiImg("avatarImg"));
    const b = document.createElement("div"); b.className = "bubble " + (m.role === "user" ? "bubbleUser" : "bubbleAI");
    b.textContent = breakSentences(m.content); row.appendChild(b);
    sc.appendChild(row);
  });
  if (loading) {
    const row = document.createElement("div"); row.className = "bubbleRow";
    row.appendChild(raimiImg("avatarImg"));
    const b = document.createElement("div"); b.className = "bubble bubbleAI";
    b.innerHTML = '<span class="typing"><i></i> <i></i> <i></i></span>';
    row.appendChild(b);
    sc.appendChild(row);
  }
  sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
}
async function sendChat() {
  const inp = document.getElementById("chatInput");
  const text = inp.value.trim(); if (!text) return;
  inp.value = "";
  chatMessages.push({ role: "user", content: text });
  renderChat(true);
  try {
    const reply = await apiChat(chatMessages.filter(m => m.role !== "system"));
    chatMessages.push({ role: "assistant", content: reply });
  } catch (e) {
    chatMessages.push({ role: "assistant", content: t("chatError") });
  }
  renderChat(false);
}
document.getElementById("chatSend").onclick = sendChat;
document.getElementById("chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendChat(); }
});
document.getElementById("chatFinish").onclick = async () => {
  // 1) 라이미가 마무리 인사 (프롬프트는 절대 보여주지 않음)
  chatMessages.push({ role: "assistant", content: t("chatFinishMsg") });
  renderChat(false);
  await new Promise(r => setTimeout(r, 900)); // 인사를 잠깐 보여준 뒤
  show("s-gen");
  try {
    // 2) 대화를 화면 뒤에서 조용히 그림 설명으로 정리 (사용자에게 안 보임)
    const summaryMsgs = chatMessages.filter(m => m.role !== "system").concat([
      { role: "user", content: "Based on what we talked about, describe the picture to draw in one detailed English paragraph. Output only the description sentences and nothing else." }
    ]);
    const desc = await apiChat(summaryMsgs, "describe");
    const url = await apiGenerate(desc);
    // 3) 곧바로 완성(QR) 화면으로
    renderResult(url);
  } catch (e) {
    chatMessages.push({ role: "assistant", content: t("chatFailMsg") });
    show("s-chat");
    renderChat(false);
  }
};

// ===================== 초기화 =====================
["introHero", "cardChatImg", "genPainter"].forEach(id => {
  const el = document.getElementById(id); if (el) raimiFallback(el);
});
applyTranslations();
buildLangMenu();
show("s-intro");

// ===================== 화면에 꽉 차게 자동 맞춤 =====================
// 고정 디자인(1340x800)을 기기 화면에 비율 유지하며 최대로 확대/축소 (스크롤 없음)
function fitScreen() {
  const el = document.getElementById("appScale");
  if (!el) return;
  const DW = 1340, DH = 800;
  const s = Math.min(window.innerWidth / DW, window.innerHeight / DH);
  const x = (window.innerWidth - DW * s) / 2;
  const y = (window.innerHeight - DH * s) / 2;
  el.style.transform = "translate(" + x + "px," + y + "px) scale(" + s + ")";
}
window.addEventListener("resize", fitScreen);
window.addEventListener("orientationchange", fitScreen);
fitScreen();

// ===================== PWA 서비스 워커 등록 =====================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
