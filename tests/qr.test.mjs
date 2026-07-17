// tests/qr.test.mjs — R8(js/qr-mini.js) 검증
// 1) 구조 테스트: 파인더·타이밍·다크 모듈·버전 선택·용량 경계 (환경 무관, 항상 실행)
// 2) 실해독 왕복: 생성한 매트릭스를 OpenCV(cv2)로 디코딩해 원문 일치 확인
//    (cv2가 없는 환경에서는 왕복만 건너뛰고 경고 출력 — 구조 테스트는 그대로 수행)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { qrMatrix, qrSvg } from '../js/qr-mini.js';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) {
    failures++; process.exitCode = 1;
    console.error('  FAIL - ' + name);
    console.error('    ' + ((e && e.stack) || e));
  }
}

// ---- 구조 테스트 ----
test('버전 선택 — 길이별 최소 버전', () => {
  assert.equal(qrMatrix('a').version, 1);                    // 1B → v1(≤14)
  assert.equal(qrMatrix('x'.repeat(14)).version, 1);         // 경계: v1 최대
  assert.equal(qrMatrix('x'.repeat(15)).version, 2);         // v1 초과 → v2
  assert.equal(qrMatrix('x'.repeat(213)).version, 10);       // v10 최대
});
test('용량 초과 시 throw', () => {
  assert.throws(() => qrMatrix('x'.repeat(214)), /너무 깁니다/);
});
test('크기 = 17 + 4×버전', () => {
  for (const n of [1, 30, 100, 200]) {
    const m = qrMatrix('x'.repeat(n));
    assert.equal(m.size, 17 + 4 * m.version);
  }
});
test('파인더 패턴 — 세 모서리 7×7', () => {
  const { size, modules } = qrMatrix('finder check');
  const ring = (r0, c0) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      assert.equal(modules[r0 + r][c0 + c], d !== 2, `finder(${r0},${c0}) 내부 (${r},${c})`);
    }
  };
  ring(0, 0); ring(0, size - 7); ring(size - 7, 0);
});
test('타이밍 패턴 — 6행/6열 교대', () => {
  const { size, modules } = qrMatrix('timing check');
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6][i], i % 2 === 0, `행 타이밍 ${i}`);
    assert.equal(modules[i][6], i % 2 === 0, `열 타이밍 ${i}`);
  }
});
test('다크 모듈 — (4v+9, 8) 항상 어두움', () => {
  for (const n of [1, 100]) {
    const m = qrMatrix('x'.repeat(n));
    assert.equal(m.modules[4 * m.version + 9][8], true);
  }
});
test('qrSvg — 마크업 형태와 quiet zone', () => {
  const svg = qrSvg('https://example.com');
  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 (\d+) \1"/); // 정사각
  const m = qrMatrix('https://example.com');
  assert.ok(svg.includes(`0 0 ${m.size + 8} ${m.size + 8}`), '기본 여백 4모듈');
});

// ---- 실해독 왕복 (cv2 있을 때만) ----
const hasCv2 = spawnSync('python3', ['-c', 'import cv2'], { encoding: 'utf8' }).status === 0;
if (!hasCv2) {
  console.log('  skip - cv2 왕복(이 환경에 python3+opencv 없음 — 구조 테스트만 수행됨)');
} else {
  const PY = `
import sys, numpy as np, cv2
lines = sys.stdin.read().split()
size = int(lines[0]); rows = lines[1:1+size]
m = np.array([[1 if ch=='1' else 0 for ch in row] for row in rows], dtype=np.uint8)
img = (1-m)*255
S,Q = 10,4
img = np.kron(img, np.ones((S,S),dtype=np.uint8))
img = cv2.copyMakeBorder(img, Q*S,Q*S,Q*S,Q*S, cv2.BORDER_CONSTANT, value=255)
data,_,_ = cv2.QRCodeDetector().detectAndDecode(img)
sys.stdout.write(data if data else "<<DECODE_FAIL>>")
`;
  const roundTrip = (text) => {
    const m = qrMatrix(text);
    const input = m.size + '\n' + m.modules.map((r) => r.map((v) => v ? 1 : 0).join('')).join('\n');
    const r = spawnSync('python3', ['-c', PY], { input, encoding: 'utf8' });
    return { decoded: r.stdout, version: m.version };
  };
  const cases = [
    'HELLO',
    'https://example.com/art-123.webp',
    'https://pub-1234567890abcdef.r2.dev/art-1721234567890-abc123.webp', // 실제 URL 형태
    'x'.repeat(150),   // v8 — 불균등 블록 그룹 + 버전 정보
    'z'.repeat(213),   // v10 최대 — 16비트 글자수 지시자
    '안녕하세요 라이미! 한글 UTF-8 왕복.',
  ];
  for (const t of cases) {
    test(`cv2 실해독 왕복 — len ${t.length}`, () => {
      const { decoded, version } = roundTrip(t);
      assert.equal(decoded, t, `v${version} 디코딩 불일치`);
    });
  }
}

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
