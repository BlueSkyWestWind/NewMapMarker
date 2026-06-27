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

## Cloudflare Workers 배포

이 프로젝트는 **Next.js 15** 앱입니다. Cloudflare **Workers**(Git 연동)로 배포할 때는 OpenNext 어댑터가 필요합니다.
`npm run build`만으로 만들어지는 `.next` 폴더는 Workers에 바로 올릴 수 없습니다.

### 대시보드 설정 (Workers & Pages → newmarker → Settings → Builds)

| 항목 | 올바른 값 | 현재 로그에서 잘못된 값 |
|------|-----------|-------------------------|
| Build command | `npm run build` | `npm run build` (OK) |
| **Deploy command** | **`npm run deploy`** | `npx wrangler deploy` (변환 없이 배포 시 실패) |
| Non-production deploy | `npm run upload` | (미설정 시 preview 브랜치 실패 가능) |

`npm run deploy` = `opennextjs-cloudflare build` + `opennextjs-cloudflare deploy`  
(Next 빌드 → `.open-next/worker.js` 생성 후 Workers에 배포)

**Settings → Compatibility flags** 에 `nodejs_compat` 추가.

### 환경 변수 (필수)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`  
카카오 JavaScript 키에 **Workers 배포 URL** 도메인도 등록하세요.

설정 변경 후 **Retry deployment** 하세요.

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
