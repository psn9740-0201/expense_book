// 로컬 개발 서버
require('dotenv').config();
const app = require('./lib/app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`가계부 서버 실행 중: http://localhost:${PORT}`);
});
