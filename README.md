# MapMarker (geographic_tech)

`001.MapMarker`를 Next.js 15 + TypeScript 구조로 재구성한 프로젝트입니다.

## 구조

```
src/
  app/                         # Next.js App Router (layout · page · globals.css)
    api/
      kakao-static-map/        # 카카오 REST 정적맵 프록시 (영역 캡처용, REST 키 필요)
      map-tile-proxy/          # 지도 타일 프록시 (호스트 allowlist 기반 SSRF 방지)
      roadview-dates/          # 로드뷰 촬영일자 조회 프록시
  components/
    ui/                        # shadcn/ui (Radix)
    public-env-script.tsx      # 런타임 공개 env 를 브라우저에 주입
    kakao-sdk-script.tsx       # 카카오 지도 SDK 로더
  hooks/ lib/ types/           # use-toast · utils · public-env · supabase/client · kakao-maps.d.ts
  features/map-marker/
    api.ts                     # Supabase 마커/정보/축전지 조회
    constants/                 # 시설팀(facility-teams) · 지도 설정(map-config)
    providers/                 # auth-provider (Supabase 세션)
    store/                     # Zustand UI 상태 (use-map-marker-store)
    hooks/                     # auth-session · map-markers-query · kakao-map-sdk · active-markers
                               # marker-edit-form · excel-upload-actions · data-backup-actions
    lib/                       # marker-svg · cluster-pie · marker-filters · geocode · address-group
                               # overlay-content · overlay-drag · location-marker(-groups)
                               # map-viewport-capture · capture-overlay-layout
                               # map-capture-stitch/ (격자 캡처 스티칭)
                               # excel/data-manager/ (엑셀 파싱·내보내기·백업/복원)
    components/
      map/                     # 지도 캔버스 · 플로팅 컨트롤 · 영역 선택/캡처 패널
      sidebar/                 # 모드탭 · 필터 · 장소검색 · 엑셀 섹션 · 인증 헤더
      modals/                  # 마커 상세/편집 · 로드뷰 · 인증
  lib/supabase/                # Supabase 브라우저 클라이언트
e2e/                           # Playwright 스모크 테스트
```

## Cloudflare Workers 배포

이 프로젝트는 **Next.js 15** 앱입니다. Cloudflare **Workers**(Git 연동)로 배포할 때는 OpenNext 어댑터가 필요합니다.
`npm run build`만으로 만들어지는 `.next` 폴더는 Workers에 바로 올릴 수 없습니다.

### 대시보드 설정 (Workers & Pages → newmarker → Settings → Builds)

**오류 `Could not find compiled Open Next config, did you run the build command?`**  
→ Deploy command가 `npx wrangler deploy`만 실행되면 OpenNext 빌드(`.open-next/`)가 생성되지 않아 실패합니다.  
`wrangler deploy`는 내부에서 `opennextjs-cloudflare deploy`만 호출하며, **빌드는 자동으로 하지 않습니다.**

| 항목 | 권장 값 (택 1) |
|------|----------------|
| **방법 A — 한 줄 배포 (권장)** | Build command: *(비워 두기)* · **Deploy command: `npm run deploy`** |
| **방법 B — 빌드·배포 분리** | Build command: `npx opennextjs-cloudflare build` · Deploy command: `npx opennextjs-cloudflare deploy` |
| Non-production deploy | `npm run upload` |
| Node version | **22** (`.nvmrc`, wrangler 4.x 필수) |

**하지 말 것:** Deploy command를 `npx wrangler deploy`로 두는 것 (`npm run build`만으로는 `.open-next/`가 생기지 않음)

`npm run deploy` = `opennextjs-cloudflare build` + `opennextjs-cloudflare deploy`  
(Next 빌드 → `.open-next/worker.js` 생성 후 Workers에 배포)

`wrangler.jsonc`의 Worker 이름(`newmarker`)과 `WORKER_SELF_REFERENCE` service 이름이 **동일**해야 합니다.  
`package.json`의 `name`도 `newmarker`로 맞춰 두었습니다.

**Settings → Compatibility flags** 에 `nodejs_compat` 추가.

### 환경 변수 (필수)

Cloudflare **Workers & Pages → newmarker → Settings → Variables and Secrets** 에 아래 3개를 **Production** 환경에 등록하세요.  
(`.env.local`은 Git에 포함되지 않아 CI 빌드·배포 환경에는 자동으로 전달되지 않습니다.)

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable 키 |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 카카오 JavaScript 키 |

등록 후 **재배포**(또는 Variables만 추가했다면 페이지 새로고침)하세요.  
앱은 서버에서 Worker 변수를 읽어 브라우저에 주입합니다.

카카오 JavaScript 키에 **Workers 배포 URL** 도메인도 등록하세요.

### 환경 변수 (선택)

영역 캡처의 **카카오 정적맵(Static Map)** 경로에서만 사용합니다. 없으면 타일 프록시로 폴백하므로 필수는 아닙니다.

| 변수 | 설명 |
|------|------|
| `KAKAO_REST_API_KEY` | 카카오 **REST API 키**(서버 전용). 정적맵 캡처 품질용. 없으면 JS 키로 시도 후 실패 시 타일 프록시 폴백 |
| `NEXT_PUBLIC_SITE_URL` | 정적맵 요청 `KA` 헤더의 origin 폴백값 (미설정 시 요청 헤더/`localhost:3000` 사용) |

설정 변경 후 **Retry deployment** 하세요.

## 실행

```bash
npm install
npm run dev          # 개발 서버 (Turbopack)
npm run lint         # eslint .
npm run test:e2e     # Playwright 스모크 (dev 서버 재사용)
```

## 001.MapMarker 대비 현재 구현

| 기능 | 상태 |
|------|------|
| 장비/축전지/위치 모드 전환 | ✅ |
| Supabase 마커·정보·축전지 로드 | ✅ |
| 연도·사업·색상·태그·용량 필터 | ✅ |
| 지도 마커 렌더·클러스터(파이/도넛) | ✅ |
| 장소 검색·주소 지오코딩 | ✅ |
| 로그인/로그아웃 | ✅ |
| 엑셀 업로드(장비·축전지·ERP·추가항목) | ✅ |
| 데이터 백업/복원(엑셀) | ✅ |
| 마커 CRUD 모달(편집·삭제·시설팀 지정) | ✅ |
| 로드뷰 모달(촬영일자 조회) | ✅ |
| 영역 선택 → 격자 캡처/스티칭(PNG) | ✅ |
| 정적맵·타일 프록시(SSRF 방지) | ✅ |

## DB 마이그레이션

이미 `001.MapMarker` DB가 있으면 추가 작업 없음.  
신규 DB는 `001.MapMarker/sql/` 스크립트를 Supabase SQL Editor에서 순서대로 실행하세요.
