// Vercel 서버리스 함수 진입점
const app = require('../lib/app');

// rewrite로 /api 하나에 모인 요청의 원래 경로(/api/...)를 복원
module.exports = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('__path');
  if (path !== null) {
    url.searchParams.delete('__path');
    req.url = '/api/' + path.replace(/^\/+/, '') + url.search;
  }
  return app(req, res);
};
