// tests/filter.test.mjs — R1(금칙어 필터 재설계) 단위 테스트
// api/_filter.js의 checkPrompt(prompt)를 검증한다. 네트워크 호출(OpenAI Moderation) 없이
// 키워드/저작권 매칭 로직만 확인 — Moderation 호출은 api/generate.js 쪽이라 범위 밖.
import assert from 'node:assert/strict';
import { checkPrompt } from '../api/_filter.js';

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

// ---- 오탐 픽스처: 전부 ok:true 여야 함 (그림 앱 정상 프롬프트를 막으면 안 됨) ----
const falsePositives = [
  '미술관에서',
  '마술사 토끼',
  '예술 작품',
  '술래잡기 하는 아이들',
  '피자 먹는 고양이',
  '커피숍',
  '핑크색 칼라 드레스',
  '성인이 된 나무',
  'drawing skills',
  'a cat with great skill',
  'sussex castle',
  '버섯 요리사',
];

for (const p of falsePositives) {
  test(`오탐 방지 — "${p}" → ok:true`, () => {
    const result = checkPrompt(p);
    assert.deepEqual(result, { ok: true });
  });
}

// ---- 진탐 픽스처: 전부 차단(ok:false)이어야 함 ----
const truePositives = [
  '누드 그림',
  'n u d e painting',
  '피투성이 좀비',
  '맥주 마시는 곰',
  'kill the monster',
  '피카츄',
  '슈퍼 마리오',
  'pokemon',
  'po ke mon',
];

for (const p of truePositives) {
  test(`진탐 차단 — "${p}" → ok:false`, () => {
    const result = checkPrompt(p);
    assert.equal(result.ok, false);
    assert.ok(result.reason === 'banned' || result.reason === 'copyright', 'reason은 banned 또는 copyright');
  });
}

// ---- reason 세부 확인(대표 케이스) ----
test('reason — "누드 그림"은 banned', () => {
  assert.equal(checkPrompt('누드 그림').reason, 'banned');
});
test('reason — "피카츄"는 copyright', () => {
  assert.equal(checkPrompt('피카츄').reason, 'copyright');
});
test('reason — "슈퍼 마리오"(띄어쓰기)는 copyright', () => {
  assert.equal(checkPrompt('슈퍼 마리오').reason, 'copyright');
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
