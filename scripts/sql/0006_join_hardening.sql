-- 참여(join) 신뢰경계 강화. 멱등.
-- 1) 동시 참여 경합 차단: 사건×사용자 유니크(중복 참여·중복 카운트 방지).
CREATE UNIQUE INDEX IF NOT EXISTS case_parties_case_user_uniq ON case_parties (case_id, user_id);
-- 2) 피해 금액 int4(최대 21.4억) 초과 대비 bigint 로 확장.
ALTER TABLE case_parties ALTER COLUMN damage_amount TYPE bigint;
