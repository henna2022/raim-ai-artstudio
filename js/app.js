import { I18N } from "./i18n.js?v=13";
import { downloadXlsx } from "./xlsx-mini.js?v=2";
import { buildSnapshotSheets, buildMonthlyReportSheets, defaultReportMonth, buildExportSheets, buildPrintReportData, buildInsights } from "./report.js?v=6";
import { buildKpis } from "./dashboard-data.js?v=1";

// ===================== 설정 =====================
// 같은 도메인에 배포되면 그대로 두면 됩니다.
// 프론트엔드와 API가 다른 주소면 여기에 백엔드 주소를 넣으세요. 예: "https://my-app.vercel.app"
const API_BASE = "";
const RAIMI_IMG = "assets/raimi.png"; // 라이미 로봇 이미지 (이 위치에 png 파일을 넣어주세요)

// ===================== 관리자 대시보드 설정 =====================
// 관리자 통계(?admin) 진입 PIN. 필요하면 이 값만 바꾸면 됩니다.
// ⚠️ 이건 클라이언트 측 "소프트 게이트"일 뿐 진짜 보안이 아닙니다.
//    소스가 브라우저로 그대로 내려가므로 누구나 볼 수 있습니다(민감 데이터 보호용이 아니라
//    일반 관람객의 우발적 접근을 막는 용도). 실제 접근 제어는 서버(API)에서 해야 합니다.
const ADMIN_PIN = "4300";
// 앱 버전(앱 정보 카드·업데이트 내역에 표시). 시맨틱 버전.
const APP_VERSION = "2.0.0";
// 버전별 업데이트 내역 — 실제 진행한 작업만 기록(가짜 기능 금지). 최신이 위.
const CHANGELOG = [
  { version: "2.0.0", date: "2026-07", items: [
    "관리자 통계 화면 대시보드로 전면 개편(KPI·시간대별 차트·분석 인사이트)",
    "시간대별 그림 생성 수 막대 차트 추가(순수 SVG, 외부 라이브러리 없음)",
    "규칙 기반 분석 인사이트 카드 추가(최다/최저 월·요일·피크 시간대 등)",
    "관리자 PIN 소프트 게이트 추가",
    "앱 정보·버전별 업데이트 내역(아코디언) 추가",
  ] },
  { version: "1.4.0", date: "2026-07", items: [
    "인쇄용 보고서(브라우저 인쇄→PDF) 추가",
    "월간 보고서에 핵심 요약(규칙 기반 코멘트) 시트 추가",
  ] },
  { version: "1.3.0", date: "2026-07", items: [
    "원본 데이터 내보내기(생성기록·이벤트) 추가",
    "이용 퍼널(방문→모드선택→생성) 집계 추가",
  ] },
  { version: "1.2.0", date: "2026-06", items: [
    "요일별·시간대별 통계를 가동일 평균으로 정규화(운영일 편중 보정)",
    "월간 보고서(.xlsx) 및 12개월 개요 추가",
  ] },
  { version: "1.1.0", date: "2026-06", items: [
    "통계 집계 로직 리팩터링(KST 기준 일·주·월)",
    "방문·모드선택 이벤트 로깅 추가(개인정보 없음)",
  ] },
  { version: "1.0.0", date: "2026-06", items: [
    "라이미의 AI 그림 연구소 키오스크 첫 배포(블록·대화 모드)",
  ] },
];

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
let sessionId = crypto.randomUUID(); // 키오스크 "새 방문" 단위 — resetToStart()에서 재발급

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
  // 토글 버튼: 누르면 전환될 '반대' 언어를 표시 (한국어면 ENG, 영어면 한국어)
  document.getElementById("langCurrent").textContent = lang === "ko" ? "ENG" : "한국어";
}

// ===================== 언어 전환 (토글) =====================
function setLang(code) {
  if (!I18N[code]) return;
  lang = code;
  localStorage.setItem("raimi-lang", code);
  applyTranslations();
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
// 한국어 ↔ 영어 토글
document.getElementById("langBtn").onclick = () => setLang(lang === "ko" ? "en" : "ko");

// ===================== 화면 전환 =====================
function show(id) {
  currentScreen = id;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("on"));
  document.getElementById(id).classList.add("on");
  document.getElementById("homeBtn").style.display = (id === "s-intro") ? "none" : "block";
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
// 유휴 리셋(onIdle)도 실제 초기화 시 이 함수를 거치므로, 세션 재발급 지점은 여기 하나로 충분하다.
function resetToStart() {
  closeConfirm();
  picks = {}; stepIdx = 0; extraMode = false; selectedTweaks = []; chatMessages = [];
  currentImageUrl = null; stopGenAnim();
  sessionId = crypto.randomUUID(); // '처음으로' 확정 = 새 방문 단위
  show("s-intro");
}

// ===================== 이벤트 로깅 (방문·모드선택 — 개인정보 없음) =====================
// 절대 await로 UI를 막지 않는다: sendBeacon 우선, 실패 시 fetch(keepalive) 폴백. 둘 다 실패해도 무시.
function logEvent(type, extra) {
  try {
    const payload = JSON.stringify({ session_id: sessionId, type, ...extra });
    const url = API_BASE + "/api/log";
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }))) {
      return;
    }
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true })
      .catch(() => {});
  } catch (_) { /* 로깅 실패가 UX를 막으면 안 됨 */ }
}

// ===================== '처음으로' 확인 모달 =====================
// 진행 중(블록 선택·대화·그림 생성)일 때 처음으로를 누르면 한 번 확인
const CONFIRM_SCREENS = ["s-blocks", "s-chat", "s-gen"];
function openConfirm() {
  const m = document.getElementById("confirmModal");
  m.classList.add("open"); m.setAttribute("aria-hidden", "false");
}
function closeConfirm() {
  const m = document.getElementById("confirmModal");
  if (m) { m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }
}
function onHomeClick() {
  if (CONFIRM_SCREENS.includes(currentScreen)) openConfirm(); // 진행 중이면 확인 창
  else resetToStart();                                        // 아니면 바로 처음으로
}
document.getElementById("homeBtn").onclick = onHomeClick;
document.getElementById("confirmOk").onclick = resetToStart;     // 확인 → 처음으로(모달도 닫힘)
document.getElementById("confirmCancel").onclick = closeConfirm; // 취소 → 계속 진행
// 어두운 배경(모달 바깥)을 누르면 취소
document.getElementById("confirmModal").addEventListener("click", e => {
  if (e.target.id === "confirmModal") closeConfirm();
});
document.getElementById("introStart").onclick = () => show("s-home");

// ===================== 모드 선택 =====================
document.querySelectorAll(".bigCard").forEach(b => {
  b.onclick = () => {
    logEvent("mode_select", { mode: b.dataset.mode, lang });
    if (b.dataset.mode === "blocks") { picks = {}; stepIdx = 0; extraMode = false; renderBlockStep(); show("s-blocks"); }
    else { startChat(); show("s-chat"); }
  };
});

// ===================== API 호출 =====================
async function apiGenerate(prompt, mode) {
  const r = await fetch(API_BASE + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, mode, session_id: sessionId, lang })
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
    const url = await apiGenerate(prompt, "blocks");
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
const MAX_CHAT_TURNS = 8; // 질의응답 최대 횟수 (이후 자동으로 그림 생성)
let chatBusy = false;      // 요청 중 중복 전송 방지
function userTurnCount() { return chatMessages.filter(m => m.role === "user").length; }
function setChatEnabled(on) {
  ["chatInput", "chatSend", "chatFinish"].forEach(id => {
    const el = document.getElementById(id); if (el) el.disabled = !on;
  });
}
function startChat() {
  chatMessages = [{ role: "assistant", content: t("chatGreeting") }];
  chatBusy = false;
  renderChat();
  setChatEnabled(true);
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
  if (chatBusy) return;
  if (userTurnCount() >= MAX_CHAT_TURNS) return; // 이미 한도 도달
  const inp = document.getElementById("chatInput");
  const text = inp.value.trim(); if (!text) return;
  inp.value = "";
  chatMessages.push({ role: "user", content: text });
  renderChat(true);
  chatBusy = true; setChatEnabled(false);
  try {
    const reply = await apiChat(chatMessages.filter(m => m.role !== "system"));
    chatMessages.push({ role: "assistant", content: reply });
  } catch (e) {
    chatMessages.push({ role: "assistant", content: t("chatError") });
  }
  chatBusy = false;
  renderChat(false);
  // 질의응답 8번을 채우면 입력을 막고 자동으로 그림 생성
  if (userTurnCount() >= MAX_CHAT_TURNS) {
    setChatEnabled(false);
    await new Promise(r => setTimeout(r, 800));
    finishChat(true);
  } else {
    setChatEnabled(true);
  }
}
async function finishChat(autoForced) {
  if (chatBusy) return;
  chatBusy = true; setChatEnabled(false);
  // 1) 라이미가 마무리 인사 (프롬프트는 절대 보여주지 않음)
  chatMessages.push({ role: "assistant", content: t(autoForced ? "chatAutoFinishMsg" : "chatFinishMsg") });
  renderChat(false);
  await new Promise(r => setTimeout(r, 900)); // 인사를 잠깐 보여준 뒤
  show("s-gen");
  try {
    // 2) 대화를 화면 뒤에서 조용히 그림 설명으로 정리 (사용자에게 안 보임)
    const summaryMsgs = chatMessages.filter(m => m.role !== "system").concat([
      { role: "user", content: "Based on what we talked about, describe the picture to draw in one detailed English paragraph. Output only the description sentences and nothing else." }
    ]);
    const desc = await apiChat(summaryMsgs, "describe");
    const url = await apiGenerate(desc, "chat");
    // 3) 곧바로 완성(QR) 화면으로
    renderResult(url);
  } catch (e) {
    chatMessages.push({ role: "assistant", content: t("chatFailMsg") });
    show("s-chat");
    renderChat(false);
    setChatEnabled(true);
  } finally {
    chatBusy = false;
  }
}
document.getElementById("chatSend").onclick = sendChat;
document.getElementById("chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendChat(); }
});
document.getElementById("chatFinish").onclick = () => finishChat(false);

// ===================== 관리자 통계 (URL에 ?admin 또는 #admin) =====================
function isAdminMode() {
  return /\badmin\b/.test(location.search) || location.hash.replace("#", "") === "admin";
}
// ?admin 진입 → PIN 게이트(세션 내 1회) 통과 후 대시보드 로드
async function showAdmin() {
  show("s-admin");
  if (sessionStorage.getItem("raimi-admin-ok") === "1") {
    loadAdminDashboard();
  } else {
    renderAdminGate();
  }
}

// PIN 게이트 화면(터치 키패드). 통과하면 sessionStorage에 표시해 세션 동안 재입력 없음.
function renderAdminGate() {
  const el = document.getElementById("s-admin");
  el.innerHTML =
    '<div class="adminGate fadeUp"><div class="gateCard" id="gateCard">' +
      '<div class="gateTitle">🔒 관리자 통계</div>' +
      '<div class="gateSub">PIN 4자리를 입력하세요</div>' +
      '<div class="gateDots" id="gateDots"></div>' +
      '<div class="gateErr" id="gateErr"></div>' +
      '<div class="gateKeys" id="gateKeys"></div>' +
    '</div></div>';
  let buf = "";
  const dots = document.getElementById("gateDots");
  const err = document.getElementById("gateErr");
  const card = document.getElementById("gateCard");
  const drawDots = () => {
    dots.innerHTML = [0, 1, 2, 3].map(i => '<i class="' + (i < buf.length ? "on" : "") + '"></i>').join("");
  };
  drawDots();
  const check = () => {
    if (buf === ADMIN_PIN) {
      sessionStorage.setItem("raimi-admin-ok", "1");
      loadAdminDashboard();
    } else {
      err.textContent = "PIN이 올바르지 않아요.";
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      buf = ""; drawDots();
    }
  };
  const press = (d) => {
    err.textContent = "";
    if (buf.length < 4) { buf += d; drawDots(); }
    if (buf.length === 4) setTimeout(check, 120);
  };
  const keys = document.getElementById("gateKeys");
  const layout = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  keys.innerHTML = layout.map(k =>
    k === "clear" ? '<button class="gateKey ghost" data-k="clear">지움</button>'
    : k === "back" ? '<button class="gateKey ghost" data-k="back">←</button>'
    : '<button class="gateKey" data-k="' + k + '">' + k + '</button>'
  ).join("");
  keys.querySelectorAll(".gateKey").forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === "clear") { buf = ""; err.textContent = ""; drawDots(); }
    else if (k === "back") { buf = buf.slice(0, -1); err.textContent = ""; drawDots(); }
    else press(k);
  });
}

async function loadAdminDashboard() {
  const el = document.getElementById("s-admin");
  el.innerHTML = '<div class="fadeUp center" style="padding-top:80px"><p class="adminMsg">불러오는 중...</p></div>';
  try {
    const r = await fetch(API_BASE + "/api/stats");
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || "통계를 불러오지 못했어요.");
    renderAdmin(s);
  } catch (e) {
    el.innerHTML =
      '<div class="fadeUp center" style="padding-top:80px"><p class="adminMsg">오류: ' + e.message + '</p>' +
      '<div class="exportBtns" style="justify-content:center;margin-top:16px"><button class="pillBtn" id="adminRetry">🔄 다시 시도</button></div></div>';
    const b = document.getElementById("adminRetry");
    if (b) b.onclick = loadAdminDashboard;
  }
}

let adminStats = null;
let exportPeriod = "daily";        // 설정/내보내기 세그먼트: daily | weekly | monthly
let adminInsights = [];            // buildInsights 결과(규칙 기반 문자열들)
let adminInsightIdx = 0;

// 증감 % → 색상 알약. null/undefined면 중립 "—".
function kpiDelta(pct) {
  if (pct === null || pct === undefined) return '<span class="kpiDelta flat">—</span>';
  if (pct > 0) return '<span class="kpiDelta up">▲ ' + pct + '%</span>';
  if (pct < 0) return '<span class="kpiDelta down">▼ ' + Math.abs(pct) + '%</span>';
  return '<span class="kpiDelta flat">0%</span>';
}
const kpiVal = (v) => (v === null || v === undefined) ? "—" : v;

// y축 눈금 간격을 "보기 좋은 정수"로 (막대 최대값 / 4 이상). 라벨이 정수로 떨어지게.
function niceStep(maxCount) {
  const raw = Math.max(1, Math.ceil(maxCount / 4));
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}
// 시간대별(0~23시) 그림 생성 수 — 순수 인라인 SVG 막대 차트(외부 라이브러리 없음).
// y축 눈금 + 점선 그리드 + x축 시각 라벨(2시간 간격) + 블루 그라데이션 막대 + hover 툴팁(<title>).
function hourlyChartSVG(hourly) {
  const data = Array.isArray(hourly) ? hourly : [];
  if (!data.length) return '<p class="adminMsg">아직 기록이 없어요.</p>';
  const W = 1040, H = 280, padL = 46, padR = 16, padT = 14, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = data.length;
  const maxCount = Math.max(1, ...data.map(d => d.count));
  const step = niceStep(maxCount), niceMax = step * 4, ticks = 4;
  let grid = "";
  for (let i = 0; i <= ticks; i++) {
    const val = step * i;
    const y = padT + plotH - (plotH * i / ticks);
    grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="gridLine"/>';
    grid += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" class="yLabel">' + val + '</text>';
  }
  const bandW = plotW / n;
  const barW = Math.min(26, bandW * 0.62);
  let bars = "";
  data.forEach((d, i) => {
    const x = padL + bandW * i + (bandW - barW) / 2;
    const h = (d.count / niceMax) * plotH;
    const y = padT + plotH - h;
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) +
      '" height="' + Math.max(0, h).toFixed(1) + '" rx="4" class="hBar">' +
      '<title>' + d.label + ' · ' + d.count + '건 (' + d.share + '%)</title></rect>';
    if (i % 2 === 0) {
      bars += '<text x="' + (padL + bandW * i + bandW / 2).toFixed(1) + '" y="' + (H - 12) + '" class="xLabel">' + i + '</text>';
    }
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hChart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="시간대별 그림 생성 수">' +
    '<defs><linearGradient id="hBarGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#7ea8ff"/><stop offset="1" stop-color="#5182f0"/></linearGradient></defs>' +
    grid + bars + '</svg>';
}

function renderInsight() {
  const box = document.getElementById("insightText");
  if (!box) return;
  box.textContent = adminInsights.length ? adminInsights[adminInsightIdx % adminInsights.length] : "데이터 누적 중";
}

// 설정/내보내기 세그먼트 상태 반영(활성 탭·월 select 표시·캡션·엑셀 버튼 라벨)
function syncExport() {
  document.querySelectorAll(".segBtn").forEach(b => b.classList.toggle("active", b.dataset.period === exportPeriod));
  const rm = document.getElementById("reportMonth");
  const hasMonths = rm && rm.dataset.has === "1";
  if (rm) rm.style.display = (exportPeriod === "monthly" && hasMonths) ? "" : "none";
  const cap = document.getElementById("exportCaption");
  if (cap) {
    if (exportPeriod === "daily") cap.textContent = "기준: 오늘 (" + kstYmd() + ", KST)";
    else if (exportPeriod === "weekly") cap.textContent = "기준: 이번 주 · 월~일 (KST)";
    else {
      const lbl = rm && rm.selectedOptions[0] ? rm.selectedOptions[0].textContent : "—";
      cap.textContent = "대상 월: " + lbl;
    }
  }
  const xb = document.getElementById("exportExcel");
  if (xb) xb.textContent = exportPeriod === "monthly" ? "📄 월간 보고서 (.xlsx)" : "📊 통계 (.xlsx)";
}
// 엑셀 출력: 일별/주별은 스냅샷, 월별은 월간 보고서
function doExcel() {
  if (exportPeriod === "monthly") exportMonthlyReport();
  else exportAdminXlsx();
}

function renderAdmin(s) {
  adminStats = s;
  exportPeriod = "daily";
  const el = document.getElementById("s-admin");
  const report = s.report || [];
  const nowMonth = kstYmd().slice(0, 7);

  // KPI (buildKpis 순수 함수)
  const k = buildKpis(s, kstYmd());
  const kpiCard = (lbl, val, delta, sub) =>
    '<div class="kpiCard"><div class="kpiLbl">' + lbl + '</div>' +
    '<div class="kpiValRow"><span class="kpiVal">' + kpiVal(val) + '</span>' + kpiDelta(delta) + '</div>' +
    '<div class="kpiSub">' + sub + '</div></div>';

  // 분석 인사이트 (규칙 기반 buildInsights — 외부 AI 미사용)
  adminInsights = buildInsights(s, defaultReportMonth(report, kstYmd()), nowMonth) || [];
  adminInsightIdx = 0;
  const showMore = adminInsights.length > 1;

  // 세그먼트 탭
  const seg = [["daily", "일별"], ["weekly", "주별"], ["monthly", "월별"]].map(([id, t]) =>
    '<button class="segBtn' + (id === "daily" ? " active" : "") + '" data-period="' + id + '">' + t + '</button>'
  ).join("");

  // 업데이트 내역 아코디언(첫 항목 기본 펼침)
  const changelog = CHANGELOG.map((c, i) =>
    '<div class="logItem' + (i === 0 ? " open" : "") + '">' +
      '<button class="logHead" data-i="' + i + '"><span class="logVer">v' + c.version + '</span>' +
      '<span class="logDate">' + c.date + '</span><span class="logCaret">▾</span></button>' +
      '<ul class="logBody">' + c.items.map(it => "<li>" + it + "</li>").join("") + '</ul>' +
    '</div>'
  ).join("");

  el.innerHTML =
    '<div class="dash fadeUp">' +
      '<div class="dashHead">' +
        '<div class="dashTitle">AI 그림 연구소 이용자 통계</div>' +
        '<div class="dashSub">서울 로봇인공지능과학관 · 라이미의 AI 그림 연구소</div>' +
      '</div>' +

      '<div class="kpiRow">' +
        kpiCard("오늘 이용자수", k.todayVisits, k.vsYesterdayPct, "어제 대비") +
        kpiCard("이번 주 이용자수", k.thisWeekVisits, k.vsLastWeekPct, "지난주 같은 시점 대비") +
        kpiCard("오늘 그림 생성 수", k.todayGen, k.vsYesterdayGenPct, "어제 대비") +
      '</div>' +

      '<div class="dashCard"><div class="dashCardTitle">시간대별 그림 생성 수 (한국시간)</div>' +
        hourlyChartSVG(s.hourly) + '</div>' +

      '<div class="insightCard"><div class="insightHead">✨ 분석 인사이트</div>' +
        '<div class="insightText" id="insightText"></div>' +
        (showMore ? '<button class="insightMore" id="insightMore">다른 인사이트 →</button>' : "") +
      '</div>' +

      '<div class="dashCard"><div class="dashCardTitle">설정 · 내보내기</div>' +
        '<div class="segRow">' + seg + '</div>' +
        '<div><select class="reportMonthSelect" id="reportMonth"></select></div>' +
        '<div class="exportCaption" id="exportCaption"></div>' +
        '<div class="exportBtns">' +
          '<button class="pillBtn" id="exportExcel">📊 통계 (.xlsx)</button>' +
          '<button class="pillBtn cyan" id="exportPdf">🖨 PDF (인쇄용 보고서)</button>' +
          '<button class="pillBtn ghost" id="exportRaw">🗂 원본 데이터</button>' +
          '<button class="pillBtn ghost" id="exportRefresh">🔄 새로고침</button>' +
        '</div>' +
      '</div>' +

      '<div class="infoRow">' +
        '<div class="dashCard"><div class="dashCardTitle">앱 정보</div>' +
          '<div class="infoLine">버전 <span class="verPill">v' + APP_VERSION + '</span></div>' +
          '<div class="infoLine">개발 이주원 (Juwon Lee)</div>' +
          '<div class="infoLine">서울 로봇인공지능과학관</div>' +
        '</div>' +
        '<div class="dashCard"><div class="dashCardTitle">업데이트 내역</div>' + changelog + '</div>' +
      '</div>' +
    '</div>';

  // 대상 월 select — report[] 최신순, 기본값 defaultReportMonth
  const rm = document.getElementById("reportMonth");
  if (rm) {
    if (!report.length) {
      rm.dataset.has = "0";
    } else {
      rm.dataset.has = "1";
      rm.innerHTML = report.slice().reverse().map((m) =>
        '<option value="' + m.month + '">' + m.monthLabel + (m.month === nowMonth ? " (진행 중)" : "") + '</option>'
      ).join("");
      const def = defaultReportMonth(report, kstYmd());
      if (def) rm.value = def;
    }
    rm.onchange = syncExport;
  }

  // 배선
  renderInsight();
  const moreB = document.getElementById("insightMore");
  if (moreB) moreB.onclick = () => { adminInsightIdx++; renderInsight(); };
  document.querySelectorAll(".segBtn").forEach(b =>
    b.onclick = () => { exportPeriod = b.dataset.period; syncExport(); });
  const xb = document.getElementById("exportExcel"); if (xb) xb.onclick = doExcel;
  const pb = document.getElementById("exportPdf"); if (pb) pb.onclick = () => renderPrintReport();
  const rawB = document.getElementById("exportRaw"); if (rawB) rawB.onclick = exportRawData;
  const rfB = document.getElementById("exportRefresh"); if (rfB) rfB.onclick = loadAdminDashboard;
  el.querySelectorAll(".logHead").forEach(h =>
    h.onclick = () => h.parentElement.classList.toggle("open"));

  syncExport();
}

// 한국시간 기준 타임스탬프/날짜 (파일명·표시용)
function kstStamp() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function kstYmd() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// 현재 통계 스냅샷을 엑셀로 — 화면에 보이는 기간별 요약 + 일/주/월 표
function exportAdminXlsx() {
  if (!adminStats) return;
  downloadXlsx("라이미-통계_" + kstYmd() + ".xlsx", buildSnapshotSheets(adminStats, kstStamp()));
}

// 월간 보고서(.xlsx) — 대상 월(select#reportMonth) 하나를 골라 그 달의 상세 + 12개월 개요
function exportMonthlyReport() {
  if (!adminStats) return;
  const rm = document.getElementById("reportMonth");
  const targetMonth = (rm && rm.value) || defaultReportMonth(adminStats.report || [], kstYmd());
  if (!targetMonth) return; // 표시할 달이 없음(report 비어 있음)
  downloadXlsx("라이미-월간보고서_" + targetMonth + ".xlsx", buildMonthlyReportSheets(adminStats, kstYmd(), targetMonth, kstStamp()));
}

// 원본 데이터(.xlsx) — /api/export에서 12개월치 생성기록(+이벤트)을 받아 그대로 시트로
async function exportRawData() {
  try {
    const r = await fetch(API_BASE + "/api/export");
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "원본 데이터를 불러오지 못했어요.");
    downloadXlsx("라이미-원본_" + kstYmd() + ".xlsx", buildExportSheets(data));
  } catch (e) {
    alert("오류: " + e.message); // 관리자 전용 화면(?admin) — 별도 에러 UI 없이 alert로 충분
  }
}

// 홈 화면에 설치된 standalone PWA인지(iPad standalone에서는 print가 동작하지 않을 수 있음)
function isStandalonePWA() {
  return (typeof navigator !== "undefined" && navigator.standalone === true) ||
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
}

// 요일별/시간대별과 동일한 막대 UI(.adminBarRow 재사용) — 인쇄 보고서 전용, valueOf 기준으로 정규화
function printBarRows(data, valueOf, numText) {
  const list = data || [];
  const max = Math.max(1, ...list.map(valueOf));
  return list.map((d) =>
    '<div class="adminBarRow"><span class="adminBarDay">' + d.label + '</span>' +
    '<span class="adminBar" style="width:' + Math.round((valueOf(d) / max) * 100) + '%"></span>' +
    '<span class="adminBarNum">' + numText(d) + '</span></div>'
  ).join("") || '<p class="adminMsg">아직 기록이 없어요.</p>';
}

// 인쇄용 보고서(.xlsx 대신 브라우저 인쇄 → PDF 저장). 대상 월 선택(select#reportMonth)·핵심 요약
// 문장(buildInsights)을 buildPrintReportData로 그대로 재사용 — 새 로직 없음.
function renderPrintReport(targetMonth) {
  if (!adminStats) return;
  const rm = document.getElementById("reportMonth");
  const tm = targetMonth !== undefined ? targetMonth : ((rm && rm.value) || null);
  const data = buildPrintReportData(adminStats, kstYmd(), tm);
  const el = document.getElementById("s-admin");

  if (isStandalonePWA()) {
    el.innerHTML =
      '<div class="fadeUp center"><h2 class="reviewH2">🖨 인쇄용 보고서</h2>' +
      '<p class="adminMsg">데스크톱 브라우저에서 열어 주세요.</p>' +
      '<div class="adminBtns noPrint"><button class="actionBtn secondary" id="printBack">← 돌아가기</button></div></div>';
    document.getElementById("printBack").onclick = () => renderAdmin(adminStats);
    return;
  }

  const card = (n, l) => '<div class="adminCard"><div class="adminNum">' + (n ?? 0) + '</div><div class="adminLbl">' + l + '</div></div>';
  el.innerHTML =
    '<div class="printReport fadeUp">' +
      '<h2 class="reviewH2">라이미의 AI 그림 연구소 — ' + data.targetLabel + ' 보고서</h2>' +
      '<p class="printPeriod">데이터 범위: ' + (data.dataRange || "—") + '</p>' +
      '<div class="adminCards">' +
        card(data.total, "총 생성") + card(data.activeDays, "가동일수") + card(data.avgActive, "가동일 평균") +
      '</div>' +
      '<h3 class="adminH3">월별 추이</h3>' +
      '<div class="adminDaily">' + printBarRows(data.monthlyTrend, (d) => d.count, (d) => d.count) + '</div>' +
      '<h3 class="adminH3">요일별(가동일 평균)</h3>' +
      '<div class="adminDaily">' + printBarRows(data.weekday, (d) => d.avg, (d) => "평균 " + d.avg + " (총 " + d.count + ")") + '</div>' +
      '<h3 class="adminH3">시간대별</h3>' +
      '<div class="adminDaily">' + printBarRows(data.hourly, (d) => d.count, (d) => d.count) + '</div>' +
      '<h3 class="adminH3">핵심 요약</h3>' +
      '<ul class="printInsights">' + data.insights.map((t) => "<li>" + t + "</li>").join("") + '</ul>' +
      '<div class="adminBtns noPrint"><button class="actionBtn secondary" id="printBack">← 돌아가기</button></div>' +
    '</div>';
  document.getElementById("printBack").onclick = () => renderAdmin(adminStats);
  // DOM이 실제로 페인트된 뒤 인쇄 다이얼로그를 띄운다(innerHTML 대입 직후 동기 호출 시 빈 화면이 찍힐 수 있음)
  requestAnimationFrame(() => window.print());
}

// ===================== 초기화 =====================
["introHero", "cardChatImg", "genPainter"].forEach(id => {
  const el = document.getElementById(id); if (el) raimiFallback(el);
});
applyTranslations();
if (isAdminMode()) {
  showAdmin();
} else {
  logEvent("visit", { lang }); // 키오스크 방문 1회(관리자 화면 접속은 방문 집계에서 제외)
  show("s-intro");
}

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

// ===================== 3분간 터치가 없으면 처음 화면으로 =====================
const IDLE_MS = 3 * 60 * 1000; // 3분
let idleTimer = null;
function onIdle() {
  // 이미 처음 화면이거나 그림 생성 중·관리자 화면이면 초기화하지 말고 다시 대기
  if (currentScreen === "s-intro" || currentScreen === "s-gen" || isAdminMode()) {
    resetIdleTimer();
    return;
  }
  resetToStart(); // 맨 처음(라이미 소개) 화면으로 완전 초기화
}
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(onIdle, IDLE_MS);
}
["pointerdown", "touchstart", "mousedown", "keydown"].forEach(ev =>
  window.addEventListener(ev, resetIdleTimer, { passive: true }));
resetIdleTimer();
