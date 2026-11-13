# 의존 방향 정리 (설계)

작성일 2026-11-14 · 대상: `src/features/map-marker/`의 공용 인증·권한 분리 · 구현계획: [Ver_3.0_의존방향정리_구현계획.md](Ver_3.0_의존방향정리_구현계획.md) · 구현: 코드 완료 후 작성 예정

## 1. 배경과 결정 사항

구조 점검(2026-11-14) 결과 파일 단위 순환 참조는 0건이나, 피처 단위에서는 `map-marker`가 인증·권한·셸 내비게이션 상태까지 보유해 11개 피처에서 총 128건의 import(테스트 제외)가 `map-marker`로 향하고, `map-marker` 역시 7개 피처를 역참조해 13쌍의 양방향 의존이 형성되어 있다. 이 문서는 그중 **공용 인증·권한을 `src/lib/auth/`로 옮겨** 다른 피처가 `map-marker`를 거치지 않고 인증을 쓰게 하고, 남는 도메인 결합의 처리 기준을 정하는 설계를 정의한다. 셸 내비게이션 상태(`activeNav`·`mapSegment`) 분리는 이번 범위에서 뺐다(§4).

**사용자가 정한 것**

| # | 결정 | 날짜 |
|---|---|---|
| 1 | 구조 점검 후속 개선 우선순위 1로 `의존방향정리` 설계·구현계획을 먼저 수립한다 | 2026-11-14 |
| 2 | 동작 변경 없는 순수 구조 리팩터로 진행하며, `AGENTS.md`의 하이드레이션 경계·`useActiveMarkers` 단일 호출 규칙을 유지한다 | 2026-11-14 |
| 3 | 인증 4개 파일은 대안 A(`src/lib/auth/`)로 옮긴다. 셸 내비 상태 분리는 이번에 제외하고 인증 이동만 한다(Claude 추천안 승인) | 2026-11-14 |

**설계에서 정한 것**

| # | 결정 |
|---|---|
| 4 | 인증·권한 4개 파일(`auth-provider`, `use-auth-session`, `use-is-admin`, `admin.ts`)은 도메인 무관 공용 계층이므로 `src/lib/auth/`로 승격한다 |
| 5 | 옛 위치에는 임시 re-export를 남기지 않는다. import 경로를 한 번에 바꾸고 원본 4개를 삭제한다 |
| 6 | 재발 방지로 `src/lib/arch-guard.test.ts`를 두어 `src/lib/**`가 `src/features/**`를 import하지 못하게 vitest로 막는다. 기존 위반은 `src/lib/api/kakao-route-upstream.ts`가 `@/features/route/types/route`(타입)를 import하는 1건뿐이라, 이유를 적은 허용 예외(ALLOW) 1건으로 시작한다. 이 타입을 `src/types/`로 옮기는 일은 후속 작업이다 |

## 2. 확인한 사실

### 2.1 타 피처 → `map-marker` import 전수 집계 (테스트 제외 `.ts`/`.tsx`)

| 출발 피처 | import 건수 | 주요 대상 |
|---|---:|---|
| `group-admin` | 33 | `types/marker.ts`, `lib/address-group.ts`, `lib/marker-detail-rows.ts`, `use-auth-session.ts` |
| `shell` | 27 | `use-map-marker-store.ts`, `use-auth-session.ts`, `use-is-admin.ts`, `sidebar/*`, `types/marker.ts` |
| `schedule` | 24 | `use-auth-session.ts`, `use-is-admin.ts`, `api.ts`, `use-map-markers-query.ts` |
| `site-lists` | 11 | `use-auth-session.ts`, `api.ts`, `lib/admin.ts`, `use-map-marker-store.ts`, `types/marker.ts` |
| `gpsmap` | 8 | `use-auth-session.ts`, `use-kakao-map-sdk.ts`, `use-map-marker-store.ts`, `lib/location-marker.ts` |
| `route` | 8 | `use-map-marker-store.ts`, `use-map-markers-query.ts`, `types/marker.ts` |
| `dashboard` | 7 | `use-map-marker-store.ts`, `use-map-markers-query.ts`, `sidebar/location-*-section.tsx` |
| `accounts` | 5 | `use-auth-session.ts` |
| `site-survey` | 2 | `use-auth-session.ts`, `use-is-admin.ts` |
| `worksite-weather` | 2 | `types/marker.ts`, `lib/address-group.ts` |
| `cctv` | 1 | `use-map-marker-store.ts` |
| **합계** | **128** | |

가장 많은 타 피처 파일이 참조하는 `map-marker` 파일 상위(테스트 제외):
- `src/features/map-marker/hooks/use-auth-session.ts` (외부 29개 파일)
- `src/features/map-marker/types/marker.ts` (외부 26개 파일)
- `src/features/map-marker/store/use-map-marker-store.ts` (외부 20개 파일)
- `src/features/map-marker/hooks/use-map-markers-query.ts` (외부 7개 파일)
- `src/features/map-marker/hooks/use-is-admin.ts` (외부 5개 파일)

### 2.2 `map-marker` → 타 피처 역참조 현황 (테스트 제외)

| 출발 파일 (`map-marker`) | 참조 대상 피처 (건수) |
|---|---|
| `store/use-map-marker-store.ts:21-22` | `shell` (`types/nav.ts`, `types/segment.ts`, 2건) |
| `components/map-marker-page.tsx:13`, `erp-changes-dialog.tsx:13`, `erp-review-dialog.tsx:14` | `shell` (`app-shell.tsx`, `constants.ts`, 3건) |
| `components/map/kakao-map-canvas.tsx:44-51` | `route` (4건) |
| `components/map-marker-page.tsx:15-16`, `marker-detail-modal.tsx:39`, `use-map-marker-store.ts:12` | `gpsmap` (4건) |
| `marker-detail-modal.tsx:14`, `use-data-backup-actions.ts:18-19`, `use-marker-list.ts:8-9`, `full-backup.ts:1`, `full-backup-file.ts:3`, `select-active-markers.ts:2` | `site-lists` (8건) |
| `marker-detail-modal.tsx:30-34`, `use-marker-list.ts:7` | `group-admin` (3건) |
| `lib/location-marker.ts:7,12`, `lib/overlay-content.ts:8-10`, `use-map-marker-store.ts:19` | `worksite-weather` (6건) |
| `use-map-marker-store.ts:20` | `cctv` (`types/cctv.ts`, 1건) |

### 2.3 반드시 지켜야 할 불변 규칙

- **하이드레이션 경계**: `src/features/map-marker/components/map-marker-page.tsx:54-74`에서 `hasMounted` 전에는 기본값을 쓰고 마운트 후 `persist` 값을 쓴다.
- **`useActiveMarkers` 단일 호출**: `src/features/map-marker/hooks/use-active-markers.ts:46`은 `map-marker-page.tsx:88` 한 곳에서만 호출한다.

## 3. 설계

### 3.1 대안 비교 (인증·공용 상태 배치)

| 기준 | 대안 A: `src/lib/auth/`로 이동 (채택) | 대안 B: `src/features/accounts/`로 인증 이동 |
|---|---|---|
| 의존 방향 | `lib/auth`는 최하위 공용 레이어라 모든 피처가 단방향 의존 가능 | `accounts`가 `worksite-weather`를 참조(`accounts/api.ts:2`)해 간접 결합 잔존 |
| 변경 범위 | 인증 4파일 이동 후 약 45개 참조 파일(테스트 포함, 구현 때 grep으로 확정) import 일괄 치환 | `accounts` 내부 서버/UI 파일과 클라이언트 인증 훅이 혼재 |
| deep module seam | `AuthProvider`, `useAuthSession`, `useIsAdmin`, `fetchIsAppAdmin`을 얇은 공개 인터페이스로 고정 | 피처 간 경계가 불명확함 |

**채택안**: 대안 A. 인증·권한 로직을 `src/lib/auth/`로 내린다(셸 내비 상태 분리는 §4).

### 3.2 `map-marker` 역방향 의존 분류 및 목표 구조

| 역참조 대상 | 분류 | 근거 및 처리 |
|---|---|---|
| `map-marker/store` → `shell/types/{nav,segment}` | **후속 작업** | `activeNav`·`mapSegment` 분리는 §4의 이유로 이번에 하지 않는다 |
| `map-marker/erp-*-dialog` → `shell/constants.ts`, `map-marker-page.tsx` → `AppShell` | **후속 작업** | 페이지 조립(`app/page.tsx`)과 사이드바 모달 폭 상수(`src/lib/layout.ts` 승격)는 다음 단계에서 분리 |
| `map-marker` → `route`, `gpsmap`, `site-lists`, `group-admin` | **후속 작업** | 대형 컴포넌트(`kakao-map-canvas`, `marker-detail-modal`) 내부 결합이므로 `대형파일분할` 이후 인터페이스 주입으로 해소 |
| `map-marker` → `worksite-weather`, `cctv` (`types/*` 및 표시 유틸) | **허용 예외** | 지도 오버레이/스토어가 날씨·CCTV 표시 타입을 소비하는 구조로, 도메인 타입(`types/*.ts`) 참조는 순환 위험이 낮아 허용 |

### 3.3 공개 인터페이스 (이동 후 시그니처 유지)

```ts
// src/lib/auth/auth-provider.tsx
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element;
export function useAuthSession(): AuthContextValue;

// src/lib/auth/use-is-admin.ts
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean };

// src/lib/auth/admin.ts
export async function fetchIsAppAdmin(supabase: SupabaseBrowserClient, userId: string): Promise<boolean>;
```

### 3.4 이동 순서

1. `src/lib/arch-guard.test.ts`를 만들어 `src/lib/**`가 `@/features/`를 import하지 않는 규칙을 건다(처음부터 통과해야 한다).
2. 인증 4개 파일(`auth-provider.tsx`, `use-auth-session.ts`, `use-is-admin.ts`, `admin.ts`)과 `admin.test.ts`를 `src/lib/auth/`로 옮기고, `src/`와 `e2e/` 전체의 import 경로를 바꾼 뒤 원본을 삭제한다.

## 4. 범위 밖

- **셸 내비 상태(`activeNav`·`mapSegment`) 분리**: `src/features/shell/store/use-shell-store.ts`가 이미 있고(`persist` 안 함, `isTreeOpen`·`panelStep` 등), 두 값은 `map-marker` 스토어의 `persist` 키 `map-marker-ui`에 있다. 관련 파일이 17개이고 하이드레이션 경계 규칙(`map-marker-page.tsx` 한 곳에서만 판정)과 저장값 이관이 걸려 위험이 크다. 인증 이동만으로 외부 피처 import 수가 크게 줄어, 이 분리는 별도 작업으로 미룬다.
- `src/features/map-marker/components/sidebar/auth-header.tsx`(`shell` 3개 파일에서 참조): UI 컴포넌트 계층 정리는 후속 작업으로 둔다.
- `map-marker` ↔ `route`/`gpsmap`/`site-lists`/`group-admin` UI 통합 해소: [Ver_3.0_대형파일분할_설계.md](../대형파일분할/Ver_3.0_대형파일분할_설계.md) 이후 후속 작업으로 둔다.
- `src/features/map-marker/types/marker.ts`(외부 26개 파일 참조) 이동 여부: §6에서 결정.

## 5. 위험과 검증

- **옛 import 경로 누락**: 한 곳이라도 남으면 `tsc`가 실패한다. 이동 뒤 `grep`으로 옛 경로 문자열(`map-marker/hooks/use-auth-session`, `map-marker/hooks/use-is-admin`, `map-marker/providers/auth-provider`, `map-marker/lib/admin`)이 `src/`·`e2e/`에 없음을 확인한다.
- **`"use client"` 지시어 유실**: 원본 첫 줄의 지시어를 그대로 유지한다.
- **내용 변경 금지**: `use-auth-session.ts`는 3줄짜리 재수출 파일이다. 내용을 고치지 않고 옮기기만 한다.
- **검증**: 매 단계 `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 통과를 확인한다.

## 6. 사용자 확인 필요 항목

없음. 인증 이동 위치는 대안 A로 확정했고, `types/marker.ts`는 현 위치에 둔다(이번 범위 밖).
