// 손작성 SQL 마이그레이션 적용기 — node scripts/apply-sql.mjs <file.sql>
// DATABASE_URL(.env) 로컬 Postgres에 idempotent DDL을 적용. drizzle-kit 대화형 회피용.
import pg from "pg";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 미설정");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log("applied:", file);
} finally {
  await client.end();
}
