-- Neon SQL Editor에서 직접 실행해도 됩니다. (앱 실행 시 자동 생성도 됨)
CREATE TABLE IF NOT EXISTS expenses (
  id        BIGSERIAL PRIMARY KEY,
  "date"    DATE    NOT NULL,
  item      TEXT    NOT NULL,
  category  TEXT    NOT NULL,
  amount    INTEGER NOT NULL CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses ("date");
