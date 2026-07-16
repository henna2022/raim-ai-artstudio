// tests/auth.test.mjs — R4(관리자 접근 보호) 단위 테스트
// api/_auth.js의 checkAdminKey 순수 함수만 검증한다(Supabase/HTTP 등 실제 상태는 api/stats.js·
// api/export.js 쪽이라 범위 밖).
import assert from 'node:assert/strict';
import { checkAdminKey } from '../api/_auth.js';

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok - ' + name);
  } catch (e) {
    failures++;
    process.exitCode = 1;
    console.error('  FAIL - ' + name);
    console.error('    ' + ((e && e.stack) || e));
  }
}

test('checkAdminKey — 헤더값이 ADMIN_KEY와 일치하면 ok', () => {
  assert.equal(checkAdminKey('4300', '4300'), 'ok');
});
test('checkAdminKey — 헤더값이 ADMIN_KEY와 다르면 unauthorized', () => {
  assert.equal(checkAdminKey('0000', '4300'), 'unauthorized');
  assert.equal(checkAdminKey(undefined, '4300'), 'unauthorized');
  assert.equal(checkAdminKey(null, '4300'), 'unauthorized');
});
// ADMIN_KEY 환경변수가 아예 없거나(undefined) 빈 문자열이면 둘 다 'unset'으로 취급한다.
// 빈 문자열 ADMIN_KEY는 배포 과정에서 변수만 만들고 값을 안 채운 실수일 가능성이 높다 —
// 이를 "정확히 일치해야 하는 값"으로 취급하면 헤더를 안 보낸 요청도 ""===""로 통과해버려
// warning도 없이 조용히 무보호가 된다. 그래서 fail-open(unset) 쪽으로 판정해 경고를 띄운다.
test('checkAdminKey — ADMIN_KEY 미설정(undefined)이면 unset', () => {
  assert.equal(checkAdminKey('4300', undefined), 'unset');
  assert.equal(checkAdminKey(undefined, undefined), 'unset');
});
test('checkAdminKey — ADMIN_KEY가 빈 문자열이어도 unset(사실상 미설정으로 취급)', () => {
  assert.equal(checkAdminKey('4300', ''), 'unset');
  assert.equal(checkAdminKey('', ''), 'unset');
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
