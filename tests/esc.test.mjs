// tests/esc.test.mjs — R5(HTML 이스케이프 하드닝) 단위 테스트
// app.js의 escHtml(s)과 fill(str, vars)을 검증한다.
// app.js는 DOM에 의존해 node에서 import할 수 없으므로, 소스에서 두 순수 함수를 그대로
// 추출해 로드한다 — 복사본을 두면 app.js가 회귀해도 테스트가 통과해버리기 때문.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const escSrc = appSrc.match(/function escHtml\(s\) \{[\s\S]*?\n\}/)?.[0];
const fillSrc = appSrc.match(/function fill\(str, vars\) \{.*\}/)?.[0];
assert.ok(escSrc, 'app.js에서 escHtml 함수를 찾지 못함(시그니처 변경 시 이 추출 정규식도 갱신)');
assert.ok(fillSrc, 'app.js에서 fill 함수를 찾지 못함(시그니처 변경 시 이 추출 정규식도 갱신)');
const { escHtml, fill } = new Function(escSrc + '\n' + fillSrc + '\nreturn { escHtml, fill };')();

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

// ---- escHtml 단위 테스트 ----
test('escHtml — & 치환', () => {
  assert.equal(escHtml('P&Q'), 'P&amp;Q');
});
test('escHtml — < 치환', () => {
  assert.equal(escHtml('<div>'), '&lt;div&gt;');
});
test('escHtml — > 치환', () => {
  assert.equal(escHtml('a>b'), 'a&gt;b');
});
test('escHtml — " 치환', () => {
  assert.equal(escHtml('say "hi"'), 'say &quot;hi&quot;');
});
test('escHtml — \' 치환', () => {
  assert.equal(escHtml("it's"), 'it&#39;s');
});
test('escHtml — 5종 혼합', () => {
  assert.equal(escHtml('<img src="x" alt=\'y\'>'), '&lt;img src=&quot;x&quot; alt=&#39;y&#39;&gt;');
});
test('escHtml — 정상 텍스트', () => {
  assert.equal(escHtml('hello world'), 'hello world');
});

// ---- fill 테스트 — XSS 페이로드 이스케이프 ----
test('fill — XSS onerror 페이로드 차단', () => {
  const result = fill('오류: {err}', { err: '<img onerror="alert(1)">' });
  assert.equal(result, '오류: &lt;img onerror=&quot;alert(1)&quot;&gt;');
  // 결과가 HTML에서 렌더되면 img 태그가 아니라 텍스트로 나타나야 함
  assert(!result.includes('<img'), 'img 태그가 텍스트화됨');
  assert(result.includes('&lt;img'), 'img가 이스케이프됨');
});
test('fill — onclick 페이로드 차단', () => {
  const result = fill('{msg}', { msg: '"><script>alert(1)</script>' });
  assert.equal(result, '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
});
test('fill — 따옴표 페이로드 차단', () => {
  // template 안의 {title}이 속성값 위치에서 치환되므로, 큰따옴표는 &quot;로 이스케이프되어 속성이 닫히지 않음
  const result = fill('title="{title}"', { title: '" onclick="alert(1)"' });
  assert.equal(result, 'title="&quot; onclick=&quot;alert(1)&quot;"');
  // 결과의 따옴표가 이스케이프되어, 원래 의도한 새 속성 주입이 불가능해짐
  assert(result.includes('&quot;'), '따옴표가 이스케이프되어 속성 주입 방지됨');
});

// ---- fill 테스트 — 정상 문구 통과 ----
test('fill — 정상 텍스트 통과', () => {
  const result = fill('오류: {err}', { err: '연결 실패' });
  assert.equal(result, '오류: 연결 실패');
});
test('fill — 숫자 값 통과', () => {
  const result = fill('시도 {count}회', { count: 5 });
  assert.equal(result, '시도 5회');
});
test('fill — null 값', () => {
  const result = fill('값: {val}', { val: null });
  // null도 escHtml로 "null"의 문자열이 되는데, 이게 의도된 동작인지 확인
  assert.equal(result, '값: null');
});
test('fill — 정의되지 않은 키 — 빈 문자열', () => {
  const result = fill('항목 {missing}', {});
  assert.equal(result, '항목 ');
});

// ---- 다중 매개변수 테스트 ----
test('fill — 여러 변수', () => {
  const result = fill('{a} 그리고 {b}', { a: '<a>', b: '&' });
  assert.equal(result, '&lt;a&gt; 그리고 &amp;');
});
test('fill — 중복된 키', () => {
  const result = fill('{x} {x}', { x: '<>' });
  assert.equal(result, '&lt;&gt; &lt;&gt;');
});

// ---- i18n 문구 형식 보존 테스트 (마크업 포함 문구) ----
// 예: "라이미와 <b>친구</b>가 되어보자!"와 같이 i18n 원문이 마크업을 포함할 수 있음.
// fill()이 i18n 문구(첫 번째 인자)는 건드리지 않고 vars 값만 이스케이프해야 함.
test('fill — i18n 문구의 마크업 보존 (예: 진하기)', () => {
  const template = '친구 <b>{name}</b>이가 말했어요: "{msg}"';
  const result = fill(template, { name: '라이미', msg: '<script>alert(1)</script>' });
  // 템플릿의 <b>는 보존되어야 하고, {msg}의 <script>는 이스케이프되어야 함
  assert(result.includes('<b>라이미</b>'), '<b> 태그가 보존됨');
  assert(result.includes('&lt;script&gt;'), 'vars의 <script>는 이스케이프됨');
});
test('fill — i18n 문구의 마크업 보존 (예: 링크)', () => {
  const template = '자세히: <a href="docs">설명</a>. 오류: {err}';
  const result = fill(template, { err: '<img src=x onerror=alert(1)>' });
  // 템플릿의 <a>는 보존, {err}는 이스케이프
  assert(result.includes('<a href="docs">설명</a>'), '<a> 태그가 보존됨');
  assert(result.includes('&lt;img'), '{err}는 이스케이프됨');
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
