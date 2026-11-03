// 테이블 생성: npm run db:init
require('dotenv').config();
const db = require('../lib/db');

db.ensureSchema()
  .then(() => {
    console.log('expenses 테이블 준비 완료');
    return db.getPool().end();
  })
  .catch((err) => {
    console.error('DB 초기화 실패:', err.message);
    process.exit(1);
  });
