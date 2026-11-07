# 그룹관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비활성이던 `그룹관리` 메뉴를 관리자 전용 국소 자료 수정 화면(패널 목록 + 넓은 관리 창)으로 만든다.

**Architecture:** 수정 계산(묶음 만들기, 변경분, 대표/SUB 계획)은 순수 함수로 `src/features/group-admin/lib`에 두고, DB 반영은 계획(`MarkerOp[]`)을 실행하는 얇은 실행기가 맡는다. 상세 화면의 기존 대표/SUB 변경 로직은 같은 계획 함수로 옮겨 두 화면이 규칙을 공유한다. 그룹관리의 지도 표시는 기존 `location` 모드를 재사용한다.

**Tech Stack:** Next.js 15, React 19, TypeScript(엄격), zustand, @tanstack/react-query, Supabase JS, Tailwind 3, vitest(`.ts`만 실행), Playwright(화면 확인).

**Spec:** `docs/Ver_3.0/Ver_3.0_그룹관리_구현.md`

## Global Constraints

- 검증 명령: `npx tsc --noEmit` · `npx eslint . --max-warnings=0` · `npm test` · `npx next build`. 홈 First Load JS **295 kB 이하**(현재 289 kB).
- **`next build`는 개발 서버(포트 3000)가 떠 있을 때 실행하지 않는다.** `.next`를 덮어써 화면이 깨진다. 멈추고 빌드한 뒤 다시 띄운다.
- `vitest.config.ts`는 `.ts` 테스트만 실행한다. **`.tsx` 테스트는 실행되지 않으므로** 로직은 `.ts`로 분리하고, 컴포넌트는 가짜 로그인·가짜 DB로 Playwright 확인한다.
- Supabase는 로컬에서 실행하지 않는다. 이 계획은 **DB 마이그레이션이 없다.** 운영 DB에 쓰지 않고, 실제 저장·삭제는 사용자가 백업 후 확인한다.
- 관리자 전용은 **화면에서만** 막는다(DB 쓰기 정책 변경 없음). 메뉴는 비활성이 아니라 **그리지 않는다**.
- 표: 셀 줄바꿈 금지, 가로 스크롤 금지(폭이 모자라면 창을 넓힌다), 세로 스크롤만 허용.
- 좌표 범위: 위도 33~39, 경도 124~132. 날짜: `yyyy-mm-dd` 또는 빈 값.
- 마커 조회는 1000행에서 잘리지 않도록 `fetchAllRows`를 쓴다.
- 대표/SUB 재정리 전체 실행(`applyMarkerRolesFromStoredGroupRole`)은 이 화면에서 호출하지 않는다.
- 한글은 UTF-8로 저장하고 작성 후 깨짐을 확인한다. 셸에서 백틱이 든 문자열을 `node -e`로 넘기지 않는다(파일 도구를 쓴다).
- 커밋은 **사용자가 요청한 경우에만** 한다. 각 태스크의 Commit 단계는 그때 수행한다.

## Review Focus

테스트가 따로 짚지 않으면 사용자가 겪을 가능성이 큰 순서. 각 줄의 테스트는 해당 태스크에 넣었다.

1. **대표를 단독으로 바꾸거나 삭제해 묶음에 0~1개가 남을 때:** 대표 없는 SUB가 남으면 안 된다. 1개만 남으면 단독, 2개 이상이면 새 대표. (Task 3, 4)
2. **좌표가 없는 마커(`lat/lng`가 null):** 지도 표시에서 빠지고, 좌표 입력 검증은 둘 다 비우거나 둘 다 채울 때만 통과한다. (Task 6, 7)
3. **같은 마커에 변경이 겹칠 때:** 삭제한 마커의 필드 수정은 버리고, 대표 지정 뒤 분리처럼 앞 변경 결과를 보고 다음 계획을 세운다. (Task 2, 7, 8)
4. **저장이 중간에 실패한 뒤 다시 저장:** 이미 저장된 항목이 다시 적용돼도 결과가 같아야 하고, 저장된 항목은 변경분에서 빠져야 한다. (Task 8)
5. **관리자 판별 중·로그아웃·권한 없음:** 판별 전에는 메뉴를 숨기되 저장된 `activeNav`가 `groups`일 때 대시보드로 쫓아내지 않고, 권한이 없으면 대시보드로 보낸다. (Task 1)

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/features/map-marker/lib/admin.ts` (신규) | `fetchIsAppAdmin` (위치 목록에서 옮김) |
| `src/features/map-marker/hooks/use-is-admin.ts` (신규) | 관리자 판별 훅 |
| `src/features/group-admin/types.ts` (신규) | `MarkerGroup`, `MarkerOp`, `MarkerPatch`, `EditDraft` 등 |
| `src/features/group-admin/lib/build-groups.ts` (신규) | 번지 묶음 만들기 |
| `src/features/group-admin/lib/group-filters.ts` (신규) | 목록 필터 |
| `src/features/group-admin/lib/group-ops.ts` (신규) | `applyOpsToMarkers`, `applyMarkerOps`(실행기) |
| `src/features/group-admin/lib/group-actions.ts` (신규) | 대표·단독·분리·합치기·삭제 계획 |
| `src/features/group-admin/lib/edit-draft.ts` (신규) | 변경분, 검증 |
| `src/features/group-admin/lib/save-draft.ts` (신규) | 변경분 DB 반영 |
| `src/features/group-admin/lib/info-rows.ts` (신규) | 선택 묶음의 `information` 행 조회 |
| `src/features/group-admin/components/*` (신규) | 패널, 관리 창, 일괄 수정, 변경 표시 |
| `src/features/shell/types/nav.ts` | `adminOnly`, 관리자 인자 |
| `src/features/map-marker/store/use-map-marker-store.ts` | 선택 묶음, 관리 창 상태, `groups` 모드 매핑 |
| `src/features/map-marker/lib/select-active-markers.ts` | 그룹관리 표시 |
| `src/features/map-marker/components/modals/marker-detail-modal.tsx` | 계획 함수 호출로 교체(동작 동일) |

## 사전 준비

- [ ] **Step 1:** 사용자에게 현재 **커밋되지 않은 변경**(국소 목록, 백업·재정리 수정, 검색 수정, 마이그레이션 SQL)을 먼저 커밋할지 확인한다. 이 계획은 그 변경 위에서 시작한다.
- [ ] **Step 2:** `git switch -c feat/ver-3.0-group-admin`으로 새 브랜치를 만든다. 개발 서버가 떠 있는지 `netstat -ano | grep :3000`으로 확인한다.

---

### Task 1: 관리자 판별 공용화와 관리자 전용 메뉴

**Files:**
- Create: `src/features/map-marker/lib/admin.ts`, `src/features/map-marker/lib/admin.test.ts`, `src/features/map-marker/hooks/use-is-admin.ts`, `src/features/shell/types/nav.test.ts`
- Modify: `src/features/site-lists/api.ts`(`fetchIsAppAdmin` 제거 후 `admin.ts`에서 import), `src/features/map-marker/hooks/use-data-backup-actions.ts`(import 경로), `src/features/shell/types/nav.ts`, `src/features/shell/lib/nav-model.ts`, `src/features/shell/lib/nav-model.test.ts`, `src/features/shell/hooks/use-shell-nav.ts`, `src/features/shell/components/nav-rail.tsx`, `src/features/shell/components/nav-tree.tsx`, `src/features/shell/components/mobile-shell.tsx`, `src/features/shell/components/app-shell.tsx`

**Interfaces:**
- Produces: `fetchIsAppAdmin(supabase: SupabaseBrowserClient, userId: string): Promise<boolean>`
- Produces: `useIsAdmin(): { isAdmin: boolean; isLoading: boolean }` (조회 실패·테이블 없음은 `isAdmin: false`)
- Produces: `NavItem.adminOnly?: boolean`, `visibleNavItems(isAuthenticated: boolean, isAdmin?: boolean): NavItem[]`, `isNavAccessible(key: NavKey, isAuthenticated: boolean, isAdmin?: boolean): boolean`
- Produces: `mobileTabItems(isAuthenticated, isAdmin?)`, `mobileMoreItems(isAuthenticated, isAdmin?)` 같은 인자 추가
- Produces: `useShellNav()`가 `isAdmin: boolean`을 함께 돌려준다

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `nav.test.ts`: `visibleNavItems(true, false)`에 `groups`가 없고 `(true, true)`에는 있다. `isNavAccessible("groups", true, false)`는 false, `("groups", true, true)`는 true, `("groups", false, true)`는 false(비로그인). `admin.test.ts`: 행이 있으면 true, `null`이면 false, 오류면 throw. `nav-model.test.ts`의 "모든 메뉴가 나뉜다" 테스트는 관리자 인자 `true`로 바꾸고, `mobileMoreItems(true, false)`가 `["barcode", "backup", "settings"]`인 케이스를 더한다.
- [ ] **Step 2: 실패를 확인한다.** `npx vitest run src/features/shell src/features/map-marker/lib/admin.test.ts` → 새 케이스 FAIL.
- [ ] **Step 3: `admin.ts`·`use-is-admin.ts`를 만들고 `nav.ts`·`nav-model.ts`의 시그니처를 위 Interfaces대로 바꾼다.** `groups` 항목은 `enabled: true, adminOnly: true`. 훅은 react-query 키 `["is-admin", userId]`, `retry: false`, `staleTime` 5분.
- [ ] **Step 4: 호출부를 모두 바꾼다.** `nav-rail`/`nav-tree`/`mobile-shell`은 `useShellNav().isAdmin`을 넘긴다. `app-shell.tsx`의 `isNavAccessible` 효과는 `isLoading` 동안 실행하지 않는다(저장된 `activeNav`가 `groups`일 때 판별 전에 쫓아내지 않기 위해). 판별이 끝나 `isAdmin`이 false면 `setActiveNav("dashboard")`.
- [ ] **Step 5: 통과를 확인한다.** `npx vitest run`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0` 모두 통과.
- [ ] **Step 6: Commit** (요청 시) — `feat: 관리자 판별을 공용 훅으로 분리하고 그룹관리 메뉴를 관리자에게만 보인다`

---

### Task 2: 마커 변경 계획 모델과 묶음 지정 계획

**Files:**
- Create: `src/features/group-admin/types.ts`, `src/features/group-admin/lib/group-ops.ts`, `src/features/group-admin/lib/group-ops.test.ts`, `src/features/group-admin/lib/group-actions.ts`, `src/features/group-admin/lib/group-actions.test.ts`

**Interfaces:**
- Produces(types.ts): `MarkerPatch = { parent_marker_id?: string | null; group_role?: GroupRole; group_key?: string | null; detached_visible?: boolean }`, `MarkerOp = { type: "update"; ids: string[]; patch: MarkerPatch } | { type: "delete"; ids: string[] }`
- Produces(group-ops.ts): `applyOpsToMarkers(markers: EquipmentMarker[], ops: MarkerOp[]): EquipmentMarker[]` (`parent_marker_id→parentMarkerId`, `group_role→groupRole`, `group_key→groupKey`, `detached_visible→detachedVisible`, 삭제는 목록에서 제거), `applyMarkerOps(supabase: SupabaseBrowserClient, ops: MarkerOp[]): Promise<void>` (순서대로 실행, 실패 시 `MarkerOpsError { completed: number; cause: unknown }`)
- Produces(group-actions.ts): `planAssignGroup(members: EquipmentMarker[], groupKey: string | null, preferredRepId?: string): { ops: MarkerOp[]; rep: EquipmentMarker | null }` — 상세 화면의 `assignGroupMembers`와 같은 규칙(대표 우선순위: 지정 → 기존 대표 → 최초 등록, 1개면 단독, `detached_visible: false`)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `group-ops.test.ts`: `applyOpsToMarkers`가 `update`를 매핑해 반영한다 / `delete`는 제거한다 / 원본 배열을 바꾸지 않는다. `applyMarkerOps`는 가짜 Supabase로 `update().in("id", ids)`와 `delete().in("id", ids)`를 순서대로 부르고, 두 번째 연산이 실패하면 `completed === 1`인 `MarkerOpsError`를 던진다. `group-actions.test.ts`: `planAssignGroup`은 ① 3개 중 기존 대표를 대표로 / ② `preferredRepId`가 우선 / ③ 대표가 없으면 `createdAt`이 가장 빠른 것(동률이면 `id`) / ④ 1개면 `group_role: "단독"` / ⑤ 빈 배열이면 `{ ops: [], rep: null }`.
- [ ] **Step 2: 실패를 확인한다.** `npx vitest run src/features/group-admin` → FAIL(모듈 없음).
- [ ] **Step 3: 구현한다.** 기존 `marker-detail-modal.tsx`의 `assignGroupMembers`(527~570행)를 읽고 규칙을 그대로 옮긴다. 정렬·대표 선택은 위 테스트가 정한다. DB 호출은 `planAssignGroup`에 넣지 않는다.
- [ ] **Step 4: 통과를 확인한다.** `npx vitest run src/features/group-admin` → PASS, `npx tsc --noEmit` 통과.
- [ ] **Step 5: Commit** (요청 시) — `feat: 마커 변경 계획 모델과 묶음 지정 계획을 추가한다`

---

### Task 3: 대표·단독·SUB 변경 계획

**Files:**
- Modify: `src/features/group-admin/lib/group-actions.ts`, `src/features/group-admin/lib/group-actions.test.ts`

**Interfaces:**
- Consumes: Task 2의 `MarkerOp`, `planAssignGroup`. 기존 `storedGroupRoleOf`, `getAddressGroupMates`, `pickNextAddressRepresentative`(`marker-detail-rows.ts`)
- Produces: `planRoleChange(target: EquipmentMarker, nextRole: GroupRole, all: EquipmentMarker[]): { ops: MarkerOp[]; notice: string }` — `notice`는 상세 화면이 지금 토스트로 보여 주는 문구와 같다. 이미 그 구분이면 `{ ops: [], notice: "" }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다(기존 `changeMarkerGroupRole` 동작을 고정).** 단독으로: ① 대표이고 남은 2개 이상 → 새 대표 승격 + 나머지 SUB / ② 대표이고 남은 1개 → 그 1개도 단독 / ③ 대표이고 남은 0개 → 자기만 단독 / ④ SUB를 단독으로 → 자기만 단독. 대표로: 단독이 아닌 같은 번지 마커가 모두 SUB. SUB로: ⑤ 현재 대표 아래로 / ⑥ 대표가 없으면 다른 마커 승격 / ⑦ 연결할 대표가 없으면 단독(`notice`에 "연결할 대표가 없어 단독으로 설정했습니다"). **모든 케이스에서 결과 상태(`applyOpsToMarkers`)에 "대표 없는 SUB"가 없음을 단언한다**(Review Focus 1).
- [ ] **Step 2: 실패를 확인한다.** `npx vitest run src/features/group-admin/lib/group-actions.test.ts` → FAIL.
- [ ] **Step 3: `planRoleChange`를 구현한다.** `marker-detail-modal.tsx`의 `changeMarkerGroupRole`(314~525행) 분기를 같은 조건·순서로 옮기고 `supabase` 호출만 `MarkerOp`로 바꾼다.
- [ ] **Step 4: 통과를 확인한다.** 위 파일 PASS, `npx tsc --noEmit` 통과.
- [ ] **Step 5: Commit** (요청 시) — `feat: 대표·단독·SUB 변경을 순수 계획 함수로 옮긴다`

---

### Task 4: 분리·합치기·삭제 계획

**Files:**
- Modify: `src/features/group-admin/lib/group-actions.ts`, `src/features/group-admin/lib/group-actions.test.ts`

**Interfaces:**
- Consumes: Task 2~3. 기존 `buildSplitGroupKey`, `getLotAddressKey`(`address-group.ts`), `getMarkerDongLabel`
- Produces: `planSeparate(targets: EquipmentMarker[], remaining: EquipmentMarker[], label: string, repId?: string): { ops: MarkerOp[]; newKey: string }` — 남은 묶음 재승격을 **먼저**, 분리 묶음을 나중에(기존 `separateLabelGroup`의 순서)
- Produces: `planMergeSplitToLot(splitMembers: EquipmentMarker[], all: EquipmentMarker[]): { ops: MarkerOp[] }` — 기존 `mergeSplitGroupToLot`
- Produces: `planMergeGroups(groups: EquipmentMarker[][], all: EquipmentMarker[], preferredRepId?: string): { ops: MarkerOp[]; groupKey: string }` — 새 `group_key`는 `buildSplitGroupKey(getLotAddressKey(대표 주소) || "lot", "합침", 대표.id)`. 합쳐지고 남은 옛 묶음은 같은 `group_key`로 `planAssignGroup`해 대표를 다시 정한다.
- Produces: `planDelete(targets: EquipmentMarker[], all: EquipmentMarker[]): { ops: MarkerOp[] }` — 삭제 연산 + 영향받은 묶음의 남은 마커로 대표 재지정(대표를 지웠을 때만)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 분리: 새 키가 `lot#라벨#시드` 형식이고, 남은 묶음 연산이 분리 묶음 연산보다 앞선다 / 남은 것이 1개면 단독. 합치기(`planMergeSplitToLot`): `group_key: null`로 되돌리고 번지 전체를 한 묶음으로. `planMergeGroups`: 서로 다른 두 묶음 → 한 대표 + 나머지 SUB, 같은 새 키 / `preferredRepId` 우선. `planDelete`: ① SUB 삭제 → 연산은 삭제만 / ② 대표 삭제, 남은 2개 이상 → 새 대표 / ③ 대표 삭제, 남은 1개 → 단독 / ④ 묶음 전체 삭제 → 삭제만 / ⑤ 서로 다른 묶음의 마커를 함께 삭제. **각각 `applyOpsToMarkers` 결과에 대표 없는 SUB가 없음을 단언한다.**
- [ ] **Step 2: 실패를 확인한다.** 위 파일 FAIL.
- [ ] **Step 3: 네 함수를 구현한다.** 분리·번지 합치기는 `marker-detail-modal.tsx`의 `separateLabelGroup`(584~650행)·`mergeSplitGroupToLot`(653~700행)을 옮긴다. `planMergeGroups`·`planDelete`는 새 규칙이며 `planAssignGroup`을 재사용한다.
- [ ] **Step 4: 통과를 확인한다.** PASS, `npx tsc --noEmit` 통과.
- [ ] **Step 5: Commit** (요청 시) — `feat: 분리·합치기·삭제 계획 함수를 추가한다`

---

### Task 5: 상세 화면이 계획 함수를 쓰도록 교체

**Files:**
- Modify: `src/features/map-marker/components/modals/marker-detail-modal.tsx`

**Interfaces:**
- Consumes: `planRoleChange`, `planAssignGroup`, `planSeparate`, `planMergeSplitToLot`, `applyMarkerOps`. **개별 표시 함수(`setMarkerDetached`, `mergeAllDetachedSubs`, `setGroupDetached`)는 새 화면이 쓰지 않아 옮기지 않는다**(스펙에서 줄인 부분).

- [ ] **Step 1: 교체 전 동작을 기록한다.** 가짜 로그인·가짜 DB(Supabase 요청을 Playwright `route`로 가로채기)로 상세 화면에서 대표 지정·단독·SUB·분리·번지로 합치기를 각각 한 번씩 실행하고, 가로챈 `PATCH` 본문 목록(순서 포함)을 파일로 저장한다.
- [ ] **Step 2: `changeMarkerGroupRole`, `assignGroupMembers`, `separateLabelGroup`, `mergeSplitGroupToLot` 본문을 계획 함수 호출 + `applyMarkerOps`로 바꾼다.** 토스트는 `notice`를 쓰고, 진행 중 표시(`changingRoleId` 등)와 `invalidateQueries`는 그대로 둔다.
- [ ] **Step 3: 같은 시나리오를 다시 실행해 `PATCH` 목록이 Step 1과 같음을 확인한다.** 달라지면 계획 함수를 고친다(모달 쪽을 맞추지 않는다).
- [ ] **Step 4: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 통과.** 모달에 `assignGroupMembers` 같은 옛 함수가 남아 있지 않은지 `grep`으로 확인한다.
- [ ] **Step 5: Commit** (요청 시) — `refactor: 상세 화면의 대표/SUB 변경을 공용 계획 함수로 교체한다`

---

### Task 6: 묶음 만들기와 목록 필터

**Files:**
- Create: `src/features/group-admin/lib/build-groups.ts`, `src/features/group-admin/lib/build-groups.test.ts`, `src/features/group-admin/lib/group-filters.ts`, `src/features/group-admin/lib/group-filters.test.ts`
- Modify: `src/features/group-admin/types.ts`

**Interfaces:**
- Produces(types.ts): `MarkerGroup = { key: string; lotAddress: string; markers: EquipmentMarker[]; representative: EquipmentMarker | null; hasNoCoord: boolean; isSuspect: boolean }`, `GroupFilters = { query: string; years: string[]; statuses: string[]; businesses: string[]; onlyNoCoord: boolean; onlySuspect: boolean }`(배열이 비면 그 조건은 걸러내지 않는다)
- Produces: `buildMarkerGroups(markers: EquipmentMarker[]): MarkerGroup[]` — 키는 기존 `getEffectiveGroupKey`(주소 없는 마커는 `__solo__<id>`), 대표는 `group_role === "대표"`이거나 `parentMarkerId`가 없는 첫 마커, 정렬은 대표 국소명 순. `isSuspect`는 마커가 2개 이상이고 모두 `단독`
- Produces: `filterGroups(groups: MarkerGroup[], filters: GroupFilters): MarkerGroup[]` — 검색어는 묶음 안 어느 마커든 국소명·최종 국소명·통합시설코드·프로젝트코드·주소에 포함(공백 무시, 여러 코드 붙여 넣기는 `searchEquipmentSites`와 같은 규칙으로 재사용). 연도는 `getMarkerFilterYears`, 상태는 `facilityStatus`, 사업구분은 `normalizeFilterValue`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 묶음: 같은 번지가 하나로 묶인다 / `group_key`가 다르면 같은 번지라도 분리 / 주소 없는 마커는 각자 묶음 / 대표 SUB 순서와 `representative` / **좌표 null 마커가 있으면 `hasNoCoord`**(Review Focus 2) / 모두 단독인 2개 이상은 `isSuspect`. 필터: 빈 필터는 전체 / 검색어가 SUB의 이름에만 맞아도 묶음이 남는다 / 코드 여러 개 붙여 넣기 / 연도·상태·사업구분 / `onlyNoCoord`, `onlySuspect`.
- [ ] **Step 2: 실패를 확인한다.** FAIL.
- [ ] **Step 3: 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** PASS, `npx tsc --noEmit` 통과.
- [ ] **Step 5: Commit** (요청 시) — `feat: 번지 묶음 만들기와 목록 필터를 추가한다`

---

### Task 7: 변경분(초안) 모델과 검증

**Files:**
- Create: `src/features/group-admin/lib/edit-draft.ts`, `src/features/group-admin/lib/edit-draft.test.ts`
- Modify: `src/features/group-admin/types.ts`

**Interfaces:**
- Produces(types.ts): `MarkerFields = { name: string; lat: number | null; lng: number | null; memo: string; tags: string[]; color: string; facilityTeam: string; facilityCode: string; roadAddress: string; jibunAddress: string }`, `InfoRecord = { id: number; markerId: string; projectCode: string; facilityYear: string; businessType: string; finalStationName: string; eqClass: string; eqType: string; installDate: string; openDate: string }`(`information` 행), `InfoFields = Omit<InfoRecord, "id" | "markerId">`, `EditDraft = { markerEdits: Record<string, Partial<MarkerFields>>; infoEdits: Record<number, Partial<InfoFields>>; ops: MarkerOp[] }`, `DraftIssue = { key: string; message: string }`
- Produces: `emptyDraft(): EditDraft`, `setMarkerEdit(draft: EditDraft, original: EquipmentMarker, patch: Partial<MarkerFields>): EditDraft`(원래 값과 같아진 칸은 변경분에서 뺀다), `setInfoEdit(draft: EditDraft, original: InfoRecord, patch: Partial<InfoFields>): EditDraft`, `queueOps(draft: EditDraft, ops: MarkerOp[]): EditDraft`, `applyDraftToMarkers(markers: EquipmentMarker[], draft: EditDraft): EquipmentMarker[]`(필드 수정 + `ops`를 반영, **삭제한 마커는 제거되고 그 마커의 필드 수정은 무시**), `countChanges(draft: EditDraft): number`, `validateDraft(draft: EditDraft): DraftIssue[]`
- 정보 행은 마커 하나에 여러 개일 수 있고, **표의 행은 `information` 행 단위**다. 마커 열(국소명·코드·주소·좌표·구분)은 마커 ID로, 정보 열은 정보 행 ID로 변경분에 쌓인다. 정보 행이 없는 마커는 마커 열만 수정한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `setMarkerEdit`: 값이 바뀌면 키가 생기고, 원래 값으로 되돌리면 키가 사라진다 / `queueOps` 누적. `applyDraftToMarkers`: 이름·좌표 수정이 반영 / 대표 지정 뒤 분리를 연속 큐에 넣어도(두 번째 계획은 첫 번째 결과 기준) 최종 상태가 맞다 / **삭제한 마커는 결과에서 빠지고 그 마커의 필드 수정은 `countChanges`에서도 제외**(Review Focus 3). `validateDraft`: 이름이 빈 값이면 이슈 / 위도 32.9·39.1, 경도 123.9·132.1은 이슈 / 위도만 있고 경도가 `null`이면 이슈, 둘 다 `null`이면 통과(Review Focus 2) / 날짜 `2026-13-01`·`2026/01/01`은 이슈, 빈 값과 `2026-01-31`은 통과 / 태그는 문자열 배열.
- [ ] **Step 2: 실패를 확인한다.** FAIL.
- [ ] **Step 3: 구현한다.** 날짜는 형식과 실제 달력 날짜를 함께 확인한다.
- [ ] **Step 4: 통과를 확인한다.** PASS, `npx tsc --noEmit` 통과.
- [ ] **Step 5: Commit** (요청 시) — `feat: 수정 변경분 모델과 입력 검증을 추가한다`

---

### Task 8: 정보 행 조회와 변경분 저장

**Files:**
- Create: `src/features/group-admin/lib/info-rows.ts`, `src/features/group-admin/lib/save-draft.ts`, `src/features/group-admin/lib/save-draft.test.ts`

**Interfaces:**
- Consumes: Task 2의 `applyMarkerOps`, `MarkerOp`. Task 7의 `EditDraft`, `InfoRecord`
- Produces: `fetchInfoRows(supabase: SupabaseBrowserClient, markerIds: string[]): Promise<InfoRecord[]>`(100개씩 나눠 `.in("marker_id", …)`)
- Produces: `saveDraft(supabase: SupabaseBrowserClient, draft: EditDraft, infoRows: InfoRecord[]): Promise<SaveResult>`, `SaveResult = { savedMarkerIds: string[]; savedInfoIds: number[]; completedOps: number; error: { message: string; step: "marker" | "info" | "ops" } | null }`
- 저장 순서: ① 마커 수정(열 이름 변환: `facilityTeam→facility_team`, `roadAddress→road_address`, `jibunAddress→jibun_address`, `facilityCode→facility_code`) → ② 정보 수정 → ③ `ops`(삭제는 뒤로 옮긴 안정 정렬). **국소명을 고치면 그 마커의 정보 행 `place_name`도, 통합시설코드를 고치면 `facility_code`도 함께 쓴다.** 삭제한 마커의 필드·정보 수정은 건너뛴다. 실패하면 거기서 멈추고 `SaveResult`에 어디까지 저장됐는지 담는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다(가짜 Supabase로 호출을 기록).** 호출 순서가 `markers.update → information.update → markers.update(구분) → markers.delete` / 국소명 수정이 `markers.name`과 해당 정보 행 `place_name`을 모두 쓴다 / 코드 수정이 `facility_code`를 두 테이블에 쓴다 / 삭제한 마커의 수정은 호출되지 않는다 / 두 번째 정보 수정이 실패하면 `savedMarkerIds`에는 앞의 것만, `error.step === "info"` / **저장된 항목만 돌려주므로 호출자가 그것을 뺀 변경분으로 다시 저장하면 이미 저장된 항목을 다시 쓰지 않는다**(Review Focus 4) / `fetchInfoRows`가 250개 ID를 3번에 나눠 조회.
- [ ] **Step 2: 실패를 확인한다.** FAIL.
- [ ] **Step 3: 구현한다.** 마커별 `update(patch).eq("id", id)`는 한 번에 몇 건씩 병렬로 나가게 하되 오류는 첫 오류로 멈춘다.
- [ ] **Step 4: 통과를 확인한다.** PASS, `npx tsc --noEmit` 통과.
- [ ] **Step 5: Commit** (요청 시) — `feat: 정보 행 조회와 변경분 저장을 추가한다`

---

### Task 9: 그룹관리 패널과 지도 표시

**Files:**
- Create: `src/features/group-admin/components/group-panel.tsx`, `src/features/group-admin/hooks/use-marker-groups.ts`
- Modify: `src/features/map-marker/store/use-map-marker-store.ts`, `src/features/map-marker/lib/select-active-markers.ts`, `src/features/map-marker/lib/select-active-markers.test.ts`, `src/features/map-marker/hooks/use-marker-list.ts`, `src/features/shell/components/panel-body.tsx`, `src/features/map-marker/store/use-map-marker-store.test.ts`

**Interfaces:**
- Produces(store): `selectedGroupKeys: string[]`, `toggleGroupKey(key: string): void`, `setGroupKeys(keys: string[]): void`(persist 하지 않는다). `setActiveNav("groups")`는 모드를 `location`으로 둔다.
- Produces: `ActiveMarkerSources.groupAdminMarkerIds: string[] | null` — 값이 있고 모드가 `location`이면 **장비 마커 중 그 ID만(숨은 SUB 포함)** 돌려준다. 이때 목록 색상 표시는 쓰지 않는다.
- Produces: `useMarkerGroups(): MarkerGroup[]`(`useMapMarkersQuery`의 장비 마커로 `buildMarkerGroups`, 메모이즈)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `select-active-markers.test.ts`: `groupAdminMarkerIds`가 있으면 그 장비 마커만(SUB 포함) / 좌표가 null이어도 목록에서는 돌려준다 / `null`이면 기존 위치 목록 동작 그대로. 스토어 테스트: `setActiveNav("groups")`가 `mode === "location"`, `toggleGroupKey` 켜고 끔. (스토어 테스트 파일에는 이미 `localStorage` 대역이 있다.)
- [ ] **Step 2: 실패를 확인한다.** FAIL.
- [ ] **Step 3: 구현한다.** `use-marker-list.ts`는 `activeNav === "groups"`일 때 선택한 묶음의 마커 ID를 `groupAdminMarkerIds`로 넘기고, 아니면 `null`. `panel-body.tsx`의 `ComingSoon`을 `dynamic` 지연 로딩한 `GroupPanel`로 바꾼다. 패널: 검색·필터(`GroupFilters`, 좌표 없음·중복 의심 토글), 묶음 목록(체크박스, 마커 수, 대표 국소명, 좌표 없음 표시), 상단 **[전체 화면 관리]**·선택 시 **[일괄 수정]**(둘 다 이 태스크에서는 버튼과 열림 상태만 만든다), 하단 안내 문구는 Task 15에서 넣는다. 목록이 길어 200건 단위로 "더 보기"를 둔다.
- [ ] **Step 4: 통과를 확인한다.** `npx vitest run`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`.
- [ ] **Step 5: 화면 확인.** 가짜 로그인(관리자)·가짜 DB로 그룹관리 메뉴를 열어 목록, 체크 시 지도 표시, 필터를 확인한다. 같은 가짜 로그인에서 `app_admins`를 비우면 메뉴가 사라지는지도 확인한다(Review Focus 5).
- [ ] **Step 6: Commit** (요청 시) — `feat: 그룹관리 패널과 지도 표시를 추가한다`

---

### Task 10: 관리 창(표 수정과 저장)

**Files:**
- Create: `src/features/group-admin/components/group-manage-dialog.tsx`, `src/features/group-admin/components/group-table.tsx`, `src/features/group-admin/hooks/use-edit-draft.ts`
- Modify: `src/features/map-marker/store/use-map-marker-store.ts`(`groupManageKey: string | null`, `lastGroupManageKey: string | null`), `src/features/group-admin/components/group-panel.tsx`

**Interfaces:**
- Consumes: Task 6~8 전체. Produces: `useEditDraft(markers: EquipmentMarker[])`가 `{ draft, workingMarkers, infoRows, setMarker, setInfo, queue, discard, save, isSaving, issues }`를 돌려준다. `save()`는 저장된 항목을 변경분에서 빼고 `invalidateQueries`로 마커 조회를 새로 읽는다.

- [ ] **Step 1: 구현한다.** 왼쪽 묶음 목록(패널과 같은 필터), 오른쪽 표(열: 구분, 국소명, 통합시설코드, 사업연도, 사업구분, 시설일, 개통일, 주소, 좌표). 셀은 `whitespace-nowrap`, 표 박스는 가로 스크롤 없이 창 폭에 맞추고 세로 스크롤만 둔다. 바뀐 칸은 강조하고, 검증 이슈가 있으면 해당 칸에 표시하며 저장 버튼을 막는다. 상단에 변경 건수, **[저장]**, **[변경 취소]**. 창을 닫을 때 변경분이 있으면 확인한다. 저장이 실패하면 `SaveResult`로 어디까지 저장됐는지 알리고 남은 변경은 유지한다.
- [ ] **Step 2: 화면 확인(가짜 DB).** 국소명·시설일 수정 → 저장 시 가로챈 요청이 `markers`·`information`에 가고 `place_name`이 함께 가는지, 잘못된 날짜가 저장을 막는지, 저장 실패를 흉내 내(두 번째 요청을 500으로) 실패 안내와 남은 변경 유지를 확인한다. `.tsx`라 vitest로는 확인되지 않음을 전제한다.
- [ ] **Step 3: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 통과.**
- [ ] **Step 4: Commit** (요청 시) — `feat: 그룹관리 관리 창에서 표로 수정하고 저장한다`

---

### Task 11: 마커 정리 동작(대표·단독·분리·합치기·삭제)

**Files:**
- Create: `src/features/group-admin/components/group-actions-bar.tsx`, `src/features/group-admin/components/confirm-dialog.tsx`
- Modify: `src/features/group-admin/components/group-manage-dialog.tsx`, `src/features/group-admin/components/group-table.tsx`

**Interfaces:**
- Consumes: Task 3~4 계획 함수, Task 7 `queueOps`/`applyDraftToMarkers`. 계획은 **`workingMarkers`(변경분이 반영된 상태)** 를 기준으로 세워 앞 변경 위에 이어 쌓는다.

- [ ] **Step 1: 구현한다.** 표 행 체크박스 + 동작 모음: **대표로 지정**(체크 1개), **단독으로**, **분리**(체크한 마커 → `planSeparate`, 라벨은 `getMarkerDongLabel`), **합치기**(여러 묶음 선택 시 `planMergeGroups`, 한 묶음의 분리 상태 해제는 `planMergeSplitToLot`), **삭제**. 동작은 즉시 DB에 쓰지 않고 `queueOps`로 변경분에 쌓으며 `notice`를 표 위에 보여 준다. 삭제와 합치기는 확인 창을 거치고, **삭제 확인에는 건수·국소명(최대 10개 + 나머지 수)과 "되돌릴 수 없습니다. 삭제 전에 백업을 받아 두세요"를 넣는다.** 대표를 지우는데 남는 마커가 있으면 새 대표가 누구인지 미리 보여 준다.
- [ ] **Step 2: 화면 확인(가짜 DB).** 대표 삭제 후 저장하면 `delete`가 마지막에 가고 새 대표 `update`가 포함되는지, 대표 지정 → 분리를 연속으로 쌓아도 표에 최종 상태가 보이는지, 저장 전 취소가 되는지 확인한다.
- [ ] **Step 3: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 통과.**
- [ ] **Step 4: Commit** (요청 시) — `feat: 그룹관리에서 대표·분리·합치기·삭제를 변경분으로 쌓는다`

---

### Task 12: 위치 수정

**Files:**
- Modify: `src/features/group-admin/components/group-manage-dialog.tsx`, `src/features/group-admin/components/group-panel.tsx`, `src/features/map-marker/store/use-map-marker-store.ts`

**Interfaces:**
- Consumes: Task 10의 `groupManageKey`/`lastGroupManageKey`. 지도 드래그는 기존 `kakao-map-canvas.tsx`의 `dragend` 동작(확인 창 → `markers` 위치 저장)을 **그대로** 쓴다. 이 동작은 변경분을 거치지 않고 바로 저장된다.

- [ ] **Step 1: 구현한다.** 표의 좌표 칸에서 위도·경도를 직접 입력한다(변경분 + 검증). **[지도에서 위치 잡기]**는 `lastGroupManageKey`를 남기고 관리 창을 닫아 지도가 보이게 하며, 패널에 "방금 보던 묶음 다시 열기" 버튼을 둔다. 지도에서 드래그해 저장되면 마커 조회가 새로 읽히고, 다시 연 관리 창은 새 좌표를 보여 준다. 좌표 없음 필터로 좌표 없는 마커를 골라 이 흐름으로 채울 수 있다.
- [ ] **Step 2: 화면 확인(가짜 DB).** 좌표 입력 → 저장 요청 확인, 지도에서 위치 잡기 → 창이 닫히고 되돌아와 다시 열 수 있는지, 좌표가 null인 마커가 지도에는 나오지 않고 표에는 보이는지 확인한다(Review Focus 2).
- [ ] **Step 3: `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test` 통과.**
- [ ] **Step 4: Commit** (요청 시) — `feat: 그룹관리에서 좌표 입력과 지도 위치 잡기를 지원한다`

---

### Task 13: 일괄 수정

**Files:**
- Create: `src/features/group-admin/lib/bulk-edit.ts`, `src/features/group-admin/lib/bulk-edit.test.ts`, `src/features/group-admin/components/group-bulk-dialog.tsx`
- Modify: `src/features/group-admin/components/group-panel.tsx`

**Interfaces:**
- Consumes: Task 7의 `setMarkerEdit`, `setInfoEdit`. Produces: `planBulkEdit(draft: EditDraft, markers: EquipmentMarker[], infoRows: InfoRecord[], values: BulkValues): EditDraft`, `BulkValues = { businessType?: string; facilityTeam?: string; color?: string; addTags?: string[]; removeTags?: string[] }`(정의된 항목만 적용)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 사업구분은 선택한 마커의 **모든** 정보 행에 적용 / 담당팀·색상은 마커 수정으로 / 태그는 추가·제거가 기존 태그를 보존하고 중복을 만들지 않는다 / 값이 이미 같은 마커는 변경분에 들어가지 않는다 / 정의되지 않은 항목은 건드리지 않는다 / 정보 행이 없는 마커에 사업구분을 적용하면 건너뛰고 건너뛴 수를 돌려준다.
- [ ] **Step 2: 실패를 확인한다.** FAIL.
- [ ] **Step 3: 구현한다.** 대화상자는 대상 건수와 바뀔 값을 보여 주고 **[변경분에 반영]**을 누르면 변경분에만 쌓는다(바로 저장하지 않는다). 저장은 관리 창의 **[저장]**과 같은 경로를 쓴다.
- [ ] **Step 4: 통과를 확인한다.** PASS, 화면 확인(가짜 DB: 여러 묶음 선택 → 일괄 수정 → 저장 요청), `npx tsc --noEmit`, `npx eslint . --max-warnings=0`.
- [ ] **Step 5: Commit** (요청 시) — `feat: 그룹관리에 일괄 수정을 추가한다`

---

### Task 14: 안내 문구와 문서 갱신

**Files:**
- Modify: `src/features/group-admin/components/group-manage-dialog.tsx`, `docs/Ver_3.0/Ver_3.0_계획.md`, `docs/Ver_3.0/Ver_3.0_그룹관리_구현.md`, `AGENTS.md`

- [ ] **Step 1: 관리 창 상단에 안내를 넣는다.** "위치등록의 [기존 N건 갱신]은 국소명과 상세 정보를 파일 값으로 다시 씁니다. 여기서 고친 값이 다음 업로드 때 되돌아갈 수 있습니다."
- [ ] **Step 2: 문서를 고친다.** 계획서 12장의 "아직 구현하지 않았다"를 구현 완료로 바꾸고, 구현 문서 상단 상태와 **스펙에서 줄인 부분(개별 표시 함수는 옮기지 않음)** 을 적는다. `AGENTS.md`의 features 목록에 `group-admin`을 더한다.
- [ ] **Step 3: 인코딩을 확인한다.** `grep -lP "\xEF\xBF\xBD"`로 깨진 글자가 없음을 확인한다.

### Task 15: 최종 검증

- [ ] **Step 1: 개발 서버를 멈춘다**(`netstat -ano | grep :3000`로 확인 후 종료). 그다음 `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npm test`, `npx next build`를 실행한다. 기대: 모두 통과, 홈 First Load JS **295 kB 이하**.
- [ ] **Step 2: 개발 서버를 다시 띄운다.** `npm run dev`.
- [ ] **Step 3: 가짜 로그인·가짜 DB로 전체 흐름을 확인한다.** 관리자일 때 메뉴 보임, 일반 사용자일 때 메뉴 없음, 패널 목록·필터·지도 표시, 표 수정 저장, 대표 삭제 후 새 대표, 좌표 입력, 일괄 수정, 모바일 시트에서 패널 동작. 가로 넘침이 없는지도 본다.
- [ ] **Step 4: 사용자에게 확인을 요청한다.** 실제 DB 저장·삭제는 **백업을 받은 뒤** 직접 확인하도록 안내하고, 확인하지 못한 것(실제 저장, 권한, 실제 휴대폰)을 그대로 보고한다.
- [ ] **Step 5: Commit** (요청 시) — `docs: 그룹관리 구현 문서와 안내를 갱신한다`

---

## 스펙 대응표

| 스펙 항목 | 태스크 |
|---|---|
| 관리자 전용(메뉴 숨김, 공용 훅) | 1 |
| 상세 화면 로직을 공용 함수로 | 2, 3, 4, 5 |
| 패널(검색·필터·목록·지도 표시) | 6, 9 |
| 관리 창(표 수정, 저장, 변경 취소) | 7, 8, 10 |
| 정리 동작(대표·단독·분리·합치기·삭제) | 3, 4, 11 |
| 위치 수정(좌표 입력, 지도에서 잡기) | 12 |
| 일괄 수정 | 13 |
| 안내 문구, 문서 | 14 |
| 검증, 번들 | 15 |
| 개별 표시 함수 이동 | **하지 않음**(새 화면이 쓰지 않아 제외, Task 5·14에 기록) |
