# suggested_commands

## 개발·빌드

- `npm run dev` — Turbopack 개발 서버
- `npm run build` / `npx next build` — 프로덕션 빌드. 라우트별 First Load JS 표를 출력하므로 번들 회귀 확인에 쓴다
- `npm run deploy` — OpenNext + Wrangler 배포

## 검증

- `npx tsc --noEmit`
- `npx eslint . --max-warnings=0`
- `npm test` (= `vitest run`) · `npm run test:watch`
- `npm run test:e2e` (playwright)

## Windows 셸 주의

개발 환경은 Windows. Bash 도구(Git Bash)와 PowerShell이 둘 다 있으니 문법을 섞지 말 것.

- 커밋 메시지 등 여러 줄 문자열: **PowerShell 히어독(`@'...'@`)을 Bash 도구에서 쓰면 안 된다.**
  Bash에서는 `git commit -F - <<'EOF' ... EOF` 형태를 쓴다.
- 파일 경로에 한글(`문서`)과 공백이 있다 → 항상 따옴표로 감싼다.
- `git add`/`commit` 시 `LF will be replaced by CRLF` 경고가 대량 출력되는 것은 정상.

## 프리렌더 결과 확인

`npx next build` 후 `.next/server/app/index.html`을 직접 열어 SSR 출력물을 볼 수 있다.
하이드레이션 불일치를 디버깅할 때 서버가 실제로 무엇을 그렸는지 확인하는 가장 빠른 방법.
