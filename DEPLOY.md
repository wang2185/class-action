# class-action 배포 런북

법무법인 윈스 단체소송 관리 플랫폼 (허왕 변호사). 운영 도메인 `class.day.lawyer`.
서버는 `127.0.0.1:5001` 단일 포트, Nginx 리버스 프록시 뒤(`trust proxy 1`), prod에서 `dist/public` SPA를 Express가 직접 서빙.

## 1. 빌드/실행
```bash
npm install
npm run build        # vite → dist/public, esbuild → dist/index.js
NODE_ENV=production node dist/index.js   # 또는 PM2
```

## 2. DB (PostgreSQL, drizzle-kit push — 손마이그레이션 없음)
```bash
npm run db:push      # users.role(varchar, lawyer 값 추가), evidence.category,
                     # notifications, payment_links 테이블 생성
```
- ⚠ **중복발송 백스톱(권장)** — `notifications.dedupe_key` 부분 유니크 인덱스 1회 생성:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_sent
    ON notifications (dedupe_key) WHERE status = 'sent';
  ```
- 변호사 계정 승격: `UPDATE users SET role='lawyer' WHERE email='wang.huh@winslaw.co.kr';`
  - 역할: `member`(당사자) / `admin`(사무직원) / `lawyer`(변호사 — 서면 패키지 접근). 전환기엔 admin도 서면 접근 허용.

## 3. 환경변수 (.env — `.env.example` 참조)
- 필수: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`(64자 hex=32byte, 주민번호 AES-256-GCM), `CORS_ORIGIN`, `PUBLIC_BASE_URL`(=https://class.day.lawyer).
- NicePay: `NICEPAY_MERCHANT_ID`(winslaw00m)+`NICEPAY_MERCHANT_KEY`(착수금·결제링크), `NICEPAY_KEYIN_MID`(winslaw01m)+`NICEPAY_KEYIN_KEY`(성공보수 빌링키). 테스트는 `nictest*` MID(sandbox 자동전환).
- 이메일(SES SMTP): `SMTP_HOST/PORT/USER/PASS/FROM`.
- 알림(알리고): `ALIGO_API_KEY/USER_ID/SENDER`. 알림톡(Stage B): `ALIGO_KAKAO_SENDER_KEY`, `ALIGO_KAKAO_TPL_FILING`, `ALIGO_KAKAO_TPL_PAYLINK`.
- 발송 제어: `NOTIFY_DRY_RUN`(운영=0), `NOTIFY_FILING_AUTO`.
- 카카오 공유: `VITE_KAKAO_JS_KEY`(브라우저 키, **빌드 시 인라인** → 설정 후 재빌드 필요).

## 4. 외부 서비스 사전작업
- ⚠ **알리고 IP 화이트리스트**: 이 서버의 **송신(egress) IP**를 알리고 콘솔에 등록(미등록 시 -101로 SMS 실패). 사무실 IP 아님 — 배포 서버 IP.
- **카카오 알림톡(Stage B)**: 발신프로필 등록 + 템플릿 사전심사(수일 소요). 심사 통과 후 `ALIGO_KAKAO_*` 채우면 `notify.ts`가 자동 활성(미설정 시 SMS 폴백). 템플릿 메시지 포맷은 심사본과 일치시킬 것(현재 SMS 문구를 임시 사용).
- **카카오 공유**: 카카오 개발자센터 앱 — 웹 플랫폼에 `https://class.day.lawyer` 등록 + JS 키 발급.
- **NicePay**: 실거래 전 sandbox(nictest) MID로 결제·취소 E2E 점검.

## 5. Nginx
- `proxy_pass http://127.0.0.1:5001;` + `X-Forwarded-*` 전달.
- 서면 패키지(ZIP) 내보내기는 대용량 가능 → `proxy_read_timeout` 상향 검토.
- 결제 단축링크 `/pay/:token`·OG 주입 `/cases/:id`는 Express가 처리(SPA catch-all보다 먼저 등록됨).

## 6. 검증 체크리스트(배포 후)
- `curl https://class.day.lawyer/cases/<id>` → 사건별 OG 메타 주입 확인.
- 변호사 로그인 → `/admin/cases/:id/package` 서면 패키지 ZIP 다운로드(주민번호 평문은 dossier.json만).
- 결제링크 생성→문자 수신→`/pay/<token>` 결제(sandbox)→본인취소(뒷4자리).
- 경과(filing) 등록 + "참가자 알림 발송" → 당사자 문자·이메일 수신, `notifications` 기록.

## 알려진 한계(후속 개선 후보)
- 알림 멱등은 check-then-insert + 위 부분 유니크 인덱스 백스톱. 완전 원자성은 durable outbox 도입 시.
- 자동알림은 fire-and-forget(즉시 응답). 팬아웃 진입 전 오류는 콘솔에만 — outbox/job 큐로 보강 가능.
- 결제링크 콜백은 승인 전 링크 `active→used` 원자적 선점으로 이중청구 차단(단일 인스턴스 가정).
