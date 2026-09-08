-- 동의 기록에 사건 귀속(case_id) 추가 — 고유식별정보 동의를 사건 단위로 좁히기 위함. 멱등.
ALTER TABLE consents ADD COLUMN IF NOT EXISTS case_id integer;
