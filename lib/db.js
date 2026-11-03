const { Pool } = require('pg');

let pool;
let schemaReady;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS expenses (
    id        BIGSERIAL PRIMARY KEY,
    "date"    DATE    NOT NULL,
    item      TEXT    NOT NULL,
    category  TEXT    NOT NULL,
    amount    INTEGER NOT NULL CHECK (amount >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses ("date");
`;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
    }
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Neon은 SSL 필수, 로컬 테스트용 Postgres만 예외
      ssl: isLocal ? false : { rejectUnauthorized: true },
      // 서버리스 환경에서는 연결 수를 작게 유지
      max: 3,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

// 콜드 스타트마다 한 번만 테이블 존재를 보장
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(SCHEMA_SQL).catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = { query, ensureSchema, getPool, SCHEMA_SQL };
