import { I18N, LANGS } from "./i18n.js";

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
let selectedTweaks = [];
let lastPrompt = "";
let chatMessages = [];
let currentImageUrl = null;
let lastReview = { url: null, err: null };

// ===================== 번역 도우미 =====================
function t(key) { return I18N[lang][key]; }
function steps() { return I18N[lang].STEPS; }
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
  const cur = LANGS.find(l => l.code === lang);
  document.getElementById("langCurrent").textContent = cur ? cur.label : lang;
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
}
function goHome() {
  picks = {}; stepIdx = 0; selectedTweaks = []; chatMessages = []; show("s-home");
}
document.getElementById("homeBtn").onclick = goHome;
document.getElementById("introStart").onclick = () => show("s-home");

// ===================== 모드 선택 =====================
document.querySelectorAll(".bigCard").forEach(b => {
  b.onclick = () => {
    if (b.dataset.mode === "blocks") { picks = {}; stepIdx = 0; renderBlockStep(); show("s-blocks"); }
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
async function apiChat(messages) {
  const r = await fetch(API_BASE + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, lang })
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "대화 실패"); }
  return (await r.json()).reply;
}

// ===================== 블록 플로우 =====================
function renderProgress() {
  const row = document.getElementById("progressRow"); row.innerHTML = "";
  steps().forEach((s, i) => {
    const d = document.createElement("span");
    d.className = "dot" + (i === stepIdx ? " active" : i < stepIdx ? " done" : "");
    row.appendChild(d);
  });
  document.getElementById("stepLabel").textContent = (stepIdx + 1) + " / " + steps().length;
}
function renderBlockStep() {
  renderProgress();
  const step = steps()[stepIdx];
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
      if (stepIdx < steps().length - 1) { stepIdx++; renderBlockStep(); }
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
function buildPrompt(extra) {
  const base = steps().map(s => picks[s.key]).filter(Boolean).join(", ");
  const ex = (extra && extra.length) ? " / " + extra.join(", ") + "." : "";
  return base + "." + ex;
}

// ===================== 생성 + 리뷰 =====================
async function runGenerate(prompt) {
  lastPrompt = prompt;
  show("s-gen");
  try {
    const url = await apiGenerate(prompt);
    renderReview(url, null);
  } catch (e) {
    renderReview(null, e.message);
  }
}
function renderReview(url, err) {
  currentImageUrl = url;
  lastReview = { url, err };
  const s = document.getElementById("s-review");
  let html = '<div class="fadeUp center"><h2 class="reviewH2">' + t("reviewH2") + "</h2>";
  if (err) { html += '<div class="errBox">' + fill(t("reviewErr"), { err }) + "</div>"; }
  else { html += '<div class="artFrame"><img src="' + url + '" alt="art"></div>'; }
  html += '<p class="reviewP">' + t("reviewP") + '</p><div class="tweakGrid" id="tweakGrid"></div>';
  html += '<div class="btnRow" id="reviewBtns"></div></div>';
  s.innerHTML = html;

  const grid = document.getElementById("tweakGrid");
  selectedTweaks = [];
  tweaks().forEach(([label, value]) => {
    const c = document.createElement("button"); c.className = "tweakChip"; c.textContent = "+ " + label;
    c.onclick = () => {
      const i = selectedTweaks.indexOf(value);
      if (i >= 0) { selectedTweaks.splice(i, 1); c.classList.remove("on"); c.textContent = "+ " + label; }
      else { selectedTweaks.push(value); c.classList.add("on"); c.textContent = "✓ " + label; }
      renderReviewButtons();
    };
    grid.appendChild(c);
  });
  renderReviewButtons();
  show("s-review");
}
function renderReviewButtons() {
  const row = document.getElementById("reviewBtns"); if (!row) return;
  row.innerHTML = "";
  if (selectedTweaks.length > 0) {
    const fix = document.createElement("button"); fix.className = "actionBtn secondary";
    fix.textContent = fill(t("reviewFix"), { n: selectedTweaks.length });
    fix.onclick = () => runGenerate(buildPrompt(selectedTweaks.slice()));
    row.appendChild(fix);
  }
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
    b.textContent = m.content; row.appendChild(b);
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
    const desc = await apiChat(summaryMsgs);
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
