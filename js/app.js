import { I18N } from "./i18n.js?v=38";
import { downloadXlsx } from "./xlsx-mini.js?v=38";
import { buildSnapshotSheets, buildMonthlyReportSheets, defaultReportMonth, buildExportSheets, buildPrintReportData, buildInsights } from "./report.js?v=38";
import { buildKpis } from "./dashboard-data.js?v=38";
import { qrSvg } from "./qr-mini.js?v=38";

// ===================== 설정 =====================
// 같은 도메인에 배포되면 그대로 두면 됩니다.
// 프론트엔드와 API가 다른 주소면 여기에 백엔드 주소를 넣으세요. 예: "https://my-app.vercel.app"
const API_BASE = "";
const RAIMI_IMG = "assets/raimi.png"; // 라이미 로봇 이미지 (이 위치에 png 파일을 넣어주세요)

// ===================== 관리자 대시보드 설정 =====================
// 관리자 통계(?admin) 진입 PIN의 진위 판정은 서버(api/_auth.js의 checkAdminKey, ADMIN_KEY
// 환경변수)가 한다(R4). 여기 클라이언트에는 PIN 값을 두지 않는다 — 입력한 4자리를
// sessionStorage["raimi-admin-key"]에 저장해두고 /api/stats·/api/export 호출 시 x-admin-key
// 헤더로 실어 보낼 뿐이며, 서버가 401을 주면 그 값을 지우고 게이트로 되돌아간다.
// (공용 기기이므로 localStorage가 아니라 sessionStorage — 탭을 닫으면 자동 만료.)
const ADMIN_KEY_STORAGE = "raimi-admin-key";
// 앱 버전(앱 정보 카드·업데이트 내역에 표시). 시맨틱 버전.
const APP_VERSION = "2.2.0";
// 버전별 업데이트 내역 — 실제 진행한 작업만 기록(가짜 기능 금지). 최신이 위.
const CHANGELOG = [
  { version: "2.2.0", date: "2026-07", items: [
    "일별 차트 기간 선택 추가(최근 기록일·최근 30일·월 전체) — 빈 날은 0으로 채워 달력대로 표시",
  ] },
  { version: "2.1.0", date: "2026-07", items: [
    "그림 생성 수 차트에 일별·주별·월별 전환 탭 추가",
  ] },
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
let genBusy = false;   // runGenerate 중복 실행 가드(연타 방지) — renderResult/renderReview 도달 시 해제
let genWatchdog = null; // s-gen 워치독 타이머(runGenerate 진입 시 90초로 설정) — show()에서 항상 해제
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
// HTML 이스케이프: 5종 특수문자 치환 (& < > " ')
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// 문자열 템플릿 치환: {key} → vars.key (vars의 값은 HTML 이스케이프)
function fill(str, vars) { return str.replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars) ? escHtml(vars[k]) : ""); }

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
function clearGenWatchdog() {
  if (genWatchdog) { clearTimeout(genWatchdog); genWatchdog = null; }
}
function show(id) {
  currentScreen = id;
  // s-gen 워치독은 화면이 바뀌는 순간 반드시 해제한다 — 결과/리뷰 화면으로 넘어간 뒤
  // 뒤늦게 워치독이 발화해 화면을 덮어써버리는 오발사를 막는다(runGenerate가 필요하면 다시 건다).
  clearGenWatchdog();
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
      .catch((err) => { console.error("logEvent fetch failed:", err); });
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
// 네트워크가 응답을 안 주면(끊김·불안정 와이파이) fetch가 영원히 안 끝나 스피너에 갇힐 수 있다.
// AbortController로 클라 쪽 타임아웃을 걸고, 타임아웃 시 아이가 이해할 수 있는 문구(t("errTimeout"))로
// throw한다 — 호출부(runGenerate/sendChat/finishChat)의 기존 catch가 그대로 복구 경로가 된다.
async function apiGenerate(prompt, mode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  let r;
  try {
    r = await fetch(API_BASE + "/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode, session_id: sessionId, lang }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(t("errTimeout"));
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) { const e = await r.json().catch((err) => { console.error("apiGenerate JSON parse failed:", err); return {}; }); throw new Error(e.error || "생성 실패"); }
  return (await r.json()).url;
}
async function apiChat(messages, mode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let r;
  try {
    r = await fetch(API_BASE + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // session_id를 보내야 서버(R2)가 챗 버스트 한도를 세션 단위로 걸 수 있다(안 보내면 'global' 하나로 묶임).
      body: JSON.stringify({ messages, lang, mode, session_id: sessionId }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(t("errTimeout"));
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) { const e = await r.json().catch((err) => { console.error("apiChat JSON parse failed:", err); return {}; }); throw new Error(e.error || "대화 실패"); }
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
// 중복 실행 가드: 옵션 연타(renderBlockStep)·"이대로 그리기"(renderMoreChoice)·"다시 만들기"
// (renderReviewButtons retry)가 모두 이 함수를 호출한다 — genBusy 하나로 전부 막는다.
async function runGenerate(prompt) {
  if (genBusy) return; // 이미 생성 중이면 재진입 무시(중복 과금 방지)
  genBusy = true;
  lastPrompt = prompt;
  show("s-gen");
  // s-gen 워치독: 90초가 지나도 여전히 s-gen 화면이면(apiGenerate의 70초 타임아웃보다도
  // 더 걸린 이례적 상황 포함) 강제로 리뷰(에러) 화면으로 탈출시켜 재시도 버튼을 노출한다.
  genWatchdog = setTimeout(() => {
    genWatchdog = null;
    if (currentScreen === "s-gen") renderReview(null, t("errTimeout"));
  }, 90000);
  try {
    const url = await apiGenerate(prompt, "blocks");
    renderResult(url); // 리뷰 단계 없이 바로 결과(이미지+QR) 화면으로
  } catch (e) {
    renderReview(null, e.message); // 실패 시에만 리뷰 화면(에러+다시 시도)
  }
}
function renderReview(url, err) {
  genBusy = false; // runGenerate 도달 지점 — 재시도 버튼으로 다시 runGenerate를 부를 수 있어야 함
  currentImageUrl = url;
  lastReview = { url, err };
  const s = document.getElementById("s-review");
  let html = '<div class="fadeUp center"><h2 class="reviewH2">' + t("reviewH2") + "</h2>";
  if (err) { html += '<div class="errBox">' + fill(t("reviewErr"), { err }) + "</div>"; }
  else { html += '<div class="artFrame"><img src="' + escHtml(url) + '" alt="art"></div>'; }
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
// QR은 js/qr-mini.js로 로컬 생성(R8) — 외부 서비스(qrserver) 장애·오프라인에도 QR이 살아 있고,
// 생성물 URL을 제3자에 보내지 않는다. 만약 로컬 생성이 실패하면(예: URL이 비정상적으로 긺)
// 종전의 qrserver 폴백을 쓴다 — QR 없이 끝나는 것보다는 외부 의존이 낫다.
function qrSrc(url) {
  try {
    return "data:image/svg+xml;utf8," + encodeURIComponent(qrSvg(url));
  } catch (e) {
    console.error("로컬 QR 생성 실패, qrserver 폴백:", e?.message || e);
    return "https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=" + encodeURIComponent(url);
  }
}
function renderResult(url) {
  genBusy = false; // runGenerate 도달 지점(성공)
  currentImageUrl = url;
  const qr = qrSrc(url);
  const s = document.getElementById("s-result");
  s.innerHTML =
    '<div class="fadeUp center"><h2 class="reviewH2">' + t("resultH2") + "</h2>" +
    '<div class="resultLayout">' +
      '<div class="artFrame"><img src="' + escHtml(url) + '" alt="art"></div>' +
      '<div class="qrCard"><div class="qrTitle">' + t("qrTitle") + "</div>" +
      '<div class="qrDesc">' + t("qrDesc") + "</div>" +
      '<img class="qrImg" src="' + escHtml(qr) + '" alt="QR">' +
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
    // 실패: 방금 push한 user 메시지를 pop해 턴을 돌려주고, 입력창에 원문 복원
    chatMessages.pop();
    inp.value = text;
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
// ?admin 진입 → PIN 게이트(세션 내 1회) 통과 후 대시보드 로드.
// 진위 판정은 서버가 하므로(R4) 여기서는 "키를 들고 있는가"만 본다 — 실제로 맞는 키인지는
// loadAdminDashboard의 401 처리가 확인한다.
async function showAdmin() {
  show("s-admin");
  if (sessionStorage.getItem(ADMIN_KEY_STORAGE)) {
    loadAdminDashboard();
  } else {
    renderAdminGate();
  }
}

// x-admin-key 헤더를 실은 fetch 옵션(키가 없으면 헤더 생략).
function adminFetchOpts() {
  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  return key ? { headers: { "x-admin-key": key } } : undefined;
}

// 서버가 401(PIN 불일치)을 준 경우 공통 처리: 저장된 키를 지우고 게이트로 되돌아가
// "PIN이 올바르지 않아요" + shake를 보여준다(기존 gateErr·shake UX 재사용).
function adminGateReject() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  renderAdminGate();
  const err = document.getElementById("gateErr");
  const card = document.getElementById("gateCard");
  if (err) err.textContent = "PIN이 올바르지 않아요.";
  if (card) { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); }
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
  const drawDots = () => {
    dots.innerHTML = [0, 1, 2, 3].map(i => '<i class="' + (i < buf.length ? "on" : "") + '"></i>').join("");
  };
  drawDots();
  // 4자리를 입력하면 진위 확인 없이 일단 저장하고 서버(loadAdminDashboard)에 물어본다.
  // 틀렸으면 loadAdminDashboard가 401을 받아 adminGateReject()로 여기(게이트)로 되돌아온다.
  const check = () => {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, buf);
    loadAdminDashboard();
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
  const rfB = document.getElementById("exportRefresh");
  if (rfB) rfB.disabled = true; // 새로고침 버튼 비활성화
  el.innerHTML = '<div class="fadeUp center" style="padding-top:80px"><p class="adminMsg">불러오는 중...</p></div>';
  try {
    const r = await fetch(API_BASE + "/api/stats", adminFetchOpts());
    if (r.status === 401) { adminGateReject(); return; }
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || "통계를 불러오지 못했어요.");
    renderAdmin(s);
  } catch (e) {
    el.innerHTML =
      '<div class="fadeUp center" style="padding-top:80px"><p class="adminMsg">오류: ' + escHtml(e.message) + '</p>' +
      '<div class="exportBtns" style="justify-content:center;margin-top:16px"><button class="pillBtn" id="adminRetry">🔄 다시 시도</button></div></div>';
    const b = document.getElementById("adminRetry");
    if (b) b.onclick = loadAdminDashboard;
  } finally {
    const rfBFinal = document.getElementById("exportRefresh");
    if (rfBFinal) rfBFinal.disabled = false; // 새로고침 버튼 재활성화
  }
}

let adminStats = null;
let exportPeriod = "daily";        // 설정/내보내기 세그먼트: daily | weekly | monthly
let genPeriod = "daily";           // 생성 수 차트 세그먼트: daily | weekly | monthly (내보내기와 별개 상태)
let genDailyRange = "recent";      // 일별 차트 기간: recent(최근 기록일) | recent30(최근 30일) | 'YYYY-MM'(해당 월 전체)
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
// 막대 차트(순수 인라인 SVG, 외부 라이브러리 없음) — 시간대별·일별이 공유한다.
// y축 눈금 + 점선 그리드 + 그라데이션 막대 + x축 라벨(opts.xLabelFn). 막대엔 data-* 속성만 심고,
// hover/탭 툴팁은 wireBarCharts가 붙인다. data.share가 있으면 툴팁에 비율 줄이 추가된다.
// opts: { gradId, ariaLabel, xLabelFn(i,d)->라벨문자열|null }
function barChartSVG(data, opts) {
  const o = opts || {};
  const gradId = o.gradId || "barGrad";
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return '<p class="adminMsg">아직 기록이 없어요.</p>';
  const W = 1040, H = 280, padL = 46, padR = 16, padT = 14, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = rows.length;
  const maxCount = Math.max(1, ...rows.map(d => d.count));
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
  rows.forEach((d, i) => {
    const x = padL + bandW * i + (bandW - barW) / 2;
    const h = (d.count / niceMax) * plotH;
    const y = padT + plotH - h;
    const shareAttr = (d.share === undefined || d.share === null) ? "" : ' data-share="' + d.share + '"';
    // 툴팁 수치는 wireBarCharts가 data-* 를 읽어 표시한다(터치에서 안 뜨는 <title> 대신).
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) +
      '" height="' + Math.max(0, h).toFixed(1) + '" rx="4" class="hBar" fill="url(#' + gradId + ')"' +
      ' data-label="' + escHtml(d.label) + '" data-count="' + d.count + '"' + shareAttr + '/>';
    const xl = o.xLabelFn ? o.xLabelFn(i, d) : null;
    if (xl !== null && xl !== undefined && xl !== "") {
      bars += '<text x="' + (padL + bandW * i + bandW / 2).toFixed(1) + '" y="' + (H - 12) + '" class="xLabel">' + escHtml(String(xl)) + '</text>';
    }
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hChart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + escHtml(o.ariaLabel || "막대 차트") + '">' +
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#7ea8ff"/><stop offset="1" stop-color="#5182f0"/></linearGradient></defs>' +
    grid + bars + '</svg>';
}

// 시간대별(0~23시): x축은 2시간 간격의 시각 숫자, 툴팁엔 비율(share) 포함.
function hourlyChartSVG(hourly) {
  return barChartSVG(hourly, {
    gradId: "hBarGrad",
    ariaLabel: "시간대별 그림 생성 수",
    xLabelFn: (i) => (i % 2 === 0 ? String(i) : null),
  });
}

// 일별(최근 기록일): daily는 최신순 14개 활동일이라 그래프용으로 뒤집어 과거→현재로 놓는다.
// x축 라벨은 요일 없이 날짜(MM/DD)만, 막대가 많으면 한 칸 걸러 표시한다.
function dailyChartSVG(daily) {
  const arr = Array.isArray(daily) ? daily.slice().reverse() : [];
  const every = arr.length > 10 ? 2 : 1;
  return barChartSVG(arr, {
    gradId: "dBarGrad",
    ariaLabel: "일별 그림 생성 수",
    xLabelFn: (i, d) => (i % every === 0 ? String(d.label).split("(")[0] : null),
  });
}

// 주별(최근 기록 주): weekly는 최신순 12개 → 뒤집어 과거→현재.
// 라벨 "MM/DD~MM/DD"는 길어서 x축엔 주 시작일(월요일)만, 전체 범위는 툴팁(data-label)에 남긴다.
function weeklyChartSVG(weekly) {
  const arr = Array.isArray(weekly) ? weekly.slice().reverse() : [];
  return barChartSVG(arr, {
    gradId: "wBarGrad",
    ariaLabel: "주별 그림 생성 수",
    xLabelFn: (i, d) => String(d.label).split("~")[0],
  });
}

// 월별(최근 기록 월): monthly는 최신순 12개 → 뒤집어 과거→현재. 라벨은 "YYYY.MM" 그대로.
function monthlyChartSVG(monthly) {
  const arr = Array.isArray(monthly) ? monthly.slice().reverse() : [];
  return barChartSVG(arr, {
    gradId: "mBarGrad",
    ariaLabel: "월별 그림 생성 수",
    xLabelFn: (i, d) => String(d.label),
  });
}

// 'YYYY-MM-DD' → "MM/DD(요일)" (서버 _aggregate.js dayLabel과 동일 포맷 — 0건 날짜를 채울 때 클라이언트에서 생성)
const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];
function dayLabelKo(ymd) {
  const d = new Date(ymd + "T00:00:00Z");
  return ymd.slice(5, 7) + "/" + ymd.slice(8, 10) + "(" + WD_KO[d.getUTCDay()] + ")";
}

// 일별 기간 시리즈 — dailyFull(데이터 있는 날만 담김)을 달력일로 펼쳐 빈 날을 0으로 채운다.
// range: "recent30"(오늘 포함 최근 30일) | 'YYYY-MM'(그 달 1일~말일, 진행 중인 달은 오늘까지)
function dailyRangeSeries(s, range) {
  const byDate = {};
  for (const r of (Array.isArray(s.dailyFull) ? s.dailyFull : [])) byDate[r.date] = r.count;
  const DAY = 86400000;
  const today = kstYmd();
  const ymdAt = (ymd, offset) => new Date(Date.parse(ymd + "T00:00:00Z") + offset * DAY).toISOString().slice(0, 10);
  const days = [];
  if (range === "recent30") {
    for (let i = 29; i >= 0; i--) days.push(ymdAt(today, -i));
  } else {
    const [y, m] = range.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 그 달 말일
    const end = range === today.slice(0, 7) ? Number(today.slice(8, 10)) : last; // 진행 중인 달은 오늘까지
    for (let d = 1; d <= end; d++) days.push(range + "-" + String(d).padStart(2, "0"));
  }
  return days.map((d) => ({ label: dayLabelKo(d), count: byDate[d] || 0 }));
}

// 일별 기간 차트 — 막대가 많아지므로(최대 31개) x축 라벨은 ~10개 이하로 솎아낸다.
function dailyRangeChartSVG(arr) {
  const every = Math.max(1, Math.ceil(arr.length / 10));
  return barChartSVG(arr, {
    gradId: "dBarGrad",
    ariaLabel: "일별 그림 생성 수",
    xLabelFn: (i, d) => (i % every === 0 ? String(d.label).split("(")[0] : null),
  });
}

// 생성 수 차트 카드(제목·활성 탭·기간 select·SVG)를 genPeriod/genDailyRange에 맞춰 다시 그린다.
// innerHTML 교체로 이전 SVG의 리스너는 함께 버려지므로 해당 카드만 다시 배선한다.
function renderGenChart() {
  const s = adminStats;
  let title, cap, svg;
  if (genPeriod === "weekly") {
    title = "주별 그림 생성 수"; cap = "최근 기록 주 · 월~일 · 한국시간";
    svg = s && weeklyChartSVG(s.weekly);
  } else if (genPeriod === "monthly") {
    title = "월별 그림 생성 수"; cap = "최근 12개월 · 한국시간";
    svg = s && monthlyChartSVG(s.monthly);
  } else {
    title = "일별 그림 생성 수";
    if (genDailyRange === "recent") {
      cap = "최근 기록일 · 한국시간";
      svg = s && dailyChartSVG(s.daily);
    } else {
      cap = (genDailyRange === "recent30" ? "최근 30일" : genDailyRange.replace("-", ".")) + " · 한국시간";
      svg = s && dailyRangeChartSVG(dailyRangeSeries(s, genDailyRange));
    }
  }
  const t = document.getElementById("genChartTitle");
  if (t) t.textContent = title + " (" + cap + ")";
  document.querySelectorAll("#genChartSeg .segBtn").forEach(b =>
    b.classList.toggle("active", b.dataset.gperiod === genPeriod));
  const sel = document.getElementById("genDailyRange");
  if (sel) {
    sel.style.display = genPeriod === "daily" ? "" : "none"; // 기간 선택은 일별에서만 의미 있음
    sel.value = genDailyRange;
  }
  const body = document.getElementById("genChartBody");
  if (!body || !svg) return;
  body.innerHTML = svg;
  const wrap = body.closest(".chartWrap");
  if (wrap) wireBarChart(wrap);
}

// 막대 차트 인터랙션(시간대별·일별 공통): 막대에 hover(데스크톱) 또는 탭(아이패드 등 터치)하면
// 정확한 수치를 커스텀 툴팁으로 표시한다. SVG 기본 <title>은 터치 기기에서 안 뜨고 데스크톱에서도
// 느려서, pointer 이벤트(마우스·터치·펜 공통)로 직접 배선한다. .chartWrap 마다 자기 .cTip을 쓴다.
function wireBarCharts() {
  document.querySelectorAll(".chartWrap").forEach(wireBarChart);
}
function wireBarChart(wrap) {
  const svg = wrap.querySelector("svg.hChart");
  const tip = wrap.querySelector(".cTip");
  if (!svg || !tip) return;

  const hide = () => {
    tip.classList.remove("on");
    svg.querySelectorAll(".hBar.active").forEach((b) => b.classList.remove("active"));
  };
  const show = (bar, clientX, clientY) => {
    const count = Number(bar.getAttribute("data-count") || 0);
    const hasShare = bar.hasAttribute("data-share");
    tip.innerHTML =
      '<span class="cTipLabel">' + escHtml(bar.getAttribute("data-label") || "") + "</span>" +
      '<span class="cTipVal">' + count.toLocaleString("ko-KR") + "건</span>" +
      (hasShare ? '<span class="cTipShare">전체의 ' + escHtml(bar.getAttribute("data-share") || "0") + "%</span>" : "");
    tip.classList.add("on");
    svg.querySelectorAll(".hBar.active").forEach((b) => b.classList.remove("active"));
    bar.classList.add("active");
    // 포인터 위 중앙에 띄우고, 카드 밖으로 나가지 않게 클램프
    const r = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = clientX - r.left - tw / 2;
    left = Math.max(6, Math.min(left, r.width - tw - 6));
    let top = clientY - r.top - th - 12;
    if (top < 4) top = clientY - r.top + 18; // 위 공간 부족하면 아래로
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  };
  const at = (e) => {
    const bar = e.target.closest && e.target.closest(".hBar");
    if (bar) show(bar, e.clientX, e.clientY);
    else hide();
  };
  svg.addEventListener("pointermove", at);
  svg.addEventListener("pointerdown", at);
  svg.addEventListener("pointerleave", hide);
}

function renderInsight() {
  const box = document.getElementById("insightText");
  if (!box) return;
  box.textContent = adminInsights.length ? adminInsights[adminInsightIdx % adminInsights.length] : "데이터 누적 중";
}

// 설정/내보내기 세그먼트 상태 반영(활성 탭·월 select 표시·캡션·엑셀 버튼 라벨)
function syncExport() {
  document.querySelectorAll("#exportSeg .segBtn").forEach(b => b.classList.toggle("active", b.dataset.period === exportPeriod));
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
  genPeriod = "daily";
  genDailyRange = "recent";
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

  // 세그먼트 탭 (내보내기용 data-period · 차트용 data-gperiod)
  const seg = [["daily", "일별"], ["weekly", "주별"], ["monthly", "월별"]].map(([id, t]) =>
    '<button class="segBtn' + (id === "daily" ? " active" : "") + '" data-period="' + id + '">' + t + '</button>'
  ).join("");
  const genSeg = [["daily", "일별"], ["weekly", "주별"], ["monthly", "월별"]].map(([id, t]) =>
    '<button class="segBtn' + (id === "daily" ? " active" : "") + '" data-gperiod="' + id + '">' + t + '</button>'
  ).join("");
  // 일별 기간 select — 최근 기록일(기본)·최근 30일·월별 전체(report의 월 목록, 최신이 위)
  const rangeOpts = '<option value="recent">최근 기록일</option><option value="recent30">최근 30일</option>' +
    report.slice().reverse().map((m) =>
      '<option value="' + escHtml(m.month) + '">' + escHtml(m.monthLabel) + ' 한 달</option>').join("");

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
      (s.warning ? '<div class="adminWarn">⚠️ ' + escHtml(s.warning) + ' — 서버가 인증 없이 통과시키고 있어요(Vercel 환경변수 ADMIN_KEY를 설정해 주세요).</div>' : '') +
      '<div class="dashHead">' +
        '<div class="dashTitle">AI 그림 연구소 이용자 통계</div>' +
        '<div class="dashSub">서울 로봇인공지능과학관 · 라이미의 AI 그림 연구소</div>' +
      '</div>' +

      '<div class="kpiRow">' +
        kpiCard("오늘 이용자수", k.todayVisits, k.vsYesterdayPct, "어제 대비") +
        kpiCard("이번 주 이용자수", k.thisWeekVisits, k.vsLastWeekPct, "지난주 같은 시점 대비") +
        kpiCard("오늘 그림 생성 수", k.todayGen, k.vsYesterdayGenPct, "어제 대비") +
      '</div>' +

      '<div class="dashCard chartWrap"><div class="chartHead">' +
        '<div class="dashCardTitle" id="genChartTitle"></div>' +
        '<div class="chartCtrl">' +
          '<select class="reportMonthSelect selSm" id="genDailyRange">' + rangeOpts + '</select>' +
          '<div class="segRow segSm" id="genChartSeg">' + genSeg + '</div></div></div>' +
        '<div id="genChartBody"></div><div class="cTip" aria-hidden="true"></div></div>' +

      '<div class="dashCard chartWrap"><div class="dashCardTitle">시간대별 그림 생성 수 (한국시간)</div>' +
        hourlyChartSVG(s.hourly) + '<div class="cTip" aria-hidden="true"></div></div>' +

      '<div class="insightCard"><div class="insightHead">✨ 분석 인사이트</div>' +
        '<div class="insightText" id="insightText"></div>' +
        (showMore ? '<button class="insightMore" id="insightMore">다른 인사이트 →</button>' : "") +
      '</div>' +

      '<div class="dashCard"><div class="dashCardTitle">설정 · 내보내기</div>' +
        '<div class="segRow" id="exportSeg">' + seg + '</div>' +
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
        '<option value="' + escHtml(m.month) + '">' + escHtml(m.monthLabel) + (m.month === nowMonth ? " (진행 중)" : "") + '</option>'
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
  document.querySelectorAll("#exportSeg .segBtn").forEach(b =>
    b.onclick = () => { exportPeriod = b.dataset.period; syncExport(); });
  document.querySelectorAll("#genChartSeg .segBtn").forEach(b =>
    b.onclick = () => { genPeriod = b.dataset.gperiod; renderGenChart(); });
  const gdr = document.getElementById("genDailyRange");
  if (gdr) gdr.onchange = () => { genDailyRange = gdr.value; renderGenChart(); };
  const xb = document.getElementById("exportExcel"); if (xb) xb.onclick = doExcel;
  const pb = document.getElementById("exportPdf"); if (pb) pb.onclick = () => renderPrintReport();
  const rawB = document.getElementById("exportRaw"); if (rawB) rawB.onclick = exportRawData;
  const rfB = document.getElementById("exportRefresh"); if (rfB) rfB.onclick = loadAdminDashboard;
  el.querySelectorAll(".logHead").forEach(h =>
    h.onclick = () => h.parentElement.classList.toggle("open"));

  wireBarCharts();       // 시간대별 카드 배선 (생성 수 카드는 아직 비어 있어 no-op)
  renderGenChart();      // 생성 수 차트 채우기 + 해당 카드 배선
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

// 내보내기류 버튼 공통: 작업 중 라벨을 "준비 중..."으로 바꾸고 disabled, 끝나면 원복.
// xlsx 생성은 동기적이라 setTimeout(30ms)으로 한 프레임 미뤄 라벨이 실제로 페인트되게 한다.
// fn이 Promise를 돌려주면(async) 정착 후에 원복한다. 버튼이 없어도 fn은 실행된다.
function withBtnBusy(btnId, fn) {
  const btn = document.getElementById(btnId);
  if (!btn) { fn(); return; }
  const origLabel = btn.textContent;
  btn.textContent = "준비 중...";
  btn.disabled = true;
  const restore = () => { btn.textContent = origLabel; btn.disabled = false; };
  setTimeout(() => {
    try {
      const p = fn();
      if (p && typeof p.finally === "function") p.finally(restore);
      else restore();
    } catch (e) {
      restore();
      throw e;
    }
  }, 30);
}

// 현재 통계 스냅샷을 엑셀로 — 화면에 보이는 기간별 요약 + 일/주/월 표
function exportAdminXlsx() {
  if (!adminStats) return;
  withBtnBusy("exportExcel", () =>
    downloadXlsx("라이미-통계_" + kstYmd() + ".xlsx", buildSnapshotSheets(adminStats, kstStamp())));
}

// 월간 보고서(.xlsx) — 대상 월(select#reportMonth) 하나를 골라 그 달의 상세 + 12개월 개요
function exportMonthlyReport() {
  if (!adminStats) return;
  const rm = document.getElementById("reportMonth");
  const targetMonth = (rm && rm.value) || defaultReportMonth(adminStats.report || [], kstYmd());
  if (!targetMonth) return; // 표시할 달이 없음(report 비어 있음)
  withBtnBusy("exportExcel", () =>
    downloadXlsx("라이미-월간보고서_" + targetMonth + ".xlsx", buildMonthlyReportSheets(adminStats, kstYmd(), targetMonth, kstStamp())));
}

// 원본 데이터(.xlsx) — /api/export에서 12개월치 생성기록(+이벤트)을 받아 그대로 시트로
function exportRawData() {
  withBtnBusy("exportRaw", async () => {
    try {
      const r = await fetch(API_BASE + "/api/export", adminFetchOpts());
      if (r.status === 401) { adminGateReject(); return; } // alert 대신 게이트로 복귀(스펙 R4)
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "원본 데이터를 불러오지 못했어요.");
      downloadXlsx("라이미-원본_" + kstYmd() + ".xlsx", buildExportSheets(data));
    } catch (e) {
      alert("오류: " + e.message); // 관리자 전용 화면(?admin) — 별도 에러 UI 없이 alert로 충분
    }
  });
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
    '<div class="adminBarRow"><span class="adminBarDay">' + escHtml(d.label) + '</span>' +
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
      '<h2 class="reviewH2">라이미의 AI 그림 연구소 — ' + escHtml(data.targetLabel) + ' 보고서</h2>' +
      '<p class="printPeriod">데이터 범위: ' + escHtml(data.dataRange || "—") + '</p>' +
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
      '<ul class="printInsights">' + data.insights.map((t) => "<li>" + escHtml(t) + "</li>").join("") + '</ul>' +
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
