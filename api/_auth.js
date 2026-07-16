// 관리자 API 인증 판정 — 순수 함수 (DOM/네트워크/Supabase 접근 금지).
// api/stats.js, api/export.js, tests/auth.test.mjs가 공유한다.
//
// 목적(R4 — 관리자 접근 보호): ?admin의 클라이언트 PIN 게이트(app.js renderAdminGate)는 소스가
// 브라우저로 그대로 내려가 진짜 보안이 아니었다(PIN이 평문 하드코딩). 여기서는 "PIN이 맞는가"의
// 진위 판정만 서버(ADMIN_KEY 환경변수)로 옮긴다. 키패드 UI 자체는 그대로 재사용한다.
// 개인정보가 없는 운영 통계 접근이므로 목표는 "가벼운 문턱" — timing-safe 비교 같은 과설계는
// 하지 않는다(단순 === 로 충분).

/**
 * 요청 헤더의 x-admin-key와 서버 환경변수 ADMIN_KEY를 비교해 인증 상태를 판정한다.
 *
 * envValue가 빈 문자열("")인 경우도 'unset'으로 취급한다 — 빈 문자열 ADMIN_KEY는 배포 과정의
 * 실수(변수는 만들었지만 값을 안 채움)일 가능성이 높다. 만약 이를 "그 값과 정확히 일치해야
 * 하는 진짜 키"로 취급하면, 헤더를 아예 안 보낸 요청도 ""===""로 통과해버려 사실상 무보호가
 * 되면서 warning도 뜨지 않는다. "미설정"으로 보고 fail-open + 경고를 띄우는 쪽이 더 안전하다.
 *
 * @param {string|undefined|null} headerValue - req.headers['x-admin-key']
 * @param {string|undefined|null} envValue - process.env.ADMIN_KEY
 * @returns {'ok'|'unauthorized'|'unset'}
 */
export function checkAdminKey(headerValue, envValue) {
  if (!envValue) return 'unset';
  if (headerValue === envValue) return 'ok';
  return 'unauthorized';
}
