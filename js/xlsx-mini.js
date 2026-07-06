// 초경량 XLSX 생성기 (외부 라이브러리 없음)
// 진짜 .xlsx(= 무압축 ZIP + 최소 XML 파트)를 브라우저에서 바로 만들어 다운로드한다.
// - 여러 시트 지원, UTF-8(한글) 안전, 오프라인 PWA에서도 동작.
// 사용법:
//   downloadXlsx("파일명.xlsx", [{ name: "시트명", rows: [["헤더", ...], [값, ...]] }])

// ---- CRC32 (ZIP 엔트리마다 필요) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- XML 이스케이프 ----
function xmlEsc(v) {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""); // XML에서 금지된 제어문자 제거
}

// 0→A, 25→Z, 26→AA ... 열 인덱스를 엑셀 열 문자로
function colLetter(i) {
  let s = "";
  i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = ((i - m) / 26) | 0; }
  return s;
}

const enc = new TextEncoder();
const isNum = (v) => typeof v === "number" && isFinite(v);

// ---- 워크시트 XML ----
function sheetXml(rows) {
  let body = "";
  rows.forEach((row, r) => {
    const cells = (row || []).map((v, c) => {
      const ref = colLetter(c) + (r + 1);
      if (v === null || v === undefined || v === "") return "";
      if (isNum(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("");
    body += `<row r="${r + 1}">${cells}</row>`;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`;
}

// 엑셀 시트명 규칙(31자 이하, 금지문자 제거, 공백 금지)
function safeSheetName(name, idx) {
  let n = String(name || "").replace(/[\[\]\*\?\/\\:]/g, " ").trim().slice(0, 31);
  return n || `Sheet${idx + 1}`;
}

// ---- 워크북 파트들 조립 ----
function buildParts(sheets) {
  const names = sheets.map((s, i) => safeSheetName(s.name, i));
  const parts = {};

  parts["[Content_Types].xml"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("") +
    '</Types>';

  parts["_rels/.rels"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  parts["xl/workbook.xml"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    '</sheets></workbook>';

  parts["xl/_rels/workbook.xml.rels"] =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ).join("") +
    '</Relationships>';

  sheets.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows || []);
  });

  return parts;
}

// ---- 무압축(store) ZIP 작성 ----
function zip(parts) {
  const files = Object.keys(parts).map((name) => ({
    nameBytes: enc.encode(name),
    data: enc.encode(parts[name]),
  }));

  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const DOS_TIME = 0, DOS_DATE = 0x21; // 1980-01-01, 무의미한 고정값(재현성)

  for (const f of files) {
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = [].concat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),   // 시그니처, version, flags(UTF-8), method(store)
      u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(size), u32(size),
      u16(f.nameBytes.length), u16(0)
    );
    chunks.push(new Uint8Array(local), f.nameBytes, f.data);

    central.push([].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(size), u32(size),
      u16(f.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset)
    ));
    central.push(f.nameBytes);

    offset += local.length + f.nameBytes.length + f.data.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (let i = 0; i < central.length; i += 2) {
    const rec = central[i], nameBytes = central[i + 1];
    chunks.push(new Uint8Array(rec), nameBytes);
    cdSize += rec.length + nameBytes.length;
  }

  const eocd = [].concat(
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(cdSize), u32(cdStart), u16(0)
  );
  chunks.push(new Uint8Array(eocd));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// 시트 배열 → xlsx 바이트(Uint8Array). Node 검증용으로도 재사용 가능.
export function xlsxBytes(sheets) {
  return zip(buildParts(sheets));
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// 홈 화면에 설치된 standalone PWA인지(특히 iOS/iPadOS 키오스크)
function isStandalone() {
  if (typeof navigator !== "undefined" && navigator.standalone === true) return true; // iOS Safari
  return typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
}

// <a download> / 새 창 폴백. standalone에서는 다운로드 매니저가 없어 새 창으로 열어 저장을 유도.
function triggerDownload(bytes, filename, standalone) {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
  const a = document.createElement("a");
  if ("download" in a && !standalone) {
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  } else {
    window.open(url, "_blank"); // standalone·구형: 브라우저 탭에서 열어 저장/공유 가능하게
  }
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// 브라우저에서 엑셀 파일 다운로드 실행
// - 데스크톱/모바일 Safari 탭: <a download>로 바로 저장
// - 설치형 iOS/iPadOS PWA(키오스크): 다운로드 매니저가 없으므로 공유 시트(파일에 저장 등) 우선
export function downloadXlsx(filename, sheets) {
  const bytes = xlsxBytes(sheets);
  const standalone = isStandalone();
  // 설치형 PWA에서는 파일 공유(Web Share)로 '파일에 저장'을 열어준다. (사용자 제스처 안에서 동기 호출)
  if (standalone && typeof File === "function" && typeof navigator !== "undefined" && navigator.canShare) {
    try {
      const file = new File([bytes], filename, { type: XLSX_TYPE });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: filename })
          .catch(() => triggerDownload(bytes, filename, standalone)); // 취소·미지원 시 폴백
        return;
      }
    } catch (_) { /* File/share 미지원 → 아래 폴백 */ }
  }
  triggerDownload(bytes, filename, standalone);
}
