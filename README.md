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
| `NEXT_PUBLIC_SITE_URL` | 정적맵 요청 `KA` 헤더의 origin 폴백값 (미설정 시 요청 헤더/`localhost:3000` 사용). 프록시 라우트의 허용 origin 으로도 사용 |
| `PROXY_ALLOWED_ORIGINS` | 프록시 라우트(정적맵·타일·로드뷰)에서 자기 도메인 외에 추가로 허용할 origin (쉼표 구분). 커스텀 도메인 다중 운영 시 |

설정 변경 후 **Retry deployment** 하세요.

## 실행

```bash
npm install
npm run dev          # 개발 서버 (Turbopack)
npm run lint         # eslint .
npm run test         # vitest 단위 테스트 (coords · marker-filters · proxy-guard · map-helpers)
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
| 동일 번지 대표/SUB/단독 그룹핑 | ✅ |
| 동/구역 실제 그룹 분리·원복(대표 직접 선택) | ✅ |

### 동일 번지 그룹핑 · 동/구역 분리

같은 번지에 여러 장비가 있으면 하나를 **대표**, 나머지를 **SUB**로 묶고(1개면 **단독**),
지도에는 대표 1핀만 표시합니다. 아파트·공장처럼 한 번지에 여러 구역이 있으면
마커 상세 모달에서 **동/지하/기타 단위로 실제 분리**할 수 있습니다.

- **분리**: 구역을 번지 그룹에서 빼내 독립 대표+SUB 그룹으로 만듭니다. 분리 시 **대표 국소를 직접 선택**합니다.
- **대표 승격**: 분리로 원 번지 그룹의 대표가 빠지면 남은 국소 중 하나가 새 대표(1개면 단독)로 승격됩니다.
- **원복**: 분리 그룹에서 **번지로 합치기**로 되돌립니다.
- 분리 상태는 `markers.group_key`에 저장되어 엑셀 재업로드·백업/복원에도 유지됩니다.

## DB 마이그레이션

기존 `001.MapMarker` DB 위에서 동작하되, **아래 추가 컬럼 마이그레이션은 Supabase SQL Editor에서 실행**해야 합니다.
`supabase/migrations/` 의 파일을 파일명 순서대로 실행하세요(이미 적용된 것은 `IF NOT EXISTS`로 안전하게 건너뜁니다).

| 마이그레이션 | 내용 |
|------|------|
| `20260722000000_add_detached_visible.sql` | `markers.detached_visible` — 같은 번지 SUB를 지도에 개별 핀으로 표시 |
| `20260723000000_add_group_key.sql` | `markers.group_key` — 번지 하위 동/구역 실제 그룹 분리 키(미적용 시 분리 기능에서 컬럼 없음 오류) |

신규 DB는 먼저 `001.MapMarker/sql/` 스크립트를 순서대로 실행한 뒤 위 마이그레이션을 적용하세요.
