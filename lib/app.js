const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');

const CATEGORIES = ['식비', '카페/간식', '교통', '주거/통신', '쇼핑', '문화/여가', '의료/건강', '교육', '기타'];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// 기본 보안 헤더
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// 로컬 실행 시 정적 파일 제공 (Vercel에서는 public/ 폴더를 직접 서빙)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 유틸 ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateExpense(body) {
  const errors = [];
  const spent_on = body?.spent_on;
  const item = typeof body?.item === 'string' ? body.item.trim() : '';
  const category = body?.category;
  const amount = Number(body?.amount);

  if (!isValidDate(spent_on)) errors.push('날짜 형식이 올바르지 않습니다.');
  if (!item || item.length > 100) errors.push('항목은 1~100자로 입력해 주세요.');
  if (!CATEGORIES.includes(category)) errors.push('카테고리가 올바르지 않습니다.');
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000_000) {
    errors.push('금액은 0 이상의 정수로 입력해 주세요.');
  }
  return { errors, value: { spent_on, item, category, amount } };
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------- 인증 ----------
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/session', (req, res) => res.json({ authenticated: auth.isAuthenticated(req) }));

// 아래의 모든 /api 경로는 로그인 필요
app.use('/api', auth.requireAuth);

app.get('/api/categories', (req, res) => res.json(CATEGORIES));

// ---------- 지출 CRUD ----------
// GET /api/expenses?date=YYYY-MM-DD | from=&to= | month=YYYY-MM & category=
app.get('/api/expenses', async (req, res) => {
  const { date, from, to, month, category } = req.query;
  const where = [];
  const params = [];

  if (date) {
    if (!isValidDate(date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
    params.push(date);
    where.push(`"date" = $${params.length}`);
  }
  if (from) {
    if (!isValidDate(from)) return res.status(400).json({ error: '시작일 형식이 올바르지 않습니다.' });
    params.push(from);
    where.push(`"date" >= $${params.length}`);
  }
  if (to) {
    if (!isValidDate(to)) return res.status(400).json({ error: '종료일 형식이 올바르지 않습니다.' });
    params.push(to);
    where.push(`"date" <= $${params.length}`);
  }
  if (month) {
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다.' });
    params.push(month);
    where.push(`to_char("date", 'YYYY-MM') = $${params.length}`);
  }
  if (category) {
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: '카테고리가 올바르지 않습니다.' });
    params.push(category);
    where.push(`category = $${params.length}`);
  }

  const sql = `
    SELECT id, to_char("date", 'YYYY-MM-DD') AS spent_on, item, category, amount
    FROM expenses
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY "date" DESC, id DESC
    LIMIT 1000`;
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

app.post('/api/expenses', async (req, res) => {
  const { errors, value } = validateExpense(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const { rows } = await db.query(
    `INSERT INTO expenses ("date", item, category, amount)
     VALUES ($1, $2, $3, $4)
     RETURNING id, to_char("date", 'YYYY-MM-DD') AS spent_on, item, category, amount`,
    [value.spent_on, value.item, value.category, value.amount]
  );
  res.status(201).json(rows[0]);
});

app.put('/api/expenses/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 ID입니다.' });
  const { errors, value } = validateExpense(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const { rows } = await db.query(
    `UPDATE expenses
     SET "date" = $1, item = $2, category = $3, amount = $4
     WHERE id = $5
     RETURNING id, to_char("date", 'YYYY-MM-DD') AS spent_on, item, category, amount`,
    [value.spent_on, value.item, value.category, value.amount, id]
  );
  if (!rows.length) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json(rows[0]);
});

app.delete('/api/expenses/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 ID입니다.' });
  const { rowCount } = await db.query('DELETE FROM expenses WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.status(204).end();
});

// ---------- 통계 ----------
// 월별 합계: GET /api/summary/monthly?year=YYYY
app.get('/api/summary/monthly', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  if (year < 1900 || year > 2999) return res.status(400).json({ error: '연도가 올바르지 않습니다.' });

  const { rows } = await db.query(
    `SELECT EXTRACT(MONTH FROM "date")::int AS month,
            SUM(amount)::bigint AS total,
            COUNT(*)::int AS count
     FROM expenses
     WHERE EXTRACT(YEAR FROM "date") = $1
     GROUP BY 1 ORDER BY 1`,
    [year]
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(i + 1);
    return { month: i + 1, total: r ? Number(r.total) : 0, count: r ? r.count : 0 };
  });
  res.json({ year, total: months.reduce((s, m) => s + m.total, 0), months });
});

// 카테고리별 합계: GET /api/summary/category?month=YYYY-MM (생략 시 전체 기간)
app.get('/api/summary/category', async (req, res) => {
  const { month } = req.query;
  const params = [];
  let where = '';
  if (month) {
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다.' });
    params.push(month);
    where = `WHERE to_char("date", 'YYYY-MM') = $1`;
  }
  const { rows } = await db.query(
    `SELECT category, SUM(amount)::bigint AS total, COUNT(*)::int AS count
     FROM expenses ${where}
     GROUP BY category ORDER BY total DESC`,
    params
  );
  const categories = rows.map((r) => ({ category: r.category, total: Number(r.total), count: r.count }));
  res.json({ month: month || null, total: categories.reduce((s, c) => s + c.total, 0), categories });
});

app.use('/api', (req, res) => res.status(404).json({ error: '존재하지 않는 API입니다.' }));

// 에러 핸들러: 내부 정보(DB 접속 정보 등)는 클라이언트에 노출하지 않음
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
  }
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

module.exports = app;
