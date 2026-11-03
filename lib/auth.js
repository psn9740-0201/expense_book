const crypto = require('crypto');

const COOKIE_NAME = 'eb_session';
const SESSION_DAYS = 7;

// 서명 키: SESSION_SECRET이 있으면 사용, 없으면 APP_PASSWORD에서 파생
// (비밀번호를 바꾸면 기존 세션이 모두 무효화됨)
function signingKey() {
  const base = process.env.SESSION_SECRET || process.env.APP_PASSWORD || '';
  return crypto.createHash('sha256').update('expense-book:' + base).digest();
}

function sign(value) {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createToken() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(payload))) return false;
  return Number(payload) > Date.now();
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function cookieOptions(req) {
  const secure = process.env.NODE_ENV === 'production' || req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

// 간단한 로그인 시도 제한 (인스턴스 메모리 기준)
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) return false;
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) attempts.set(ip, { start: now, count: 1 });
  else rec.count += 1;
}

function login(req, res) {
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: '서버에 APP_PASSWORD가 설정되지 않았습니다.' });
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  const password = req.body?.password;
  if (typeof password !== 'string' || !safeEqual(password, process.env.APP_PASSWORD)) {
    recordFailure(ip);
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  attempts.delete(ip);
  res.cookie(COOKIE_NAME, createToken(), cookieOptions(req));
  res.json({ ok: true });
}

function logout(req, res) {
  const { maxAge, ...opts } = cookieOptions(req);
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ ok: true });
}

function isAuthenticated(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
}

module.exports = { login, logout, requireAuth, isAuthenticated };
