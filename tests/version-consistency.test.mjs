// tests/version-consistency.test.mjs — R6(배포 버전 자동화) 단위 테스트
// scripts/bump-version.mjs --check 를 호출해 버전 정합성을 검증한다.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'scripts/bump-version.mjs');

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

// --check 모드를 spawnSync로 실행해 exit code 0 확인
test('version consistency --check 통과', () => {
  const result = spawnSync('node', [scriptPath, '--check'], {
    cwd: rootDir,
    stdio: 'pipe'
  });

  assert.equal(result.status, 0, `--check failed with exit code ${result.status}`);
});

console.log(failures ? `\n${failures}개 테스트 실패` : '\n모든 테스트 통과');
