-- 간편인증(소셜 로그인): users.password nullable + social_accounts 테이블. 멱등.
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

CREATE TABLE IF NOT EXISTS social_accounts (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  provider varchar(20) NOT NULL,
  provider_user_id varchar(255) NOT NULL,
  email varchar(255),
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_provider_uid_idx ON social_accounts (provider, provider_user_id);
CREATE INDEX IF NOT EXISTS social_accounts_user_idx ON social_accounts (user_id);
