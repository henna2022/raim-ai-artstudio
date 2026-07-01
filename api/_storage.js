// 공개 이미지 저장소 추상화
//  - R2 환경변수가 모두 있으면 Cloudflare R2로 업로드(egress 무료), 공개 URL은 R2_PUBLIC_BASE_URL 기반
//  - 하나라도 없으면 기존 Supabase Storage로 업로드(폴백) → 배포만 하고 R2 설정 전이어도 안 깨짐
// 통계/메타데이터(generations 테이블)는 이 파일과 무관하게 계속 Supabase에 남습니다.
import { createClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL; // 예: https://pub-xxxx.r2.dev 또는 https://img.example.com

// R2 관련 값이 모두 있어야 R2 경로 사용, 아니면 Supabase 폴백
export const useR2 = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE_URL
);

// --- Supabase (폴백 업로드 + 오래된 파일 정리) ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const SUPA_BUCKET = process.env.SUPABASE_BUCKET || 'artworks';

// --- R2 (aws4fetch로 S3 호환 요청에 SigV4 서명) ---
const r2 = useR2
  ? new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' })
  : null;

// 파일 업로드 후 공개 URL 반환. 실패 시 throw.
export async function uploadPublic(filename, buffer, contentType) {
  if (useR2) {
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${filename}`;
    const resp = await r2.fetch(endpoint, { method: 'PUT', body: buffer, headers: { 'Content-Type': contentType } });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`R2 업로드 실패 (${resp.status}) ${text}`.trim());
    }
    return `${R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${filename}`;
  }

  const { error } = await supabase.storage.from(SUPA_BUCKET).upload(filename, buffer, { contentType });
  if (error) throw new Error(error.message);
  return supabase.storage.from(SUPA_BUCKET).getPublicUrl(filename).data.publicUrl;
}

// 오래된 파일 정리(cutoffMs 이전 생성분 삭제).
// R2 사용 시에는 대시보드의 Object lifecycle 규칙으로 자동 삭제하는 것을 권장하므로 no-op.
export async function cleanupOld(cutoffMs) {
  if (useR2) return;
  try {
    const { data: files } = await supabase.storage.from(SUPA_BUCKET).list('', { limit: 1000 });
    const old = (files || [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoffMs)
      .map((f) => f.name);
    if (old.length) await supabase.storage.from(SUPA_BUCKET).remove(old);
  } catch (e) {}
}
