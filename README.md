# Raimi's AI Art Lab (라이미의 AI 그림 연구소)

A museum kiosk web app where visitors co-create AI artwork with the museum character Raimi by building a prompt step by step. **Live at the Seoul Robot & AI Science Museum.**

## What it is

Visitors walk up to a kiosk, meet Raimi, and choose either a guided **block-based prompt builder** or a **free chat mode**. In blocks mode, visitors pick from 10 required steps — subject, place, color, mood, style, time, size, weather, companion, and an extra detail (`js/i18n.js`, `STEPS`) — plus 5 optional advanced steps (viewpoint, lighting, and more, `STEPS_EXTRA`) if they want to go further. Each choice is translated into a piece of an English image-generation prompt before it's sent to the backend, so visitors watch their own selections become the sentence that describes their picture. In chat mode, a Raimi persona (a lightly guided GPT chat) asks one thing at a time — what, where, colors, mood — until there's enough to draw from.

Either way, the point isn't the picture — it's the *process*: an all-ages, playful way to see how a prompt is assembled, one deliberate choice at a time, and how that shapes what an AI model produces.

Once a prompt is ready, the app calls the backend to generate the image, shows it, and gives the visitor a QR code to take it home on their own phone.

## Why a custom app

The museum originally ran this activity on an off-the-shelf GPT-based service. On the exhibition floor — many kiosks, continuous walk-up traffic — that service repeatedly hit connection conflicts. Moving to this custom web app with its own serverless backend removed that failure mode; the app talks directly to the OpenAI image API under its own request handling and rate limiting, instead of sharing a third-party chat session across visitors. Being a plain web app (not a native install) also meant the exhibition kiosks could simply be locked to a single full-screen browser window pointed at the deployed URL.

## Architecture

```
 Visitor (kiosk browser, PWA)
        │
        │  10-step / 5-step prompt builder (js/app.js, js/i18n.js)
        │  or free-form chat (Raimi persona)
        ▼
 Vercel Serverless Functions (api/)
        │
        ├─ api/generate.js  → prompt-length cap → keyword filter (api/_filter.js)
        │                     → OpenAI Moderation check → rate limit (api/_limits.js)
        │                     → OpenAI Images API (gpt-image-1-mini)
        │                     → watermark composite (api/_watermark.js, sharp)
        │                     → WebP re-encode → upload (api/_storage.js)
        │
        ├─ api/chat.js      → Raimi chat persona (gpt-4.1-mini), input caps + burst limit
        │
        ├─ api/log.js       → visit / mode-select events → Supabase
        │
        └─ api/stats.js,    → admin dashboard aggregation (KST calendar, funnel,
           api/export.js,     daily/weekly/monthly), gated by ADMIN_KEY (api/_auth.js)
           api/_aggregate.js
        ▼
 Storage
        ├─ Cloudflare R2  (image objects, when R2_* env vars are set — signed via aws4fetch)
        └─ Supabase       (Postgres: generations/events metadata always; Storage as the
                            image fallback when R2 isn't configured)
```

Every generated image gets the museum logo composited onto it server-side (`api/_watermark.js`, via `sharp`) before it's ever uploaded or shown to a visitor. The QR code shown on the result screen is generated locally in the browser (`js/qr-mini.js`, a self-contained QR encoder) rather than through an external QR API, with an external fallback only if local generation fails. `sw.js` registers a network-first service worker so the kiosk keeps its shell (HTML/CSS/JS/fonts) available if the network briefly drops, while `/api/*` calls always go straight to the network so stats never serve stale data.

## Project structure

- `index.html` — single-page shell; all screens (intro, home, blocks, chat, generating, result, admin) are sections toggled by `js/app.js`.
- `js/app.js` — screen flow, prompt-builder state machine, QR result rendering, admin dashboard UI.
- `js/i18n.js` — Korean/English strings, including the block-step definitions (`STEPS`, `STEPS_EXTRA`).
- `js/qr-mini.js` — local QR-code matrix/SVG generator (no external QR service in the normal path).
- `js/dashboard-data.js`, `js/report.js`, `js/xlsx-mini.js` — admin dashboard KPIs and a dependency-free `.xlsx` writer for snapshot/monthly report exports.
- `api/generate.js` — the image-generation pipeline: input caps → keyword filter → moderation → rate limit → OpenAI Images API → watermark → WebP → storage → event logging.
- `api/chat.js` — the Raimi chat persona and the "turn this conversation into one prompt" describe mode.
- `api/_filter.js`, `api/_limits.js`, `api/_auth.js`, `api/_aggregate.js` — pure, unit-tested logic modules (keyword filtering, rate-limit math, admin-key check, KST-based stats aggregation).
- `api/_watermark.js`, `api/_storage.js` — logo compositing and the R2/Supabase storage abstraction.
- `api/stats.js`, `api/export.js` — admin-only aggregated stats and raw-data export endpoints, both gated by an `ADMIN_KEY` header check.
- `api/log.js` — lightweight visit/mode-select event logging.
- `scripts/bump-version.mjs` — keeps the `?v=` cache-busting query and the service-worker cache name in sync across `index.html`, `js/app.js`, and `sw.js`.
- `tests/` — unit tests (plain Node scripts, `node tests/<name>.test.mjs`) for the aggregation, filter, rate-limit, auth, export, QR, and report logic.
- `manifest.json`, `sw.js`, `assets/` — PWA manifest, service worker, and self-hosted fonts/icons/logo assets (no external font CDN, for offline resilience).
- `vercel.json` — Vercel function config (bundles the watermark logo asset with `api/generate.js`).

## Operations

The app runs as the exhibition kiosk activity at the Seoul Robot & AI Science Museum, generating **3,049 images in June 2026** and **over 8,000 in July** — the museum's peak season — with generation volume measured through the app's own backend (the `generations`/`events` tables recorded by `api/generate.js` and `api/log.js`).

An admin view (`?admin` in the URL) is built into the same app: a PIN gate in the UI backed by a server-side `ADMIN_KEY` check (`api/_auth.js`), behind which staff see a dashboard of daily/weekly/monthly generation counts, a visit → mode-select → generate funnel, and weekday/hourly breakdowns (`api/stats.js`, `api/_aggregate.js`), plus one-click `.xlsx` exports of a snapshot or a monthly report (`js/report.js`, `js/xlsx-mini.js`) and a raw-data export endpoint (`api/export.js`).

---

## 한국어 소개

서울로봇인공지능과학관에서 운영 중인 전시 키오스크 웹앱입니다. 관람객이 캐릭터 라이미와 함께 10단계(선택 시 +5 심화 단계)의 선택형 프롬프트 빌더로, 또는 자유 채팅으로 그림 설명을 조립하면 AI가 그림을 그려주고, 그 과정을 통해 프롬프트 엔지니어링의 원리를 놀이로 배우게 한 것이 이 앱의 목적입니다.

기존에 쓰던 기성 GPT 서비스는 전시장 특성상(다수 키오스크·연속 방문) 접속 충돌이 반복됐는데, 자체 웹앱과 서버리스 백엔드로 전환한 뒤로는 그 문제가 재발하지 않았습니다. 백엔드는 OpenAI 이미지 생성 API를 호출해 그림을 만들고, 서버에서 관 로고를 자동으로 합성하며, 이미지는 Cloudflare R2에(미설정 시 Supabase Storage로) 저장하고 생성/이용 통계는 항상 Supabase에 기록합니다. 완성된 그림은 QR 코드로 즉시 반출할 수 있고, 웹앱 형태이기 때문에 전시 키오스크를 별도 설치 앱 없이 전체화면 브라우저 하나로 운영할 수 있었습니다.

2026년 6월 3,049장, 성수기인 7월에는 8,000장을 넘는 생성량을 자체 백엔드로 집계했으며, 관리자 전용 화면(`?admin`, 서버 키 인증)에서 일/주/월별 통계와 방문-생성 퍼널을 확인하고 엑셀로 내보낼 수 있습니다.

---

포트폴리오 상세 페이지: [juwonlee.dev/work/raimi-art-lab](https://juwonlee.dev/work/raimi-art-lab)
