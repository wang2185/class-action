-- 사건 요청(제보) 테이블 — shared/schema.ts caseRequests 와 1:1. 멱등(IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS case_requests (
  id serial PRIMARY KEY,
  name varchar(100) NOT NULL,
  phone varchar(20) NOT NULL,
  email varchar(255),
  category varchar(100),
  title varchar(500) NOT NULL,
  opponent varchar(500),
  content text NOT NULL,
  headcount varchar(100),
  damage_scale varchar(100),
  status varchar(30) NOT NULL DEFAULT 'new',
  admin_note text,
  user_id integer,
  ip_address varchar(45),
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS case_requests_status_created_idx ON case_requests (status, created_at DESC);
