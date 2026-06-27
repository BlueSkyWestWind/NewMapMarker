# MapMarker (geographic_tech)

`001.MapMarker`를 Next.js 15 + TypeScript 구조로 재구성한 프로젝트입니다.

## 구조

```
src/
  app/                         # Next.js App Router
  features/map-marker/
    api.ts                     # Supabase 마커 조회
    components/                # UI (지도, 사이드바, 모달)
    constants/                 # 시설팀·지도 설정
    hooks/                     # React Query, Kakao SDK, 필터
    lib/                       # 마커 SVG, 필터 로직
    store/                     # Zustand UI 상태
    types/                     # 도메인 타입
  lib/supabase/                # Supabase 브라우저 클라이언트
supabase/migrations/           # DB 마이그레이션 참조
```

## 환경 설정

`.env.example`을 `.env.local`로 복사 후 값을 입력하세요.

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` (카카오 디벨로퍼스 JavaScript 키, `http://localhost:3000` 도메인 등록)

기존 `001.MapMarker` Supabase DB를 그대로 사용할 수 있습니다.

## Cloudflare Pages 배포

이 프로젝트는 **Next.js 15** 앱입니다. 예전 `001.MapMarker`(정적 HTML)와 빌드 방식이 다릅니다.
빌드가 실패하면 Cloudflare는 **마지막 성공 배포(구버전)** 를 그대로 보여줍니다.

### 대시보드 설정 (Workers & Pages → 프로젝트 → Settings)

| 항목 | 값 |
|------|-----|
| Production branch | `main` |
| Framework preset | Next.js (또는 None) |
| Build command | `npm run pages:build` |
| Build output directory | `.vercel/output/static` |
| Node version | `20` (`NODE_VERSION` 환경변수) |

**Settings → Functions → Compatibility flags** 에 `nodejs_compat` 추가 (Production·Preview 모두).

### 환경 변수 (필수)

`.env.example`과 동일한 `NEXT_PUBLIC_*` 값을 Pages 프로젝트 **Environment variables**에 등록하세요.

카카오 JavaScript 키에는 **배포 도메인**(예: `https://xxx.pages.dev`)도 등록해야 합니다.

설정 변경 후 **Deployments → Retry deployment** 또는 `main`에 다시 push하세요.

## 실행

```bash
npm install
npm run dev
```

## 001.MapMarker 대비 현재 구현

| 기능 | 상태 |
|------|------|
| 장비/축전지 모드 전환 | ✅ |
| Supabase 마커 로드 | ✅ |
| 연도·사업·색상·태그 필터 | ✅ |
| 지도 마커 렌더·클러스터 | ✅ |
| 로그인/로그아웃 | ✅ |
| 엑셀 업로드/백업 | 🔜 (구조만 확장 예정) |
| 로드뷰 모달 | 🔜 API route 준비됨 |
| 마커 CRUD 모달 | 🔜 |

## DB 마이그레이션

이미 `001.MapMarker` DB가 있으면 추가 작업 없음.  
신규 DB는 `001.MapMarker/sql/` 스크립트를 Supabase SQL Editor에서 순서대로 실행하세요.
