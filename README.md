# 나의 가계부

Express + Neon PostgreSQL 기반 개인 가계부입니다. Vercel에 배포할 수 있습니다.

## 기능
- 지출 추가 / 조회 / 수정 / 삭제 (날짜, 항목, 카테고리, 금액)
- 날짜별 검색 (특정 날짜, 기간, 월 + 카테고리 필터)
- 월별 지출 합계 (연도별 12개월 막대그래프)
- 카테고리별 지출 합계 및 막대그래프
- 비밀번호 로그인 (`APP_PASSWORD`, HttpOnly 서명 쿠키, 7일 유지)

## 로컬 실행
1. [Neon](https://neon.tech)에서 프로젝트를 만들고 Connection string을 복사합니다.
2. `.env` 파일에 값을 채웁니다.
   ```
   DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
   APP_PASSWORD=원하는비밀번호
   ```
3. 실행
   ```bash
   npm install
   npm run db:init   # (선택) 테이블 생성 – 첫 요청 시 자동 생성도 됨
   npm start         # http://localhost:3000
   ```

## Vercel 배포
1. GitHub에 저장소를 만들고 push 합니다. (`.env`는 `.gitignore`에 포함되어 올라가지 않습니다)
2. Vercel에서 **Add New → Project**로 저장소를 가져옵니다. (Framework Preset: Other, 설정 변경 불필요)
3. **Settings → Environment Variables**에 `DATABASE_URL`, `APP_PASSWORD`(선택: `SESSION_SECRET`)를 추가합니다.
4. Deploy 합니다. 환경변수를 바꾼 뒤에는 Redeploy가 필요합니다.

## 구조
```
api/index.js     Vercel 서버리스 함수 진입점
lib/app.js       Express 앱 (API 라우트)
lib/auth.js      비밀번호 인증 / 세션 쿠키
lib/db.js        Neon(PostgreSQL) 연결
public/          프런트엔드 (HTML, CSS, JS)
server.js        로컬 개발 서버
db/schema.sql    테이블 정의
```

## 보안
- DB 접속 정보는 서버의 환경변수로만 사용되며, 브라우저로 전달되지 않습니다.
- 서버 오류 발생 시 클라이언트에는 일반 메시지만 반환합니다.
- 모든 지출 API는 로그인한 사용자만 호출할 수 있습니다.
- 모든 SQL은 파라미터 바인딩을 사용합니다.
