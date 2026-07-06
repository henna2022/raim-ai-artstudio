-- events 테이블: 방문·모드선택·생성 성공/차단/오류 이벤트 로깅 (개인정보 없음)
-- 적용: Supabase SQL Editor에서 아래 전체를 실행하세요.

create table if not exists events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id uuid,
  type text not null check (type in
    ('visit','mode_select','generate_ok','generate_blocked','generate_error')),
  mode text,          -- 'blocks' | 'chat' | null
  lang text,          -- 'ko' | 'en' | null
  detail text         -- 차단 사유 'banned'|'copyright', 오류 요약(100자 이내). 프롬프트 원문 금지
);

create index if not exists events_created_at_idx on events (created_at);
