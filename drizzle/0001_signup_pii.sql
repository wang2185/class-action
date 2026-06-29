-- 회원 가입 개인정보 수집 (생년월일 · 배송지주소)
-- ⚠ 운영(prod) DB는 기존에 drizzle-kit push 로 스키마가 적용된 상태이므로,
--    본 마이그레이션은 신규 컬럼만 증분 추가한다(IF NOT EXISTS 로 멱등).
--    적용: psql "$DATABASE_URL" -f drizzle/0001_signup_pii.sql
--    (또는 새 환경이라면 `npm run db:push` 로 전체 스키마 동기화)
-- 컬럼은 모두 NULL 허용 — 소셜/기존 가입 계정이 깨지지 않도록 한다.
--    (이메일 가입 폼에서만 필수 입력을 강제)

-- users.birth_date — 생년월일 'YYYY-MM-DD'
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_date" varchar(10);
--> statement-breakpoint

-- users.postal_code — 배송지 우편번호
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postal_code" varchar(10);
--> statement-breakpoint

-- users.address_line1 — 배송지 기본주소(도로명/지번)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_line1" varchar(255);
--> statement-breakpoint

-- users.address_line2 — 배송지 상세주소
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address_line2" varchar(255);
