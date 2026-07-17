// qr-mini.js — QR 코드 생성 순수 모듈 (R8, 외부 라이브러리 없음 — xlsx-mini.js와 같은 원칙)
// 결과 화면 QR을 api.qrserver.com 없이 로컬에서 그리기 위한 최소 구현.
//   지원 범위: byte 모드(UTF-8) · 에러정정 레벨 M · 버전 1~10(최대 213바이트) — 이 앱의
//   용도(생성물 URL ~100자)에 충분하고, 그 이상은 명시적으로 throw한다.
// 검증: tests/qr.test.mjs — 구조 검사 + OpenCV(cv2) 실제 디코딩 왕복(사용 가능 환경에서).
// 참고: ISO/IEC 18004. 구현 뼈대는 공개 레퍼런스(project-nayuki qrcodegen)의 알고리즘 순서를 따랐다.

// ---------- GF(256) 산술 (RS 에러정정용, 기약다항식 0x11d) ----------
const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 510; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

// RS 생성다항식 (모닉, 최고차항부터): (x-α^0)(x-α^1)...(x-α^(deg-1))
function rsGenPoly(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i]); // ×α^i 항
      next[j + 1] ^= poly[j];            // ×x 항
    }
    poly = next;
  }
  return poly.reverse(); // [1, g1, ..., g_deg] 꼴(최고차 먼저)로 뒤집기
}

// 데이터 코드워드에 대한 RS 에러정정 코드워드 계산
function rsEC(data, degree) {
  const gen = rsGenPoly(degree);
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let j = 0; j < degree; j++) res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return res;
}

// ---------- 버전별 상수 (에러정정 레벨 M 고정) ----------
// [총 데이터 코드워드, 블록당 EC 코드워드, 그룹1 블록수, 그룹1 데이터길이, 그룹2 블록수, 그룹2 데이터길이]
const ECT = {
  1: [16, 10, 1, 16, 0, 0],
  2: [28, 16, 1, 28, 0, 0],
  3: [44, 26, 1, 44, 0, 0],
  4: [64, 18, 2, 32, 0, 0],
  5: [86, 24, 2, 43, 0, 0],
  6: [108, 16, 4, 27, 0, 0],
  7: [124, 18, 4, 31, 0, 0],
  8: [154, 22, 2, 38, 2, 39],
  9: [182, 22, 3, 36, 2, 37],
  10: [216, 26, 4, 43, 1, 44],
};
// 정렬 패턴 중심 좌표
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const MAX_VERSION = 10;

// byte 모드 수용량(바이트): 데이터비트 - 모드지시자4 - 글자수지시자(v1~9는 8, v10은 16)
function byteCapacity(version) {
  const dataBits = ECT[version][0] * 8;
  const ccBits = version >= 10 ? 16 : 8;
  return Math.floor((dataBits - 4 - ccBits) / 8);
}

// ---------- 비트버퍼 ----------
function makeBits() {
  const bits = [];
  return {
    bits,
    push(val, len) { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); },
  };
}

// ---------- 인코딩: 텍스트 → 최종 코드워드(데이터+EC 인터리브) ----------
function encodeCodewords(text) {
  const bytes = new TextEncoder().encode(String(text));
  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (bytes.length <= byteCapacity(v)) { version = v; break; }
  }
  if (!version) throw new Error(`qr-mini: 데이터가 너무 깁니다(${bytes.length}B > ${byteCapacity(MAX_VERSION)}B)`);

  const [dataCW, ecLen, b1, d1, b2, d2] = ECT[version];
  const bb = makeBits();
  bb.push(0b0100, 4);                                  // 모드: byte
  bb.push(bytes.length, version >= 10 ? 16 : 8);       // 글자수 지시자
  for (const b of bytes) bb.push(b, 8);
  // 종단자(최대 4비트) + 바이트 정렬 + 패딩(0xEC/0x11 교대)
  const capBits = dataCW * 8;
  bb.push(0, Math.min(4, capBits - bb.bits.length));
  if (bb.bits.length % 8 !== 0) bb.push(0, 8 - (bb.bits.length % 8));
  const data = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    data.push(v);
  }
  for (let pad = 0xEC; data.length < dataCW; pad ^= 0xEC ^ 0x11) data.push(pad);

  // 블록 분할 → 블록별 EC → 인터리브
  const blocks = [];
  let off = 0;
  for (let i = 0; i < b1; i++) { blocks.push(data.slice(off, off + d1)); off += d1; }
  for (let i = 0; i < b2; i++) { blocks.push(data.slice(off, off + d2)); off += d2; }
  const ecs = blocks.map((blk) => rsEC(blk, ecLen));
  const out = [];
  const maxD = Math.max(d1, b2 ? d2 : 0);
  for (let i = 0; i < maxD; i++) for (const blk of blocks) if (i < blk.length) out.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const ec of ecs) out.push(ec[i]);
  return { version, codewords: out };
}

// ---------- 매트릭스 구성 ----------
function buildMatrix(version, codewords) {
  const size = 17 + 4 * version;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));   // 모듈 색(true=어두움)
  const fun = Array.from({ length: size }, () => new Array(size).fill(false));   // 기능 패턴 여부

  const set = (r, c, dark) => { mod[r][c] = dark; fun[r][c] = true; };

  // 파인더(3곳) + 분리자
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      set(rr, cc, d !== 2 && d !== 4);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // 타이밍 패턴
  for (let i = 8; i < size - 8; i++) {
    if (!fun[6][i]) set(6, i, i % 2 === 0);
    if (!fun[i][6]) set(i, 6, i % 2 === 0);
  }

  // 정렬 패턴 — 파인더가 있는 세 모서리 조합만 제외하고 전부 그린다.
  // (타이밍 라인 위 중심도 그려야 함 — 값이 타이밍과 일치해 겹쳐 그려도 무해.
  //  이전에 "중심이 기능 셀이면 skip"으로 구현했다가 v7+ 디코딩이 깨졌던 버그 자리.)
  const centers = ALIGN[version];
  const last = centers.length - 1;
  for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
    const r = centers[i], c = centers[j];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }

  // 포맷 정보 자리 예약(값은 마스크 결정 후 기록)
  for (let i = 0; i <= 8; i++) {
    if (!fun[8][i]) set(8, i, false);
    if (!fun[i][8]) set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!fun[8][size - 1 - i]) set(8, size - 1 - i, false);
    if (!fun[size - 1 - i][8]) set(size - 1 - i, 8, false);
  }
  set(size - 8, 8, true); // 다크 모듈

  // 버전 정보(v7+): 18비트 BCH
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  // 데이터 배치: 오른쪽부터 2열씩 지그재그(6열은 건너뜀)
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!fun[r][c] && bitIdx < totalBits) {
          mod[r][c] = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
      }
    }
  }
  return { size, mod, fun };
}

// 마스크 조건 (true면 반전)
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m, maskId) {
  const f = MASKS[maskId];
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.fun[r][c] && f(r, c)) m.mod[r][c] = !m.mod[r][c];
  }
}

// 포맷 정보 기록 (레벨 M=0b00 + 마스크 id, BCH(15,5) + 고정 XOR)
function drawFormat(m, maskId) {
  const data = (0b00 << 3) | maskId;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  const size = m.size;
  const put = (r, c, d) => { m.mod[r][c] = d; m.fun[r][c] = true; };
  // 첫 사본(좌상단): 비트 0~5는 8열 위쪽(행 0~5), 6~8은 모서리, 9~14는 8행 왼쪽(열 5~0)
  for (let i = 0; i <= 5; i++) put(i, 8, bit(i));
  put(7, 8, bit(6));
  put(8, 8, bit(7));
  put(8, 7, bit(8));
  for (let i = 9; i < 15; i++) put(8, 14 - i, bit(i));
  // 두 번째 사본: 비트 0~7은 8행의 오른쪽 끝에서 왼쪽으로, 비트 8~14는 8열의 아래쪽으로
  for (let i = 0; i < 8; i++) put(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) put(size - 15 + i, 8, bit(i));
  put(size - 8, 8, true); // 다크 모듈은 항상 어두움
}

// 마스크 페널티(N1~N4)
function penalty(m) {
  const { size, mod } = m;
  let score = 0;
  // N1: 같은 색 5연속 이상 (행/열)
  for (let r = 0; r < size; r++) {
    for (const get of [(i) => mod[r][i], (i) => mod[i][r]]) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && get(i) === get(i - 1)) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
    }
  }
  // N2: 2x2 동일 색 블록
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = mod[r][c];
    if (v === mod[r][c + 1] && v === mod[r + 1][c] && v === mod[r + 1][c + 1]) score += 3;
  }
  // N3: 파인더 유사 패턴(1011101 + 한쪽 4칸 밝음)
  const P1 = [true, false, true, true, true, false, true, false, false, false, false];
  const P2 = [false, false, false, false, true, false, true, true, true, false, true];
  const match = (get, i, pat) => pat.every((p, k) => get(i + k) === p);
  for (let r = 0; r < size; r++) {
    for (const get of [(i) => mod[r][i], (i) => mod[i][r]]) {
      for (let i = 0; i <= size - 11; i++) {
        if (match(get, i, P1) || match(get, i, P2)) score += 40;
      }
    }
  }
  // N4: 어두운 모듈 비율 편차
  let dark = 0;
  for (const row of mod) for (const v of row) if (v) dark++;
  const total = size * size;
  const k = Math.floor(Math.abs(dark * 100 - total * 50) / (total * 5));
  score += 10 * k;
  return score;
}

/**
 * QR 매트릭스 생성 — 최적 마스크 자동 선택.
 * @param {string} text
 * @returns {{size:number, modules:boolean[][], version:number, mask:number}}
 */
export function qrMatrix(text) {
  const { version, codewords } = encodeCodewords(text);
  let best = null;
  for (let maskId = 0; maskId < 8; maskId++) {
    const m = buildMatrix(version, codewords);
    drawFormat(m, maskId);   // 포맷을 먼저 기록해 fun 지도 확정
    applyMask(m, maskId);
    const p = penalty(m);
    if (!best || p < best.p) best = { m, p, maskId };
  }
  return { size: best.m.size, modules: best.m.mod, version, mask: best.maskId };
}

/**
 * QR SVG 문자열 생성(밝음=흰색, 어두움=검정, 여백 quiet zone 포함).
 * @param {string} text
 * @param {{margin?:number}} [opts]
 */
export function qrSvg(text, opts) {
  const margin = (opts && opts.margin != null) ? opts.margin : 4;
  const { size, modules } = qrMatrix(text);
  const dim = size + margin * 2;
  let path = "";
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (modules[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
