// 생성된 그림 우측 하단에 서울라임 흰색 로고를 작게 합성한다.
// 흰 로고가 밝은 파스텔 배경에서도 보이도록 뒤에 부드러운 다크 글로우(외곽 광)를 깐다.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const LOGO_URL = new URL('../assets/seoulraim_logo_white.png', import.meta.url);

export async function addLogo(imageBuffer) {
  const base = sharp(imageBuffer);
  const meta = await base.metadata();
  const W = meta.width || 1024;
  const H = meta.height || 1024;

  // 로고를 그림 너비의 약 15% 폭으로 축소
  const logoRaw = await readFile(LOGO_URL);
  const targetW = Math.round(W * 0.15);
  const logo = await sharp(logoRaw).resize({ width: targetW }).png().toBuffer();
  const lMeta = await sharp(logo).metadata();
  const lw = lMeta.width, lh = lMeta.height;

  const pad = Math.round(targetW * 0.14);          // 글로우가 번질 여백
  const blurSigma = Math.max(2, Math.round(targetW * 0.06));
  const margin = Math.max(Math.round(W * 0.028), pad + 2); // 모서리 여백(글로우가 잘리지 않게)
  const left0 = W - lw - margin;
  const top0 = H - lh - margin;

  // 글로우: 로고에 투명 여백을 더해 블러 → RGB를 검정으로, 알파를 낮춰 부드러운 그림자처럼
  const padded = await sharp(logo)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(blurSigma)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = padded;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;        // 검정 실루엣
    data[i + 3] = Math.round(data[i + 3] * 0.55);          // 반투명
  }
  const glow = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();

  return base
    .composite([
      { input: glow, top: top0 - pad, left: left0 - pad },
      { input: logo, top: top0, left: left0 },
    ])
    .png()
    .toBuffer();
}
