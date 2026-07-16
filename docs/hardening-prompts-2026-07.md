# 안정화·보안 고도화 — 하위 모델 위임용 작업 프롬프트 (2026-07)

T0~T6(통계 고도화)이 완료된 뒤, 상위 모델(Fable 5)이 코드 전체를 재검토해 설계한 후속 작업 세트.
통계 트랙과 달리 이번 트랙은 **실사용 버그·비용 방어·복원력**이 주제다.

> **개정 v2.1 (2026-07-14, Fable 5 재검토)** — 대시보드 v2.0.0(커밋 8a1ef4b)이 이 문서 작성 *이후*
> 들어와 일부 전제가 낡아 있었다. 이번 개정 내용:
> ① 모든 라인 참조를 현재 HEAD 기준으로 갱신. **앞으로 위치 지정은 "함수명 + 검색용 코드 조각"이
>   기본, 라인 번호는 작성 시점 참고용** — 하위 모델은 낡은 라인 번호에 특히 취약하다(이번에 실증됨).
> ② R1 스펙의 내부 모순 수정: 'kill'(4자)을 compact에 적용하면 오탐 픽스처 "drawing skills"가
>   스스로 깨진다. compact 적용 목록을 명시적 고정 목록으로 교체.
> ③ R2에 버스트 한계(완전 방어 불가)를 명시 — 하위 모델이 과잉 주장하거나 과잉 설계하지 않도록.
> ④ R4 전면 재작성: v2.0.0에서 클라이언트 PIN 게이트가 이미 생겼으므로 "폼 신설"이 아니라
>   "기존 게이트 재사용 + 검증만 서버 이전"으로.
> ⑤ R7 재조정: 구 R7-2(QUIZ 빈 목록 방어)는 이미 구현됨, 구 R7-1(관리자 i18n)은 기각으로 이동,
>   sendChat 턴 소모 버그(신규 발견)를 추가.
> ⑥ R8(QR 로컬 생성) 후보 추가 — 하위 모델 위임 부적합, 상위 모델 직접 수행 대상.

## 배경 — 왜 이 작업들인가 (검증된 발견만 기재)

아래는 추측이 아니라 **재현·확인된** 사실이다:

1. **금칙어 오탐 (P0, 실사용 버그)** — `api/generate.js`의 금칙어가 부분 문자열 매칭이라,
   아동 *그림* 앱에서 다음이 전부 차단됨을 재현 확인:
   `"미술관에서"`·`"마술사 토끼"`·`"예술 작품"`·`"술래잡기"`(→'술'),
   `"피자 먹는 고양이"`·`"커피숍"`(→'피'), `"핑크색 칼라 드레스"`(→'칼'),
   `"성인이 된 나무"`(→'성인'), `"drawing skills"`(→'kill'), `"sussex castle"`(→'sex').
   통계의 `generate_blocked(detail:'banned')` 중 상당수가 오탐일 가능성이 높다.
2. **비용 무방비 (P0)** — `/api/generate`·`/api/chat`은 무인증 공개 엔드포인트이고 서버측
   호출 한도·입력 길이 제한이 전혀 없다. 챗 8회 제한은 클라이언트 전용(`MAX_CHAT_TURNS`,
   app.js:414). 스크립트로 호출하면 OpenAI 비용이 그대로 나간다.
3. **타임아웃 부재 (P1)** — 서버(OpenAI fetch)·클라(fetch) 모두 타임아웃이 없다. 네트워크가
   불안정하면 키오스크가 스피너에서 영원히 멈추고, 유휴 리셋도 `s-gen` 화면은 건너뛰므로
   (app.js `onIdle`) 아이가 스스로 복구할 수 없다.
4. **중복 실행 가드 부재 (P1)** — `runGenerate()`는 busy 가드가 없어 빠른 연속 탭이 생성 요청을
   중복 발사할 수 있다(= 중복 과금). 호출부: renderBlockStep 옵션 클릭(app.js:311)·
   renderMoreChoice '이대로 그리기'(app.js:337)·renderReviewButtons 재시도(app.js:389).
5. **관리자 API 무보호 (P1)** — v2.0.0에서 `?admin`에 클라이언트 PIN 게이트가 생겼지만
   PIN이 소스에 평문 하드코딩(`ADMIN_PIN = "4300"`, app.js:17)이라 보안이 아니고,
   `/api/stats`·`/api/export`는 여전히 주소만 알면 누구나 직접 호출 가능.
   개인정보는 없지만 운영 데이터 전체가 노출된다.
6. **에러 문자열 innerHTML 주입 (P1, 저위험이지만 수정 저렴)** — 서버 에러 메시지가
   이스케이프 없이 `innerHTML` 경로(`fill()` → `reviewErr` 등)로 들어간다.
7. **?v=/CACHE 수동 규칙 (P2, 프로세스 리스크)** — 매 작업마다 사람이/모델이 기억해서 bump하는
   구조라 언젠가 반드시 실수한다. 자동화 + 정합 테스트로 규칙 자체를 없애는 게 맞다.

### 하지 않기로 판단한 것 (제안돼도 거절할 것)

- **프레임워크/상태관리 도입, 전역 상태 리팩터링** — 무빌드 vanilla 제약과 앱 규모(36K)에서 ROI 없음.
- **content-hash 빌드 파이프라인** — "빌드 없음" 원칙과 충돌. 대신 R6의 bump 스크립트로 해결.
- **서버측 PDF 생성(Puppeteer 등)** — T6의 브라우저 인쇄로 충분. 서버 의존성만 늘어남.
- **API 버저닝(/v1/...)** — 단일 클라이언트(우리 앱)뿐이라 불필요.
- **R2 업로드 후 HEAD 재확인** — R2는 강한 일관성(strong consistency)이라 근거 없는 우려.
- **주 경계 DST 보정** — KST는 DST가 없다. 현행 `_aggregate.js` 로직이 맞다.

### 권장 순서와 모델 티어

**R1 → R2 → (R3, R5 병렬) → R4 → R6 → R7.** R1·R2는 스펙이 판단을 다 담고 있으므로 Sonnet급이면
충분하다. R3·R4는 기존 코드(타이머·게이트 UI) 재배선이 있어 Sonnet 권장. R5·R6·R7은 Haiku급도
가능하다. R8(QR)은 하위 모델 위임 부적합 — 상위 모델이 직접 한다. 스펙에 없는 새로운 위험 판단이
필요해지면 구현을 멈추고 보고만 할 것(아래 공통 컨텍스트 규칙).

---

## [공통 컨텍스트] — 모든 작업 프롬프트 앞에 붙일 것

```
[프로젝트 공통 컨텍스트 v2]
- 앱: "라이미의 AI 그림 연구소" — 아동용 AI 그림 키오스크 PWA. 빌드 없는 vanilla JS
  (index.html + js/app.js ES 모듈 + js/i18n.js + js/report.js + css/styles.css)
  + Vercel 서버리스(api/*, ESM) + Supabase(generations, events) + R2 이미지 저장.
  프런트에 외부 라이브러리 추가 금지. 소스는 /Users/henna/Desktop/raim-ai-artstudio.
- 개인정보 절대 금지: 프롬프트 원문·IP·User-Agent를 DB에 저장하지 않는다.
  events.detail은 사유 코드/요약 100자 이내만.
- 서버리스 특성: Vercel 함수는 인스턴스 간 메모리를 공유하지 않는다. "전역 변수 카운터"는
  베스트에포트일 뿐이며, 신뢰 가능한 상태는 Supabase에만 있다.
- 규칙(어기면 안 됨):
  * 모든 집계·라벨은 KST 기준. events.type CHECK 제약은
    ('visit','mode_select','generate_ok','generate_blocked','generate_error') — 새 type 추가 금지,
    세분류는 detail 컬럼으로.
  * js/css 수정 시 index.html의 ?v= 버전 bump, app.js가 import하는 모듈 수정 시 import ?v=도
    bump. sw.js CORE 변경 시 CACHE 이름 bump. /api/*는 SW가 캐시하지 않는다(유지).
    (R6 완료 후에는 `node scripts/bump-version.mjs`로 대체)
  * 아이가 보는 에러 문구는 친절한 한국어/영어(i18n)로 — 기술 용어 노출 금지.
- 작업 방식(v2에서 추가된 규칙):
  * 버그 수정 작업은 반드시 "수정 전 실패를 재현하는 테스트/스크립트"를 먼저 만들어 실패를
    확인하고, 수정 후 통과를 보고에 포함한다.
  * 필터·한도류 작업은 오탐(막으면 안 되는 것)과 진탐(막아야 하는 것) 픽스처를 모두 테스트한다.
  * 스펙 밖의 문제를 발견하면 고치지 말고 보고만 한다(한 세션 = 한 작업).
- 검증(완료 전 필수, 결과를 보고에 포함):
  * node --check <수정한 모든 js>
  * for f in tests/*.mjs; do node "$f"; done — 전부 통과
  * 엑셀 산출물이 바뀌면 xlsxBytes() → python3 + openpyxl 판독으로 정합 확인
- Supabase 실계정 접근은 없다고 가정. DB 변경은 docs/sql/*.sql 저장 + 적용 안내만.
```

---

## R1 — 금칙어 필터 전면 재설계: 오탐 제거 + 의미 기반 가드 (P0)

```
[작업] api/generate.js의 금칙어 필터가 부분 문자열 매칭이라 오탐이 심각해
(그림 앱인데 "미술관"·"마술사"·"피자"·"커피"·"술래잡기"·"drawing skills"가 차단됨 — 재현 확인됨).
필터를 순수 모듈로 분리해 재설계해줘.

1) api/_filter.js 신설 (순수 모듈, DOM/네트워크 접근 금지):
   - export function checkPrompt(prompt) → { ok:true } 또는 { ok:false, reason:'banned'|'copyright' }.
   - 정규화: const low = prompt.toLowerCase().normalize('NFKC');
     const compact = low.replace(/[\s\-_.·~*]/g, '') — 띄어쓰기 우회("n u d e") 방지용.
   - 영어 위험어: 단어 경계 정규식으로만 매칭 — /\b(nude|naked|sex|sexual|nsfw|porn|blood|gore|
     kill|suicide|drug|weapon|gun|knife)\b/ 를 low에 적용. compact에는 다음 **고정 목록만** 적용:
     nude, naked, porn, nsfw, sexual, suicide. 그 외(kill·gore·drug·blood·knife·weapon·gun·sex)는
     compact에 절대 넣지 말 것 — 예: "drawing skills"의 compact("drawingskills")에는 'kill'이
     부분 문자열로 들어 있어, "4자 이상" 같은 글자 수 기준으로 넣으면 오탐 픽스처가 깨진다.
     판단 기준은 글자 수가 아니라 "무해한 단어 안에 부분 문자열로 나타날 수 있는가"다.
   - 한국어 위험어: 단독으로 명백한 2자 이상 토큰만 유지 —
     누드, 나체, 섹스, 야한, 음란, 폭력, 살해, 자살, 마약, 담배, 흉기, 유혈, 피범벅, 피투성이,
     음주, 맥주, 소주, 술병, 술취.
     다음 1자 토큰은 오탐 원인이므로 삭제: '피', '술', '칼', '성인', '죽이'.
     (삭제로 생기는 공백은 3)의 의미 기반 가드가 메운다 — 키워드로 다 막으려 하지 말 것.)
   - 저작권 목록: 기존 배열 유지하되 compact 기준 매칭으로 변경("슈퍼 마리오" 우회 방지).
     '마리오'는 '마리오네트' 오탐이 있으므로 '슈퍼마리오'와 '마리오'(단독 경계 불가) 중
     '마리오' 단일 토큰은 유지하되 오탐 픽스처에 '마리오네트' 케이스를 known-limitation으로 기록.
2) 의미 기반 가드: OpenAI Moderation API 호출 추가 (무료) —
   POST https://api.openai.com/v1/moderations, body {model:'omni-moderation-latest', input: prompt}.
   sexual, sexual/minors, violence, self-harm 계열 category가 true면 차단(reason:'banned').
   호출 실패/타임아웃(5초 AbortController)이면 통과시키고(fail-open — 이미지 모델 자체 안전장치
   존재) events에 generate_error가 아닌 console.error만 남긴다. 이 호출은 api/generate.js에서
   키워드 필터 통과 후에 수행(_filter.js는 순수 유지).
3) api/generate.js: 기존 banned/copyrighted 블록을 checkPrompt() 호출로 교체.
   차단 시 기존과 동일하게 logEvt('generate_blocked', {detail: reason}) + 400 친절 메시지 유지.
4) tests/filter.test.mjs 신설 — 먼저 작성해서 현행 로직 기준 실패를 확인한 뒤 구현:
   - 오탐 픽스처(전부 ok:true 여야 함): "미술관에서", "마술사 토끼", "예술 작품", "술래잡기 하는
     아이들", "피자 먹는 고양이", "커피숍", "핑크색 칼라 드레스", "성인이 된 나무",
     "drawing skills", "a cat with great skill", "sussex castle", "버섯 요리사".
   - 진탐 픽스처(전부 차단): "누드 그림", "n u d e painting", "피투성이 좀비", "맥주 마시는 곰",
     "kill the monster", "피카츄", "슈퍼 마리오", "pokemon", "po ke mon".
5) 배포 후 확인 안내(사람이 함): 통계의 blocked(detail:'banned') 비율이 떨어지는지 관찰.

완료 기준: 신규 테스트 + 기존 tests/ 전부 통과, node --check, moderation 5초 타임아웃 확인.
하지 말 것: 키워드 목록을 늘려서 해결하려는 시도(오탐의 원인), 프롬프트 원문 로깅,
moderation 실패 시 차단(fail-closed) — 가용성이 우선.
```

---

## R2 — 비용·악용 방어: 서버측 입력 한도 + 호출 한도 (P0)

```
[작업] /api/generate와 /api/chat이 무인증 공개 상태라 스크립트 호출로 OpenAI 비용이 그대로
새어 나갈 수 있어. 서버측 한도를 추가해줘. (클라이언트의 8회 제한은 UX용일 뿐 방어가 아님.)

1) 입력 한도(하드 캡, 초과 시 400 + 친절 메시지):
   - api/generate.js: prompt 길이 ≤ 1200자.
   - api/chat.js: messages 배열 길이 ≤ 20, 각 content는 문자열 & ≤ 400자, 전체 합 ≤ 4000자.
     비문자열 content·알 수 없는 role은 필터가 아니라 400으로 거부.
2) /api/generate 호출 한도 (Supabase 기반 — 서버리스에서 유일하게 신뢰 가능한 공유 상태):
   - 생성 직전에 events에서 최근 60초의 type in ('generate_ok','generate_error') 건수를 조회:
     * 같은 session_id 기준 ≥ 3건 → 429.
     * 전체 기준 ≥ 20건 → 429. (다중 키오스크 여유 포함. 상수로 모아둘 것.)
   - 429 시 logEvt('generate_blocked', {detail:'ratelimit'}) + 메시지
     "지금은 그림을 너무 많이 그리고 있어요. 잠깐 쉬었다가 다시 해볼까요?" (i18n 불필요 — 서버
     메시지는 클라 reviewErr로 표시됨).
   - events 테이블이 없으면(42P01) 한도 검사 생략(우아한 폴백 — stats.js의 isMissingTable 패턴).
   - session_id가 null인 요청은 "전체 한도"만 적용받는다(구버전 클라 호환).
   - **알려진 한계(코드 주석과 완료 보고에 반드시 명시)**: generate_ok/error는 생성이 *끝난 뒤*에야
     기록되므로, 첫 60초 안에 동시 다발로 쏘는 버스트는 한도 검사를 통과할 수 있다. events.type
     CHECK 제약(새 type 금지) 아래에서는 "시도 시점 기록"이 불가능해 구조적으로 못 막는다.
     이 한도는 지속 남용을 막는 베스트에포트다 — 완전 방어라고 주장하지 말고, 이를 메우려고
     새 인프라·새 type을 제안하지도 말 것.
3) /api/chat 호출 한도: DB 왕복 비용 대비 실익이 작으므로 입력 캡(1번)만 하드하게 적용하고,
   모듈 전역 Map을 쓰는 베스트에포트 인메모리 슬라이딩 윈도(세션당 분당 12회)를 추가한다.
   인스턴스 간 비공유라는 한계를 코드 주석에 명시할 것.
4) 부수 정리(같은 파일을 만지는 김에):
   - api/chat.js의 prompt_cache_key 주석이 사실과 다름 — OpenAI 프롬프트 캐싱은 접두부 1024토큰
     이상에서만 동작하는데 시스템 프롬프트가 그보다 훨씬 짧다. 파라미터는 무해하니 유지하되
     주석을 "현재 접두부가 짧아 실효 없음, 프롬프트가 길어지면 활성화됨"으로 정정.
5) tests/limits.test.mjs: 한도 판정 로직을 순수 함수(api/_limits.js 등)로 분리해 단위 테스트 —
   경계값(정확히 3건/20건), 60초 창 경계, session_id null, events 부재 폴백.

완료 기준: node --check + 기존/신규 테스트 전부 통과. 오탐 관점 확인: 정상 키오스크 시나리오
(한 세션이 40초 간격 생성)가 차단되지 않음을 테스트로 증명.
하지 말 것: 새 인프라(Upstash/KV) 도입, events에 새 type 추가(CHECK 제약 위반), IP 저장(개인정보
금지 — 한도는 session_id/전체 기준만), 클라이언트 수정(이 작업은 서버만).
```

---

## R3 — 네트워크 복원력: 타임아웃·워치독·중복 실행 가드 (P1)

```
[작업] 서버·클라 모두 타임아웃이 없어서 네트워크가 불안정하면 키오스크가 스피너에 영원히
갇혀. 아이가 스스로 복구할 수 있게 만들어줘.

1) 서버 (api/generate.js, api/chat.js): 모든 외부 fetch에 AbortController —
   이미지 생성 50초, 챗 20초, (R1의 moderation은 이미 5초). 타임아웃 시 기존 502 경로 재사용
   (generate는 logEvt('generate_error', {detail:'timeout'})).
2) 클라 (js/app.js):
   - apiGenerate/apiChat fetch에 AbortController — generate 70초, chat 25초.
     타임아웃 시 throw Error(t('errTimeout')) — i18n에 ko/en 문구 추가
     (예: "그림 그리기가 너무 오래 걸려요. 다시 한 번 해볼까요?").
   - s-gen 워치독: runGenerate 시작 시 타임스탬프 기록, 90초 경과에도 s-gen이면
     renderReview(null, t('errTimeout'))로 탈출(기존 재시도 버튼이 복구 경로가 됨).
     워치독 타이머는 화면 전환(show()) 시 반드시 해제 — 결과 화면에서 오발사 금지.
3) 중복 실행 가드: 전역 genBusy 플래그 — runGenerate 진입 시 true면 return, 진입 직후 true,
   renderResult/renderReview 도달 시 false. finishChat은 이미 chatBusy 가드가 있으므로 그대로 두고
   확인만. 호출부(라인은 2026-07-14 기준, 함수명으로 찾을 것): renderBlockStep 옵션 클릭
   (app.js:311), renderMoreChoice의 draw 버튼(app.js:337), renderReviewButtons의 retry(app.js:389).
4) 로고 합성 실패 관측: api/generate.js의 addLogo catch에서 성공 이벤트에 표식 —
   logEvt('generate_ok', {detail:'logo_fail'}) (type 추가 금지, detail 활용).
5) 재현 우선: 수정 전에 tests/ 또는 임시 스크립트로 "fetch가 안 끝나면 영원히 대기"를
   mock으로 재현(AbortController 부재 확인)하고, 수정 후 타임아웃 발화를 확인.

완료 기준: node --check + 전체 테스트 + ?v=/CACHE 규칙(app.js·i18n.js 수정 시) + 프리뷰 서버
(launch.json 'raimi', 포트 8766)에서 blocks 모드 정상 생성 흐름이 깨지지 않음(스크린샷 1장).
하지 말 것: 자동 재시도 루프(중복 과금 위험 — 재시도는 아이가 버튼으로), 유휴 리셋(onIdle)
로직 변경(워치독은 별도 타이머), 서버 maxDuration 변경.
```

---

## R4 — 관리자 접근 보호: 경량 패스코드 (P1)

```
[작업] /api/stats·/api/export가 무보호야. v2.0.0에서 ?admin에 클라이언트 PIN 게이트(숫자 키패드,
renderAdminGate)가 생겼지만, PIN이 소스에 평문 하드코딩(ADMIN_PIN 상수, app.js 상단)이라 보안이
아니고, API는 주소만 알면 누구나 직접 호출할 수 있어. **기존 키패드 UI는 그대로 재사용하고,
PIN의 진위 판정만 서버로 옮겨줘.** (개인정보는 없으므로 목표는 "가벼운 문턱" — 과설계 금지.)

1) 서버: api/stats.js·api/export.js 공통 — 요청 헤더 x-admin-key가
   process.env.ADMIN_KEY와 일치하지 않으면 401 {error:'unauthorized'}.
   ADMIN_KEY 환경변수가 아예 설정돼 있지 않으면 종전대로 허용하되 응답에
   {warning:'ADMIN_KEY 미설정'} 필드 추가(배포 순서 사고 방지 — fail-open + 경고).
   문자열 비교는 timing-safe 불필요(위협 모델상 과함) — 단순 === 로 충분.
   판정은 순수 헬퍼 api/_auth.js의 checkAdminKey(headerValue, envValue) →
   'ok'|'unauthorized'|'unset' 으로 분리해 두 파일이 공유.
2) 클라 (js/app.js) — 기존 renderAdminGate 키패드를 재배선:
   - ADMIN_PIN 상수와 클라이언트 측 비교(게이트 check 함수의 buf === ADMIN_PIN)를 **제거**한다.
     대신 입력한 4자리를 sessionStorage 'raimi-admin-key'에 저장하고 loadAdminDashboard 호출.
   - loadAdminDashboard·exportRawData의 fetch에 x-admin-key 헤더로 sessionStorage 값을 싣는다
     (값이 없으면 헤더 생략).
   - 응답이 401이면 sessionStorage 키를 지우고 renderAdminGate로 되돌리며 "PIN이 올바르지
     않아요" 표시 — 기존 gateErr·shake UX 재사용.
   - 기존 'raimi-admin-ok' 플래그는 제거(진위 판단이 서버로 갔으므로 무의미).
   - 서버 응답에 warning(ADMIN_KEY 미설정)이 있으면 대시보드 상단에 경고 한 줄 표시.
3) 배포 안내문(보고에 포함): Vercel 환경변수 ADMIN_KEY 설정 방법 한 단락 + "ADMIN_KEY는
   4자리 숫자로 설정해야 기존 키패드 UI와 맞는다"(키패드는 4자리 입력 시 자동 제출) 명시.
4) tests: checkAdminKey 단위 테스트 3케이스(ok / unauthorized / unset).

완료 기준: node --check + 전체 테스트 + 프리뷰에서 ?admin → 키패드 → 통계 표시 흐름 확인
(로컬은 ADMIN_KEY 미설정이므로 warning 경로로 확인). ?v= 규칙(app.js 수정) 준수.
하지 말 것: 쿠키/세션/JWT 도입, 게이트 UI 재디자인, 키오스크 일반 흐름(s-intro~s-result)에
어떤 변화도 주지 말 것, localStorage 사용(공용 기기 — sessionStorage로 탭 닫으면 만료).
```

---

## R5 — HTML 이스케이프 하드닝 (P1, 소형)

```
[작업] js/app.js가 서버 에러 메시지 등 외부 문자열을 이스케이프 없이 innerHTML 경로에 넣고 있어
(fill(t("reviewErr"), {err}) 등). 저위험(같은 오리진 API)이지만 수정이 저렴하니 막아줘.

1) js/app.js에 escHtml(s) 헬퍼 추가(& < > " ' 5종 — js/xlsx-mini.js의 xmlEsc 참고).
2) fill(str, vars)가 vars 값을 escHtml 처리하도록 변경. 단, i18n 문구 자체(str)는 마크업을
   포함할 수 있으므로 건드리지 말 것 — 값만 이스케이프.
3) innerHTML에 외부 유래 문자열(에러 메시지, 이미지 URL)을 직접 연결(concat)하는 지점을 전수
   조사해 escHtml 또는 textContent로 전환. QR/이미지 URL은 encodeURIComponent/URL 검증 유지.
   최소 확인 지점(라인은 2026-07-14 기준): renderReview의 errBox(fill(t("reviewErr"), {err}),
   app.js:370), loadAdminDashboard 실패 경로('오류: ' + e.message 를 innerHTML에 연결,
   app.js:579), renderResult의 url 연결(app.js:397·402·405).
4) tests/esc.test.mjs: fill()에 '<img onerror=...>' 류 페이로드 → 이스케이프된 출력 확인.
   기존 i18n 문구가 깨지지 않음(마크업 포함 문구 스팟체크)도 확인.

완료 기준: node --check + 전체 테스트 + 프리뷰에서 blocks 흐름·에러 화면(서버 없이 생성 시도)
정상 표시 + ?v= 규칙.
하지 말 것: 전체 렌더링을 textContent로 재작성(범위 밖), DOMPurify 등 라이브러리 추가.
```

---

## R6 — 배포 버전 자동화: ?v=/CACHE bump 스크립트 + 정합 테스트 (P2)

```
[작업] "?v= bump·CACHE bump" 수동 규칙은 언젠가 반드시 실수해. 규칙을 스크립트와 테스트로
대체해줘.

1) scripts/bump-version.mjs (무의존 node 스크립트):
   - index.html의 css/js ?v=N, js/app.js 내부 import의 ?v=N, sw.js의 CACHE "raim-cache-vN"을
     찾아 모두 +1로 통일 rewrite. 실행 결과(무엇을 몇으로 올렸는지) stdout 출력.
   - --check 모드: 파일을 바꾸지 않고 정합만 검사(아래 2와 동일 규칙) — CI/테스트용.
2) tests/version-consistency.test.mjs:
   - app.js가 import하는 모든 로컬 모듈이 sw.js CORE 목록에 존재.
   - index.html이 참조하는 js/css에 ?v= 존재.
   - (스크립트의 --check를 호출하는 얇은 래퍼여도 됨.)
3) docs/stats-report-prompts.md와 이 문서의 공통 컨텍스트 규칙 문구를
   "js/css 수정 후 node scripts/bump-version.mjs 실행"으로 갱신.

완료 기준: 스크립트 실행 → git diff로 세 위치가 일관되게 올라감을 보이고 → 되돌린 뒤(--check
통과 상태로) 커밋 준비. 전체 테스트 통과.
하지 말 것: 빌드 도구·해시 파이프라인 도입, sw.js 캐시 전략 변경.
```

---

## R7 — 소액 정리 모음 (P2, 한 세션에 일괄)

```
[작업] 리뷰에서 나온 소형 개선을 일괄 처리해줘. 각각 독립적이고 판단 여지가 없는 것만 모았어.
(v2.1 재조정: 구 "관리자 i18n 이동"은 기각 표로, 구 "QUIZ 빈 목록 방어"는 이미 구현돼 제외 —
renderQuizQuestion에 !list.length 체크 존재.)

1) js/app.js sendChat: apiChat 실패 시에도 방금 push한 user 메시지가 chatMessages에 남아
   8회 한도(MAX_CHAT_TURNS)를 소모한다(catch 경로에서 assistant 에러 문구만 추가됨).
   실패하면 해당 user 메시지를 pop해 턴을 돌려주고, 입력창(chatInput)에 원문을 복원해
   재전송이 쉽게 한다.
2) js/app.js: 새로고침(exportRefresh)·원본 내보내기(exportRaw) 버튼 중복 클릭 방지
   (요청 중 disabled). 메모리 캐시는 넣지 않는다(새 대시보드 구조에서 이득이 작음).
3) js/app.js sendChat 등 .catch(() => ({})) 지점에 console.error 추가(원인 소실 방지).
4) xlsx/원본 내보내기 시작 시 해당 버튼 라벨을 "준비 중..."으로 바꾸고 완료 후 원복
   (v2.0.0 대시보드에는 상시 adminMsg 요소가 없으므로 버튼 라벨 방식으로).

완료 기준: node --check + 전체 테스트 + ?v= 규칙 + 프리뷰에서 ?admin 화면 동작 확인.
하지 말 것: 이 목록 밖의 리팩터링. 발견한 다른 문제는 보고만.
```

---

## R8 — (후보) QR 코드 로컬 생성: 외부 서비스 의존 제거 (P2, **하위 모델 위임 부적합**)

현황: 결과 화면의 QR이 api.qrserver.com에 생성물 이미지 URL을 실어 요청한다(app.js renderResult).
외부 서비스 장애·차단 시 QR만 조용히 깨지고(그림 표시·저장은 정상), 생성물 URL이 제3자에게
전달된다(개인정보는 아니지만 불필요한 외부 의존).

방향: js/xlsx-mini.js 전례처럼 js/qr-mini.js 자체 구현(byte 모드 + EC level M, 버전 자동 선택,
SVG 렌더). 단 QR 스펙(리드-솔로몬 에러정정, 마스킹 페널티 채점)은 구현 실수가 컴파일 오류가
아니라 "스캔되지 않는 QR"로 조용히 나타나므로, known-answer 테스트 벡터 없이 하위 모델에 맡기면
안 된다. **상위 모델(Fable 5)이 직접 구현하고 실기기 카메라 스캔으로 검증**하는 것이 맞다.
급하지 않으므로 R1~R7 완료 전까지 보류.

---

## 부록 — 이번 검토에서 기각된 에이전트 소견 (재제안 방지용)

| 소견 | 기각 사유 |
|---|---|
| R2 업로드 후 정합 재확인 필요 | Cloudflare R2는 강한 일관성 — 문제 자체가 없음 |
| 주 경계 DST 버그 | KST에 DST 없음. 현행 로직 정상(테스트 A1~A8 통과) |
| report.js가 서버 집계를 중복 | 사실과 다름 — 집계는 서버(_aggregate.js), report.js는 시트 포맷팅만 |
| sendChat 이중 탭 레이스 | chatBusy 가드가 동기 구간에 있어 재진입 불가(JS 단일 스레드). 실제 구멍은 runGenerate — R3에서 처리 |
| 파일명 충돌(Date.now+난수) | 단일 키오스크 규모에서 확률 무시 가능 |
| CORS 헤더 추가 | API_BASE=""(same-origin) — 해당 없음 |
| log.js가 항상 200 반환 | 의도된 설계(sendBeacon fire-and-forget, 주석 명시) |
| stats/export 10만 행 캡 | 현재 규모(키오스크 1대)에서 수년 여유. events가 월 8천 건 넘게 쌓이기 시작하면 그때 재설계 |
| 관리자 화면 문구 i18n 이동(구 R7-1) | v2.0.0 대시보드는 과학관 운영진 전용·한국어 고정 설계 — 이중 유지비만 늘어남 (v2.1에서 기각) |
| QUIZ 빈 목록 방어(구 R7-2) | 이미 구현됨 — renderQuizQuestion의 !list.length 체크 (v2.1에서 확인) |
| ADMIN_PIN을 서버로 보내 검증하는 것 외 추가 인증 강화 | 위협 모델(공개 iPad에서 우발적 접근)에 R4로 충분 — 과설계 금지 |
