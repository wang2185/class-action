-- case_requests: AI 초기검토 + 변호사 수임 결정 컬럼 (멱등)
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS ai_review_status varchar(20) NOT NULL DEFAULT 'none';
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS ai_review text;
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS ai_reviewed_at timestamp;
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS decided_by integer REFERENCES users(id);
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS decided_at timestamp;
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS decision_reason text;
