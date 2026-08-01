# tech_stack

- Next.js 15 App Router + React + TypeScript. 배포는 Cloudflare(OpenNext/Wrangler).
- 상태: `zustand`(+`persist`) 전역 UI, `@tanstack/react-query` 서버 상태.
- 분기: `ts-pattern` (`match().with().exhaustive()`). 새 유니온 값 추가 시 컴파일이 막히도록 `exhaustive()` 사용.
- UI: `tailwindcss` + `shadcn/ui` + `lucide-react`.
- 백엔드: Supabase (`supabase/migrations/*.sql`).
- 유틸: `date-fns` · `es-toolkit` · `zod` · `react-hook-form` · `xlsx`(엑셀, 지연 import).
- 테스트: `vitest`(단위) + `playwright`(e2e, `e2e/`).
- 패키지 매니저: **npm**.

## 외부 데이터

- 카카오맵 JS SDK(브라우저), VWorld(지오코딩·필지·건축물대장 — **브라우저 직접 호출**, 서버 프록시는 502로 거부됨),
  기상청 API 허브(서버 전용 `worksite-weather/lib/kma-client.ts`), ITS 도로 CCTV(브라우저 직접, 키는 `/api/its-key` 런타임 전달).
- 시크릿은 `.env*`(커밋 금지). `NEXT_PUBLIC_*`은 **빌드 시점 치환**이라 Cloudflare 런타임 변수로 넣으면 `undefined`가 된다.

## 번들 예산

홈 First Load JS **295 kB 이하**가 기준선(현재 283 kB). `/gpsmap` 349 kB.
무거운 모듈(gpsmap lib·대시보드·Leaflet·xlsx)은 반드시 `dynamic()` 또는 이벤트 핸들러 내 `await import`.
