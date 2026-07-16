#!/usr/bin/env node
/**
 * scripts/bump-version.mjs — 배포 버전 자동화 (R6)
 * index.html의 css/js ?v=N, js/app.js 내부 import의 ?v=N, sw.js의 CACHE "raim-cache-vN"을
 * 모두 통일하여 관리.
 *
 * 사용법:
 *   node scripts/bump-version.mjs       — 현재 최댓값 + 1로 모든 버전을 업데이트
 *   node scripts/bump-version.mjs --check — 정합만 검사 (CI/테스트용)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const INDEX_HTML = path.join(rootDir, 'index.html');
const APP_JS = path.join(rootDir, 'js/app.js');
const SW_JS = path.join(rootDir, 'sw.js');

const checkMode = process.argv.includes('--check');

/**
 * 파일에서 ?v=N 버전 숫자들 추출
 */
function extractVersions(content, pattern) {
  const versions = [];
  const regex = /\?v=(\d+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    versions.push(parseInt(match[1], 10));
  }
  return versions;
}

/**
 * sw.js에서 CACHE 버전 숫자 추출 (예: "raim-cache-v4" → 4)
 */
function extractCacheVersion(content) {
  const match = content.match(/const\s+CACHE\s*=\s*"raim-cache-v(\d+)"/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * sw.js의 CORE 배열 추출 (수정된 버전 검사용)
 */
function extractCoreList(content) {
  const coreMatch = content.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\];/);
  if (!coreMatch) return [];
  const coreStr = coreMatch[1];
  const paths = [];
  const lineRegex = /\s*"([^"]+)"\s*,?/g;
  let match;
  while ((match = lineRegex.exec(coreStr)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

/**
 * app.js에서 import된 로컬 모듈 경로 추출 (확장자 제외, ?v= 제외)
 */
function extractImportedModules(content) {
  const modules = [];
  const importRegex = /import\s+.*?\s+from\s+["'](.\/js\/[^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const path = match[1].split('?')[0]; // ?v= 제거
    modules.push(path);
  }
  return modules;
}

/**
 * index.html에서 참조하는 로컬 css/js 파일 추출
 */
function extractIndexReferences(content) {
  const refs = [];

  // css/styles.css 형태
  const cssRegex = /href=["']([^"']*\.css[^"']*)/g;
  let match;
  while ((match = cssRegex.exec(content)) !== null) {
    const path = match[1].split('?')[0];
    if (!path.startsWith('http')) {
      refs.push(path);
    }
  }

  // js/app.js?v=30 형태
  const jsRegex = /src=["']([^"']*\.js[^"']*)/g;
  while ((match = jsRegex.exec(content)) !== null) {
    const path = match[1].split('?')[0];
    if (!path.startsWith('http')) {
      refs.push(path);
    }
  }

  return refs;
}

/**
 * CORE 경로를 정규화 (./js/app.js 또는 js/app.js)
 */
function normalizePath(p) {
  return p.startsWith('./') ? p.substring(2) : p;
}

try {
  // 파일 읽기
  const indexContent = fs.readFileSync(INDEX_HTML, 'utf-8');
  const appContent = fs.readFileSync(APP_JS, 'utf-8');
  const swContent = fs.readFileSync(SW_JS, 'utf-8');

  // 모든 버전 추출
  const indexVersions = extractVersions(indexContent);
  const appVersions = extractVersions(appContent);
  const cacheVersion = extractCacheVersion(swContent);

  const allVersions = [...indexVersions, ...appVersions, cacheVersion].filter(v => v !== null);

  if (allVersions.length === 0) {
    console.error('ERROR: 버전 정보를 찾을 수 없습니다.');
    process.exit(1);
  }

  const maxVersion = Math.max(...allVersions);

  // --check 모드: 정합성 검사
  if (checkMode) {
    let errors = [];

    // a) index.html의 모든 로컬 js/css에 ?v= 존재
    const indexRefs = extractIndexReferences(indexContent);
    for (const ref of indexRefs) {
      if (!indexContent.includes(`${ref}?v=`)) {
        errors.push(`index.html이 참조하는 '${ref}'에 ?v=가 없습니다.`);
      }
    }

    // b) app.js가 import하는 모든 로컬 모듈에 ?v= 존재
    const importedModules = extractImportedModules(appContent);
    for (const mod of importedModules) {
      const modWithoutExt = mod + '.js';
      if (!appContent.includes(`${mod}.js?v=`)) {
        errors.push(`js/app.js의 import '${mod}.js'에 ?v=가 없습니다.`);
      }
    }

    // c) app.js가 import하는 모든 로컬 모듈이 sw.js CORE 목록에 존재
    const coreList = extractCoreList(swContent);
    for (const mod of importedModules) {
      const normalizedMod = normalizePath(mod + '.js');
      const found = coreList.some(core =>
        normalizePath(core) === normalizedMod ||
        normalizePath(core) === './' + normalizedMod
      );
      if (!found) {
        errors.push(`sw.js CORE에 '${mod}.js'이(가) 없습니다.`);
      }
    }

    // d) index.html이 참조하는 js/css가 sw.js CORE 목록에 존재
    for (const ref of indexRefs) {
      const normalizedRef = normalizePath(ref);
      const found = coreList.some(core =>
        normalizePath(core) === normalizedRef ||
        normalizePath(core) === './' + normalizedRef
      );
      if (!found) {
        errors.push(`sw.js CORE에 '${ref}'이(가) 없습니다.`);
      }
    }

    if (errors.length > 0) {
      errors.forEach(err => console.error(err));
      process.exit(1);
    }

    console.log('정합성 검사 통과: 모든 버전과 CORE 참조가 올바릅니다.');
    process.exit(0);
  }

  // 일반 모드: 버전 업데이트
  const newVersion = maxVersion + 1;
  const updateLog = [];

  // index.html 업데이트 (로그에는 실제 이전 값들을 그대로 보여준다 — 위치마다 제각각일 수 있음)
  let newIndexContent = indexContent;
  const indexVersionRegex = /(\?v=)(\d+)/g;
  const indexOlds = new Set();
  newIndexContent = newIndexContent.replace(indexVersionRegex, (match, prefix, oldVer) => {
    if (oldVer !== newVersion.toString()) indexOlds.add(oldVer);
    return prefix + newVersion;
  });
  if (indexOlds.size > 0) {
    fs.writeFileSync(INDEX_HTML, newIndexContent, 'utf-8');
    updateLog.push(`index.html: ?v=${[...indexOlds].join('·')} → ?v=${newVersion}`);
  }

  // app.js 업데이트
  let newAppContent = appContent;
  const appVersionRegex = /(\?v=)(\d+)/g;
  const appOlds = new Set();
  newAppContent = newAppContent.replace(appVersionRegex, (match, prefix, oldVer) => {
    if (oldVer !== newVersion.toString()) appOlds.add(oldVer);
    return prefix + newVersion;
  });
  if (appOlds.size > 0) {
    fs.writeFileSync(APP_JS, newAppContent, 'utf-8');
    updateLog.push(`js/app.js imports: ?v=${[...appOlds].join('·')} → ?v=${newVersion}`);
  }

  // sw.js 업데이트 (CACHE 버전만)
  let newSwContent = swContent;
  let swOld = null;
  newSwContent = newSwContent.replace(
    /const\s+CACHE\s*=\s*"raim-cache-v(\d+)"/,
    (match, oldVer) => {
      if (oldVer !== newVersion.toString()) swOld = oldVer;
      return `const CACHE = "raim-cache-v${newVersion}"`;
    }
  );
  if (swOld !== null) {
    fs.writeFileSync(SW_JS, newSwContent, 'utf-8');
    updateLog.push(`sw.js CACHE: raim-cache-v${swOld} → raim-cache-v${newVersion}`);
  }

  // 결과 출력
  updateLog.forEach(log => console.log(log));
  if (updateLog.length === 0) {
    console.log('모든 버전이 이미 일치합니다.');
  }

} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
}
