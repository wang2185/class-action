-- 사건 요청: 사건 구조(다수 원고 vs 다수 상대방) + 예상 상대방 수. 멱등.
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS case_structure varchar(20);
ALTER TABLE case_requests ADD COLUMN IF NOT EXISTS opponent_count varchar(100);
