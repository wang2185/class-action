-- 관리자 콘솔 확장 (회계 LEVEL 2 · 회원 소프트삭제 · 직권완료 · 쿠폰)
-- ⚠ 운영(prod) DB는 기존에 drizzle-kit push 로 스키마가 적용된 상태이므로,
--    본 마이그레이션은 신규 테이블/컬럼만 증분 추가한다(IF NOT EXISTS 로 멱등).
--    적용: psql "$DATABASE_URL" -f drizzle/0000_admin_console_expansion.sql
--    (또는 새 환경이라면 `npm run db:push` 로 전체 스키마 동기화)

-- 1) users.deleted_at — 회원 소프트 삭제
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint

-- 2) payment_links — 쿠폰 참조 + 할인금액
ALTER TABLE "payment_links" ADD COLUMN IF NOT EXISTS "coupon_id" integer;
--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN IF NOT EXISTS "discount_amount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- 3) 수동 장부 (회계 LEVEL 2)
CREATE TABLE IF NOT EXISTS "revenue_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_date" timestamp NOT NULL,
	"direction" varchar(10) NOT NULL,
	"category" varchar(50),
	"amount" integer NOT NULL,
	"memo" text,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_entries_date_idx" ON "revenue_entries" ("entry_date");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_created_by_users_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- 4) 쿠폰 (착수금 할인코드)
CREATE TABLE IF NOT EXISTS "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"case_id" integer,
	"discount_type" varchar(10) NOT NULL,
	"discount_value" integer NOT NULL,
	"max_uses" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "coupons" ADD CONSTRAINT "coupons_case_id_cases_id_fk"
		FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
